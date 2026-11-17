import test from 'node:test'
import assert from 'node:assert/strict'
import { newBlueprint, newStep, dependencies, layers, validateBlueprint, parseBlueprint } from './model.js'
import { allConnections, connectionKey, upgradeBlueprint } from './connections.js'
import { savedBlueprint } from './useBuilder.js'
import { prepareBlueprint, executeBlueprint } from './runner.js'
const op=id=>({key:id,name:id,apiId:'local',path:'/'+id,method:'GET',parameters:[{in:'query',name:'id',schema:{type:'integer'}}],tags:['Demo'],resolve:value=>value,servers:[]})
const blueprint=(...ids)=>({...newBlueprint(),steps:ids.map(id=>({...newStep(op(id),{fields:{},body:''}),id}))})
const ctx=data=>({operations:data.steps.map(step=>op(step.id)),configuration:{apiBaseUrl:'https://api.test'},createSession:()=>({fields:{},body:''}),valuesFor:()=>new Map()})
const condition=overrides=>({pointer:'/state',valueType:'text',value:'Ready',retryCount:2,intervalMs:1000,...overrides})
const ok=json=>({ok:true,status:200,json})

test('v3 derives Start connections and response-binding lines without duplicating explicit connections',()=>{
 const data=blueprint('a','b');assert.deepEqual(allConnections(data).map(edge=>[edge.from,edge.to]),[[null,'a'],[null,'b']])
 data.steps[1].inputs=[{source:'response',stepId:'a',responsePointer:'/id',location:'query',name:'id'}]
 assert.deepEqual(dependencies(data.steps[1],data),['a']);data.connections=[{from:'a',to:'b',delayMs:200}]
 assert.equal(allConnections(data).filter(edge=>edge.to==='b').length,1);assert.equal(allConnections(data).find(edge=>edge.to==='b').delayMs,200);validateBlueprint(data)
})
test('manual connections form branches and joins independently of response bindings',()=>{
 const data=blueprint('a','b','c','join');data.connections=[{from:'a',to:'c'},{from:'b',to:'c'},{from:'c',to:'join'}]
 validateBlueprint(data);assert.deepEqual(layers(data).map(column=>column.map(step=>step.id)),[['a','b'],['c'],['join']])
 assert.notEqual(connectionKey('a','b'),connectionKey('b','a'));assert.notEqual(connectionKey(null,'a'),connectionKey('null','a'))
})
test('invalid/self/duplicate/cyclic connections are rejected, including cycles through inferred bindings',()=>{
 const data=blueprint('a','b')
 for(const edges of [[{from:'a',to:'a'}],[{from:'missing',to:'b'}],[{from:'a',to:'b'},{from:'a',to:'b'}],[{from:'a',to:'b'},{from:'b',to:'a'}]]){data.connections=edges;assert.throws(()=>validateBlueprint(data))}
 data.connections=[{from:'b',to:'a'}];data.steps[1].inputs=[{source:'response',stepId:'a',responsePointer:'/id',location:'query',name:'id'}];assert.throws(()=>validateBlueprint(data),/cycle/)
})
test('migrates v2 timing to one incoming connection, preserving joins, roots, leaves and source request counts',async()=>{
 const legacy=blueprint('a','b','join','leaf');legacy.version=2;delete legacy.connections
 legacy.steps[2].dependsOn=['a','b'];legacy.steps[2].delayMs=300;legacy.steps[2].waitFor=condition();legacy.steps[3].delayMs=400
 const migrated=upgradeBlueprint(legacy);validateBlueprint(migrated)
 assert.equal(migrated.version,7);assert.deepEqual(dependencies(migrated.steps[2],migrated).sort(),['a','b']);assert.equal(migrated.connections.filter(edge=>edge.to==='join'&&edge.waitFor).length,1);assert.equal(migrated.connections.find(edge=>edge.to==='leaf').from,null)
 assert.equal(migrated.steps[2].waitFor,undefined);assert.equal(legacy.steps[2].delayMs,300)
 const plan=prepareBlueprint(legacy,ctx(legacy)),calls=[],sleeps=[];let polls=0
 const result=await executeBlueprint(plan,{signal:new AbortController().signal,sleep:async ms=>sleeps.push(ms),execute:async operation=>{calls.push(operation.key);return ok({state:operation.key==='join'&&++polls<2?'Pending':'Ready'})}})
 assert.equal(result.status,'completed');assert.equal(calls.filter(id=>id==='a').length,1);assert.equal(calls.filter(id=>id==='b').length,1);assert.equal(calls.filter(id=>id==='join').length,2);assert.ok(sleeps.includes(300));assert.ok(sleeps.includes(400))
})
test('edge delay and waiting operate on the target, keep the source response fixed and release its child only after success',async()=>{
 const data=blueprint('source','target','child');data.connections=[{from:'source',to:'target',delayMs:150,waitFor:condition()},{from:'target',to:'child'}]
 data.steps[1].inputs=[{source:'response',stepId:'source',responsePointer:'/id',location:'query',name:'id'}]
 const plan=prepareBlueprint(data,ctx(data)),calls=[],sleeps=[];let attempts=0
 const result=await executeBlueprint(plan,{signal:new AbortController().signal,sleep:async ms=>sleeps.push(ms),execute:async(operation,session)=>{calls.push(operation.key);if(operation.key==='target'){assert.equal(session.fields['query:id'],'42');return ok({state:++attempts===2?'Ready':'Pending'})}return ok({id:42})}})
 assert.equal(result.status,'completed');assert.deepEqual(calls,['source','target','target','child']);assert.deepEqual(sleeps,[150,1000])
})
test('join policies share one target request: largest delay, all conditions on the same response, unmet intervals and individual budgets',async()=>{
 const data=blueprint('a','b','join');data.connections=[{from:'a',to:'join',delayMs:200,waitFor:condition({pointer:'/a',valueType:'boolean',value:'true',retryCount:0})},{from:'b',to:'join',delayMs:500,waitFor:condition({pointer:'/b',valueType:'number',value:'7',intervalMs:2000})}]
 const sleeps=[],calls=[];let attempts=0
 const outcome=await executeBlueprint(prepareBlueprint(data,ctx(data)),{signal:new AbortController().signal,sleep:async ms=>sleeps.push(ms),execute:async operation=>{calls.push(operation.key);return ok(operation.key==='join'?{a:true,b:++attempts===2?7:0}:{})}})
 assert.equal(outcome.status,'completed');assert.deepEqual(calls,['a','b','join','join']);assert.deepEqual(sleeps,[500,2000])
 // A condition that matched once is checked again, not latched permanently.
 attempts=0
 const failed=await executeBlueprint(prepareBlueprint(data,ctx(data)),{signal:new AbortController().signal,sleep:async()=>{},execute:async operation=>ok(operation.key==='join'?{a:++attempts===1,b:attempts===2?7:0}:{})})
 assert.equal(failed.status,'failed');assert.equal(attempts,2);assert.match(failed.error,/a → join/)
})
test('v3 persistence stores policies only on connections, omits runtime state, and round-trips via import',()=>{
 const data=blueprint('a','b');data.connections=[{from:'a',to:'b',delayMs:800,waitFor:condition(),attempt:3,response:ok({secret:'runtime'})}]
 const saved=savedBlueprint(data);assert.equal(saved.version,7);assert.equal(saved.steps[1].delayMs,undefined);assert.equal(saved.connections[0].delayMs,800);assert.equal(saved.connections[0].attempt,undefined);assert.ok(!JSON.stringify(saved).includes('runtime'))
 assert.deepEqual(parseBlueprint(JSON.stringify(saved)),saved)
 data.steps[1].delayMs=10;assert.throws(()=>validateBlueprint(data),/belong to connections/)
 const invalid=blueprint('a');invalid.version=2;invalid.connections=[{from:null,to:'a'}];assert.throws(()=>validateBlueprint(invalid),/version 3/)
})
test('a migrated root policy remains meaningful after adding another incoming connection',()=>{
 const old=blueprint('a','root');old.version=2;old.connections=[];old.steps[1].waitFor=condition()
 const data=upgradeBlueprint(old);data.connections.push({from:'a',to:'root'});validateBlueprint(data)
 const plan=prepareBlueprint(data,ctx(data));assert.deepEqual(plan[1].dependencies,['a']);assert.equal(plan[1].entryPolicies.filter(policy=>policy.waitFor).length,1)
})
