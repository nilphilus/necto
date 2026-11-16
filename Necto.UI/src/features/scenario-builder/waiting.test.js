import test from 'node:test'
import assert from 'node:assert/strict'
import { newBlueprint, newStep, validateBlueprint, parseBlueprint } from './model.js'
import { prepareBlueprint, executeBlueprint } from './runner.js'
import { abortableDelay, expectedValue, validateWaiting, waitMatches } from './waiting.js'
import { savedBlueprint } from './useBuilder.js'

const operation = id => ({ key: id, apiId: 'local', method: 'GET', path: '/' + id, name: id, parameters: [], resolve: value => value, tags: ['Demo'], servers: [] })
const definition = (...ids) => ({ ...newBlueprint(), version: 2, steps: ids.map(id => ({ ...newStep(operation(id), { fields: {}, body: '' }), id })) })
const condition = (overrides = {}) => ({ pointer: '/state', valueType: 'text', value: 'Ready', retryCount: 2, intervalMs: 1000, ...overrides })
const planFor = blueprint => blueprint.steps.map(step => ({ ...step, operation: operation(step.id), session: { fields: {}, body: '{}' }, values: new Map(), dependencies: step.dependsOn, status: 'waiting' }))
const response = json => ({ ok: true, status: 200, elapsed: 2, json })
const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve } }
const tick = () => new Promise(resolve => setImmediate(resolve))

