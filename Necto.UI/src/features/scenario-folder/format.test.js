import test from 'node:test'
import assert from 'node:assert/strict'
import { newBlueprint,newStep } from '../scenario-builder/model.js'
import { sharedDefinition,serializeShared,parseShared,sharedFileName } from './format.js'
const operation={key:'POST /invoices',apiId:'local',method:'POST',path:'/invoices',name:'Create',parameters:[{in:'header',name:'pin','x-necto-sensitive':true}],resolve:value=>value,requestBody:{content:{'application/json':{schema:{type:'object','x-necto-sensitive-properties':['accountCode']}}}}}
test('shared builder files whitelist definitions and omit recognized and schema sensitive static values',()=>{
 const step=newStep(operation,{fields:{'header:authorization':'auth-secret','header:pin':'pin-secret','query:reference':'INV-42'},body:JSON.stringify({name:'Visible',password:'body-secret',accountCode:'schema-secret',details:{token:'nested-secret'}})})
 step.inputs=[{source:'variable',variableId:'code',location:'body',pointer:'/accountCode'}]
 const source={...newBlueprint(),steps:[step],variables:[{id:'code',name:'code',source:'static',valueType:'text',value:'variable-secret'}],execution:{response:'runtime-secret'}}
 const shared=sharedDefinition('builder',source,[operation]),text=serializeShared('builder',shared)
 for(const secret of ['auth-secret','pin-secret','body-secret','schema-secret','nested-secret','variable-secret','runtime-secret'])assert.ok(!text.includes(secret))
 assert.equal(shared.variables[0].source,'human');assert.equal(shared.steps[0].request.fields['query:reference'],'INV-42');assert.equal(JSON.parse(shared.steps[0].request.body).name,'Visible')
 assert.equal(source.variables[0].value,'variable-secret');assert.ok(source.steps[0].request.body.includes('body-secret'))
 assert.deepEqual(parseShared(text).scenario,shared)
})
test('quick chain canonicalization excludes responses and incidental binding data',()=>{
 const source={version:1,id:'quick',name:'Quick',response:'root-run-data',steps:[{operationKey:'GET /one',apiId:'local',method:'GET',path:'/one',name:'Read',fields:{},body:'',bindings:[],response:{secret:'run-data'}}]}
 const text=serializeShared('chain',source);assert.ok(!text.includes('run-data'));assert.equal(parseShared(text).kind,'chain')
 assert.throws(()=>parseShared('{"format":"other","version":1}'),/Unsupported/)
 assert.throws(()=>parseShared('x'.repeat(2*1024*1024+1)),/2 MiB/)
})
test('managed filenames are stable, readable and cannot collide through path-like IDs',async()=>{
 const a=await sharedFileName('builder',{id:'../../api',name:'Faktury / zespołu'}),b=await sharedFileName('builder',{id:'..api',name:'Faktury / zespołu'})
 assert.ok(!a.includes('/'));assert.match(a,/^builder-faktury-zespo-u-[a-f0-9]{64}\.necto\.json$/);assert.notEqual(a,b)
 assert.equal(await sharedFileName('builder',{id:'../../api',name:'Faktury / zespołu'}),a)
})
test('nested JSON strings and diagnostic assertion/form properties do not leak into shared files',()=>{
 const step=newStep(operation,{fields:{'query:filter':'{"password":"encoded-secret","page":2}'},body:'{}',formFields:[{name:'notes',kind:'text',value:'{"token":"form-secret","label":"ok"}',enabled:true,preview:'runtime-form-data'}]})
 step.request.assertions=[{kind:'equals',path:'/id',expected:'42',actual:'runtime-assertion-data',passed:true}]
 const text=serializeShared('builder',sharedDefinition('builder',{...newBlueprint(),steps:[step]},[operation]))
 for(const secret of ['encoded-secret','form-secret','runtime-form-data','runtime-assertion-data'])assert.ok(!text.includes(secret))
 assert.ok(text.includes('page'));assert.ok(text.includes('label'))
})
test('oversized static bodies are rejected before attempting structured retention',()=>{
 const step=newStep(operation,{fields:{},body:'x'.repeat(2*1024*1024+1)})
 assert.throws(()=>sharedDefinition('builder',{...newBlueprint(),steps:[step]},[operation]),/2 MiB/)
})
