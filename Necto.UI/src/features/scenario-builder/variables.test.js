import test from 'node:test'
import assert from 'node:assert/strict'
import { newBlueprint, newStep, validateBlueprint } from './model.js'
import { prepareBlueprint, executeBlueprint } from './runner.js'
import { allConnections } from './connections.js'
import { savedBlueprint } from './useBuilder.js'
const op=id=>({key:id,name:id,method:'POST',path:'/'+id,apiId:'local',tags:['Demo'],parameters:[{in:'query',name:'value',schema:{type:'string'}}],resolve:value=>value,servers:[]})
const blueprint=(...ids)=>({...newBlueprint(),steps:ids.map(id=>({...newStep(op(id),{fields:{},body:''}),id}))})
const bind=id=>({source:'variable',variableId:id,location:'query',name:'value'})
const context=data=>({operations:data.steps.map(step=>op(step.id)),configuration:{apiBaseUrl:'https://api.test'},createSession:()=>({fields:{},body:''}),valuesFor:()=>new Map()})
const ok=json=>({ok:true,status:200,json})
const tick=()=>new Promise(resolve=>setImmediate(resolve))

test('parallel consumers and retries share one generated value; next run generates afresh',async()=>{
 const data=blueprint('a','b');data.variables=[{id:'email',name:'customerEmail',source:'generate',generator:'email'}];for(const step of data.steps)step.inputs=[bind('email')]
 data.connections=[{from:null,to:'a',waitFor:{pointer:'/ready',valueType:'boolean',value:'true',retryCount:1,intervalMs:100}}]
 let generated=0
 for(let run=1;run<=2;run++){
  const values=[];let attempts=0
  const result=await executeBlueprint(prepareBlueprint(data,context(data)),{signal:new AbortController().signal,generate:async()=>{await tick();return `email-${++generated}`},sleep:async()=>{},execute:async(operation,session)=>{values.push(session.fields['query:value']);return ok({ready:operation.key==='b'||++attempts===2})}})
  assert.equal(result.status,'completed');assert.equal(values.length,3);assert.deepEqual(new Set(values),new Set([`email-${run}`]))
 }
 assert.equal(generated,2)
})
test('a shared human question is asked once, even for parallel consumers; independent network work proceeds',async()=>{
 const data=blueprint('a','b','independent');data.variables=[{id:'code',name:'approvalCode',source:'human',prompt:'One-time code',valueType:'text'}];data.steps[0].inputs=[bind('code')];data.steps[1].inputs=[bind('code')]
 let asked=0,answer;const calls=[]
 const run=executeBlueprint(prepareBlueprint(data,context(data)),{concurrency:1,signal:new AbortController().signal,ask:async(step,inputs)=>{asked++;assert.equal(inputs[0].name,'approvalCode');return new Promise(resolve=>answer=resolve)},execute:async(operation,session)=>{calls.push([operation.key,session.fields['query:value']]);return ok({})}})
 await tick();assert.equal(asked,1);assert.deepEqual(calls,[['independent',undefined]]);answer(['shared-answer']);assert.equal((await run).status,'completed');assert.deepEqual(calls.slice(1).map(item=>item[1]),['shared-answer','shared-answer']);assert.ok(!JSON.stringify(savedBlueprint(data)).includes('shared-answer'))
})
test('response variable creates source dependencies and captures only the final matching response',async()=>{
 const data=blueprint('producer','a','b');data.variables=[{id:'id',name:'customerId',source:'response',stepId:'producer',responsePointer:'/id'}];data.steps[1].inputs=[bind('id')];data.steps[2].inputs=[bind('id')]
 data.connections=[{from:null,to:'producer',waitFor:{pointer:'/ready',valueType:'boolean',value:'true',retryCount:1,intervalMs:100}}]
 assert.equal(allConnections(data).filter(edge=>edge.from==='producer').length,2);let attempt=0;const calls=[]
 const result=await executeBlueprint(prepareBlueprint(data,context(data)),{signal:new AbortController().signal,sleep:async()=>{},execute:async(operation,session)=>{calls.push(operation.key);if(operation.key==='producer')return ok({ready:++attempt===2,id:attempt});assert.equal(session.fields['query:value'],'2');return ok({})}})
 assert.equal(result.status,'completed');assert.deepEqual(calls,['producer','producer','a','b'])
})
test('typed static JSON is reused without mutations or implicit string coercion in JSON bodies',async()=>{
 const data=blueprint('a','b');data.variables=[{id:'settings',name:'settings',source:'static',valueType:'json',value:'{"enabled":true,"count":2}'}]
 for(const step of data.steps)step.inputs=[{...bind('settings'),location:'body',pointer:'/settings'}]
 const ctx=context(data);for(const operation of ctx.operations)operation.requestBody={content:{'application/json':{}}}
 const result=await executeBlueprint(prepareBlueprint(data,ctx),{signal:new AbortController().signal,execute:async(operation,session)=>{assert.deepEqual(JSON.parse(session.body).settings,{enabled:true,count:2});return ok({})}})
 assert.equal(result.status,'completed')
})
test('unused variables neither generate nor prompt; missing response values fail before sending a consumer',async()=>{
 const data=blueprint('source','target');data.variables=[{id:'unused',name:'unused',source:'human',prompt:'Unused question',valueType:'text'},{id:'id',name:'id',source:'response',stepId:'source',responsePointer:'/missing'}];data.steps[1].inputs=[bind('id')];const calls=[]
 const result=await executeBlueprint(prepareBlueprint(data,context(data)),{signal:new AbortController().signal,ask:()=>assert.fail('Unused prompt'),generate:()=>assert.fail('Unused generator'),execute:async operation=>{calls.push(operation.key);return ok({id:1})}})
 assert.equal(result.status,'failed');assert.deepEqual(calls,['source']);assert.match(result.error,/no value/)
})
test('response-variable cycles, self-dependencies, missing IDs and duplicate names are rejected before execution',()=>{
 const data=blueprint('a','b');data.variables=[{id:'id',name:'id',source:'response',stepId:'a',responsePointer:'/id'}];data.steps[0].inputs=[bind('id')];assert.throws(()=>validateBlueprint(data),/dependency/)
 data.steps[0].inputs=[];data.steps[1].inputs=[bind('id')];data.connections=[{from:'b',to:'a'}];assert.throws(()=>validateBlueprint(data),/cycle/)
 data.connections=[];data.steps[1].inputs=[bind('missing')];assert.throws(()=>validateBlueprint(data),/Unknown shared variable/)
 data.steps[1].inputs=[];data.variables=[{id:'one',name:'Email',source:'static',valueType:'text',value:''},{id:'two',name:'email',source:'static',valueType:'text',value:''}];assert.throws(()=>validateBlueprint(data),/unique/)
})
test('canceling a shared prompt cancels all waiting consumers without sending a request',async()=>{
 const data=blueprint('a','b');data.variables=[{id:'code',name:'code',source:'human',prompt:'Code',valueType:'text'}];for(const step of data.steps)step.inputs=[bind('code')]
 const controller=new AbortController();let asked=0
 const run=executeBlueprint(prepareBlueprint(data,context(data)),{signal:controller.signal,ask:(step,inputs,signal)=>{asked++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))},execute:()=>assert.fail('Must not send')})
 await tick();controller.abort();assert.equal((await run).status,'cancelled');assert.equal(asked,1)
})
test('v4 saves definitions and stable references only; v3 loads, names can change without rebinding',()=>{
 const data=blueprint('a');data.variables=[{id:'stable',name:'email',source:'generate',generator:'email',resolvedValue:'runtime-secret'}];data.steps[0].inputs=[bind('stable')];data.variables[0].name='renamedEmail'
 const saved=savedBlueprint(data);assert.equal(saved.version,4);assert.equal(saved.variables[0].name,'renamedEmail');assert.equal(saved.steps[0].inputs[0].variableId,'stable');assert.ok(!JSON.stringify(saved).includes('runtime-secret'))
 const legacy=blueprint('legacy');legacy.version=3;delete legacy.variables;validateBlueprint(legacy);assert.deepEqual(savedBlueprint(legacy).variables,[])
 legacy.variables=data.variables;assert.throws(()=>validateBlueprint(legacy),/version 4/)
})
