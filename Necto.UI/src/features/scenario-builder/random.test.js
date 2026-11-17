import test from 'node:test'
import assert from 'node:assert/strict'
import { pickRandom,randomIndex } from './random.js'
import { newBlueprint,newStep,layers,validateBlueprint } from './model.js'
import { prepareBlueprint,executeBlueprint } from './runner.js'
import { savedBlueprint } from './useBuilder.js'
import { parseShared,serializeShared } from '../scenario-folder/format.js'
import { removeStepDraft,restoreStepDraft } from './stepUndo.js'
const source={source:'random',stepId:'list',responsePointer:'/items',itemPointer:'/id'}
const operation=id=>({key:'GET /'+id,apiId:'local',path:'/'+id,method:'GET',name:id,parameters:[{in:'query',name:'id',schema:{type:'integer'}}],servers:[],resolve:v=>v})
const make=()=>({...newBlueprint(),steps:['list','one','two'].map(id=>({...newStep(operation(id),{fields:{},body:''}),id}))})
const context={operations:['list','one','two'].map(operation),configuration:{apiBaseUrl:'https://example.invalid'},createSession:()=>({fields:{},body:''}),valuesFor:()=>new Map()}
const randomInput=()=>({...source,location:'query',name:'id'})
const success=json=>({ok:true,status:200,json})
test('uniform integer sampling covers endpoints, rejects modulo bias and has a bounded retry count',()=>{
 assert.equal(randomIndex(1,w=>w[0]=0xffffffff),0)
 assert.equal(randomIndex(3,w=>w[0]=0),0);assert.equal(randomIndex(3,w=>w[0]=2),2)
 let calls=0;assert.equal(randomIndex(3,w=>w[0]=++calls===1?0xffffffff:1),1);assert.equal(calls,2)
 calls=0;assert.throws(()=>randomIndex(3,w=>{calls++;w[0]=0xffffffff}),/random index/);assert.equal(calls,16)
 for(const n of [0,-1,0.5,2**32,NaN])assert.throws(()=>randomIndex(n))
})
test('picks a root or nested array item and returns a typed field or whole object',()=>{
 assert.equal(pickRandom({items:[{id:7},{id:42}]},source,()=>1),42)
 assert.deepEqual(pickRandom([{id:7}],{responsePointer:'',itemPointer:''},()=>0),{id:7})
 assert.equal(pickRandom({items:[false,true]},{responsePointer:'/items',itemPointer:''},()=>0),false)
 assert.equal(pickRandom({items:[{nested:{'a/b':[9]}}]},{responsePointer:'/items',itemPointer:'/nested/a~1b/0'},()=>0),9)
})
test('fails closed for empty/non-array/missing paths, unsafe pointers and invalid indices',()=>{
 for(const json of [{items:[]},{items:{}},{items:null},{},undefined])assert.throws(()=>pickRandom(json,source))
 assert.throws(()=>pickRandom({items:[{}]},source,()=>0))
 assert.throws(()=>pickRandom({items:[{}]},{...source,itemPointer:'/constructor'},()=>0))
 for(const n of [-1,1,NaN,0.5])assert.throws(()=>pickRandom({items:[{}]},source,()=>n))
})
test('v7 gates random inputs and variables, adds dependencies and rejects cycles and missing producers',()=>{
 const b=make();b.steps[1].inputs=[randomInput()];validateBlueprint(b)
 assert.deepEqual(layers(b).map(items=>items.map(item=>item.id)),[['list','two'],['one']])
 assert.throws(()=>validateBlueprint({...b,version:6}),/version 7/)
 b.steps[0].inputs=[{...randomInput(),stepId:'one'}];assert.throws(()=>validateBlueprint(b),/cycle/)
 b.steps[0].inputs=[];b.steps[1].inputs[0].stepId='missing';assert.throws(()=>validateBlueprint(b),/dependency/)
 b.steps[1].inputs=[];b.variables=[{...source,id:'chosen',name:'chosen'}];assert.throws(()=>validateBlueprint({...b,version:6}),/version 7/)
 b.variables[0].stepId='missing';assert.throws(()=>validateBlueprint(b),/existing/)
})
test('serialization and shared import retain selection definition only; removal and undo preserve source',()=>{
 const b=make();b.steps[1].inputs=[{...randomInput(),runtimeChoice:'PRIVATE_CHOICE'}];b.variables=[{...source,id:'chosen',name:'chosen',runtimeValue:'PRIVATE_CHOICE'}]
 const saved=savedBlueprint(b);assert.equal(saved.version,7);assert.ok(!JSON.stringify(saved).includes('PRIVATE_CHOICE'));assert.deepEqual(parseShared(serializeShared('builder',b)).scenario,saved)
 const removed=removeStepDraft(b,'list');assert.equal(removed.next.steps[0].inputs.length,0);assert.deepEqual(restoreStepDraft(removed.next,removed.snapshot).steps[1].inputs,b.steps[1].inputs)
})
test('shared random variable selects once for parallel consumers, including expression bindings',async()=>{
 const b=make();b.variables=[{...source,itemPointer:'',id:'chosen',name:'chosen'}]
 b.steps[1].inputs=[{source:'expression',location:'query',name:'id',expression:'return selected.id;',bindings:[{name:'selected',source:'variable',variableId:'chosen'}]}]
 b.steps[2].inputs=[{source:'variable',location:'query',name:'id',variableId:'chosen'}]
 const plan=prepareBlueprint(b,context);let picks=0
 const result=await executeBlueprint(plan,{signal:new AbortController().signal,pick:(json,source)=>{picks++;return pickRandom(json,source,()=>1)},execute:async(op,session)=>{
  if(op.path==='/one')assert.equal(session.fields['query:id'],'42')
  if(op.path==='/two')assert.deepEqual(JSON.parse(session.fields['query:id']),{id:42})
  return success({items:[{id:7},{id:42}]})
 }})
 assert.equal(result.status,'completed');assert.equal(picks,1)
})
test('independent inputs choose independently, polling reuses the value, presets suppress sampling',async()=>{
 const b=make();b.steps[1].inputs=[randomInput()];b.steps[2].inputs=[randomInput()];b.connections=[{from:'list',to:'one',waitFor:{pointer:'/ready',valueType:'boolean',value:'true',retryCount:1,intervalMs:100}}]
 let picks=0,attempts=0;const values=[]
 const execute=async(op,session)=>{if(op.path==='/list')return success({items:[{id:7},{id:42}]});if(op.path==='/one'){values.push(session.fields['query:id']);return success({ready:++attempts>1})}return success({ready:true})}
 const plan=prepareBlueprint(b,context);const outcome=await executeBlueprint(plan,{signal:new AbortController().signal,pick:(json,s)=>{picks++;return pickRandom(json,s,()=>0)},sleep:async()=>{},execute})
 assert.equal(outcome.status,'completed');assert.equal(picks,2);assert.deepEqual(values,['7','7'])
 picks=0;attempts=0;const preset=prepareBlueprint(b,{...context,valuesFor:()=>new Map([['query:id','99']])})
 assert.equal((await executeBlueprint(preset,{signal:new AbortController().signal,pick:()=>{picks++;return 1},sleep:async()=>{},execute:async()=>success({ready:true})})).status,'completed');assert.equal(picks,0)
})
test('empty array stops consumer dispatch and cancellation prevents sampling',async()=>{
 const b=make();b.steps[1].inputs=[randomInput()];let calls=[]
 const run=await executeBlueprint(prepareBlueprint(b,context),{signal:new AbortController().signal,execute:async op=>{calls.push(op.path);return success({items:[]})}})
 assert.equal(run.status,'failed');assert.ok(!calls.includes('/one'))
 const controller=new AbortController();controller.abort();let sampled=false
 const canceled=await executeBlueprint(prepareBlueprint(b,context),{signal:controller.signal,pick:()=>{sampled=true},execute:async()=>success({})});assert.equal(canceled.status,'cancelled');assert.equal(sampled,false)
})