test('Delay is applied once after dependencies, before inputs/human prompts and the first request', async () => {
  const blueprint = definition('start', 'delayed'); blueprint.steps[1].dependsOn = ['start']; blueprint.steps[1].delayMs = 500
  blueprint.steps[1].inputs = [{ source: 'human', location: 'query', name: 'code', prompt: 'Code', valueType: 'text' }]
  const events = []
  const result = await executeBlueprint(planFor(blueprint), { signal: new AbortController().signal, sleep: async ms => events.push('sleep:' + ms), ask: async () => { events.push('ask'); return ['42'] }, execute: async operation => { events.push(operation.key); return response({}) } })
  assert.equal(result.status, 'completed'); assert.deepEqual(events, ['start', 'sleep:500', 'ask', 'delayed'])
})
test('polls until a typed field matches, including missing fields; downstream uses only the matching response', async () => {
  const blueprint = definition('poll', 'child'); blueprint.steps[0].waitFor = condition(); blueprint.steps[1].dependsOn = ['poll']
  blueprint.steps[1].inputs = [{ source: 'response', stepId: 'poll', responsePointer: '/id', location: 'query', name: 'id' }]
  const plan = planFor(blueprint), intervals = [], calls = []; let attempt = 0
  const result = await executeBlueprint(plan, { signal: new AbortController().signal, sleep: async ms => intervals.push(ms), execute: async (operation, session) => {
    calls.push(operation.key)
    if (operation.key === 'child') { assert.equal(session.fields['query:id'], '3'); return response({}) }
    attempt++; return response(attempt === 1 ? { id: 1 } : { id: attempt, state: attempt === 3 ? 'Ready' : 'Pending' })
  } })
  assert.equal(result.status, 'completed'); assert.deepEqual(intervals, [1000,1000]); assert.deepEqual(calls, ['poll','poll','poll','child'])
  assert.deepEqual(plan[0].attempts.map(item => item.matched), [false,false,true]); assert.equal(plan[0].attempt, 3); assert.equal(plan[0].nextAttemptAt, undefined)
})
test('retry count counts retries after the initial attempt; exhaustion keeps the last response and skips dependents', async () => {
  const blueprint = definition('poll','child'); blueprint.steps[0].waitFor = condition({ retryCount: 1 }); blueprint.steps[1].dependsOn = ['poll']
  const plan = planFor(blueprint); let count = 0
  const result = await executeBlueprint(plan, { signal: new AbortController().signal, sleep: async () => {}, execute: async operation => { assert.equal(operation.key, 'poll'); count++; return response({state:'Pending',id:count}) } })
  assert.equal(result.status,'failed'); assert.equal(count,2); assert.match(result.error,/not met after 2 attempts/); assert.equal(plan[0].response.json.id,2); assert.equal(plan[1].status,'skipped')
})
test('zero retries still evaluates the first response and never sleeps afterwards', async () => {
  const blueprint=definition('poll');blueprint.steps[0].waitFor=condition({retryCount:0});let calls=0
  const result=await executeBlueprint(planFor(blueprint),{signal:new AbortController().signal,sleep:()=>assert.fail('No retry timer'),execute:async()=>{calls++;return response({state:'Pending'})}})
  assert.equal(result.status,'failed');assert.equal(calls,1)
})
test('generators, human inputs and initial delay execute once; retries preserve the same request values',async()=>{
  const blueprint=definition('poll');Object.assign(blueprint.steps[0],{delayMs:400,waitFor:condition(),inputs:[{source:'generate',location:'query',name:'reference',generator:'uuid'},{source:'human',location:'query',name:'code',prompt:'Code',valueType:'text'}]})
  let generated=0,asked=0,calls=0;const intervals=[],values=[]
  const result=await executeBlueprint(planFor(blueprint),{signal:new AbortController().signal,sleep:async ms=>intervals.push(ms),generate:async()=>`generated-${++generated}`,ask:async()=>{asked++;return ['one-time-code']},execute:async(op,session)=>{values.push({...session.fields});return response({state:++calls===3?'Ready':'Pending'})}})
  assert.equal(result.status,'completed');assert.equal(generated,1);assert.equal(asked,1);assert.deepEqual(intervals,[400,1000,1000]);assert.deepEqual(values,[values[0],values[0],values[0]])
})
for (const type of ['delay','retry']) test(`cancel during ${type} clears the timer without another request`,async()=>{
  const blueprint=definition('poll','child');blueprint.steps[1].dependsOn=['poll']
  if(type==='delay')blueprint.steps[0].delayMs=600000;else blueprint.steps[0].waitFor=condition({intervalMs:600000})
  const plan=planFor(blueprint),controller=new AbortController();let calls=0
  const run=executeBlueprint(plan,{signal:controller.signal,execute:async()=>{calls++;return response({state:'Pending'})}})
  await tick();assert.equal(plan[0].status,type==='delay'?'delaying':'retry-wait');controller.abort();assert.equal((await run).status,'cancelled');assert.equal(calls,type==='delay'?0:1);assert.equal(plan[1].status,'skipped');assert.equal(plan[0].nextAttemptAt,undefined)
})
test('delays and retry waits release the network slot; resumed polling still respects concurrency',async()=>{
  const blueprint=definition('poll','independent','delayed');blueprint.steps[0].waitFor=condition();blueprint.steps[2].delayMs=200
  const gate=deferred(),events=[];let active=0,peak=0,polls=0
  const run=executeBlueprint(planFor(blueprint),{concurrency:1,signal:new AbortController().signal,sleep:()=>gate.promise,execute:async op=>{
    events.push(op.key);peak=Math.max(peak,++active);await tick();active--;return response({state:op.key==='poll'&&++polls===2?'Ready':'Pending'})
  }})
  await tick();await tick();assert.deepEqual(events,['poll','independent']);gate.resolve();assert.equal((await run).status,'completed');assert.equal(peak,1);assert.ok(events.includes('delayed'))
})
test('HTTP/network errors stop immediately; assertions apply to the final matching response',async()=>{
  const blueprint=definition('poll');blueprint.steps[0].waitFor=condition()
  for(const response of [{ok:false,status:503},null]){
    let count=0;const result=await executeBlueprint(planFor(blueprint),{signal:new AbortController().signal,sleep:()=>assert.fail('Errors must not be retried'),execute:async()=>{count++;return response}})
    assert.equal(result.status,'failed');assert.equal(count,1)
  }
  let count=0
  const result=await executeBlueprint(planFor(blueprint),{signal:new AbortController().signal,sleep:async()=>{},execute:async()=>({...response({state:++count===2?'Ready':'Pending'}),assertions:[{kind:'body',passed:count===2}]})})
  assert.equal(result.status,'completed');assert.equal(count,2)
})
test('response waiting uses exact typed equality, missing is distinct from null, and JSON equality ignores object key order',()=>{
  assert.equal(waitMatches(response({state:'1'}),condition({valueType:'number',value:'1'})),false)
  assert.equal(waitMatches(response({state:1}),condition({valueType:'number',value:'1'})),true)
  assert.equal(waitMatches(response({state:false}),condition({valueType:'boolean',value:'false'})),true)
  assert.equal(waitMatches(response({}),condition({valueType:'json',value:'null'})),false)
  assert.equal(waitMatches(response({state:null}),condition({valueType:'json',value:'null'})),true)
  assert.equal(waitMatches(response({state:{b:[1,2],a:true}}),condition({valueType:'json',value:'{"a":true,"b":[1,2]}'})),true)
  assert.equal(waitMatches(response({state:{a:true,b:[2,1]}}),condition({valueType:'json',value:'{"a":true,"b":[1,2]}'})),false)
  assert.equal(waitMatches(response({state:''}),condition({value:''})),true)
  assert.equal(waitMatches(response(42),condition({pointer:'',valueType:'number',value:'42'})),true)
  assert.throws(()=>waitMatches({ok:true,text:'<state>Ready</state>'},condition()),/JSON response/)
})
test('invalid timing, pointers, retry budgets and expected types are rejected before execution',()=>{
  for(const delayMs of [-1,1.2,600001,'100'])assert.throws(()=>validateWaiting({delayMs}),/Delay/)
  for(const patch of [{retryCount:-1},{retryCount:101},{retryCount:1.5},{intervalMs:0},{intervalMs:600001},{pointer:'/__proto__/id'},{pointer:'state'},{valueType:'number',value:'"1"'},{valueType:'boolean',value:'1'},{valueType:'json',value:'{'},{value:'x'.repeat(16385)}])assert.throws(()=>validateWaiting({waitFor:condition(patch)}))
  assert.throws(()=>expectedValue(condition({valueType:'json',value:'['.repeat(40)+'0'+']'.repeat(40)})),/deeply nested/)
})
test('v2 timing migrates to v4 connections without runtime state; existing v1 definitions load, but cannot smuggle ignored wait policies',()=>{
  const blueprint=definition('poll');Object.assign(blueprint.steps[0],{delayMs:1234,waitFor:condition({valueType:'boolean',value:'true'}),attempt:8,nextAttemptAt:999,attempts:[{status:200}],response:{json:{secret:'runtime-only'}}})
  const saved=savedBlueprint(blueprint),loaded=parseBlueprint(JSON.stringify(saved));assert.equal(loaded.version,4);assert.equal(loaded.connections[0].delayMs,1234);assert.deepEqual(loaded.connections[0].waitFor,blueprint.steps[0].waitFor);assert.ok(!JSON.stringify(saved).includes('runtime-only'));assert.equal(saved.steps[0].attempts,undefined)
  const legacy=definition('a');legacy.version=1;validateBlueprint(legacy);legacy.steps[0].waitFor=condition();assert.throws(()=>validateBlueprint(legacy),/version 2/)
  const operations=[operation('poll')],ctx={operations,configuration:{apiBaseUrl:'https://api.test'},createSession:()=>({fields:{},body:''}),valuesFor:()=>new Map()};const [plan]=prepareBlueprint(loaded,ctx);assert.deepEqual(plan.entryPolicies[0].waitFor,loaded.connections[0].waitFor);assert.equal(plan.entryPolicies[0].delayMs,1234)
})
test('abortable delay rejects already aborted signals and a zero delay completes without a timer',async()=>{
  const controller=new AbortController();await abortableDelay(0,controller.signal);controller.abort(new Error('Stopped'))
  assert.throws(()=>abortableDelay(100,controller.signal),/Stopped/)
})
