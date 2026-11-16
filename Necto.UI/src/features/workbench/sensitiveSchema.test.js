import test from 'node:test'
import assert from 'node:assert/strict'
import { readOperations } from '../api-catalog/catalog.js'
import { buildRequest } from '../request-runner/request.js'
import { requestSnippet } from './snippets.js'
import { retainDraft, redactSchema } from './sensitiveSchema.js'
import { snapshotScenario } from '../scenarios/scenario.js'
import { createCiBundle } from './ciBundle.js'
import { useRequestHistory } from './history.js'
const nested={type:'object',properties:{name:{type:'string'},note:{type:'string'}},'x-necto-sensitive-properties':['note']}
const schema={type:'object',properties:{reference:{type:'string'},code:{type:'string'},contact:nested,items:{type:'array',items:nested}},'x-necto-sensitive-properties':['code']}
const spec={openapi:'3.1.0',paths:{'/input':{post:{operationId:'Input',requestBody:{content:{'application/json':{schema}}},responses:{200:{content:{'application/json':{schema}}}}}}}}
const operation=readOperations(spec)[0]
const data={reference:'INV-42',code:'PRIVATE-CODE',contact:{name:'Alice',note:'<xml>PRIVATE-NOTE</xml>'},items:[{name:'Bob',note:'PRIVATE-ITEM'}]}
const draft=()=>({fields:{},body:JSON.stringify(data),bindings:[]})
const configuration={openApiUrl:'https://api.example/openapi.json'}
test('metadata omits nested and array fields while preserving the original live request',()=>{
 const session=draft(),request=buildRequest(operation,configuration,session)
 assert.match(request.options.body,/PRIVATE-CODE/)
 const safe=retainDraft(operation,session)
 assert.deepEqual(JSON.parse(safe.body),{reference:'INV-42',contact:{name:'Alice'},items:[{name:'Bob'}]})
 assert.match(session.body,/PRIVATE-NOTE/);assert.doesNotMatch(requestSnippet(request),/PRIVATE-/)
})
test('new scenario snapshots and CI export omit declared sensitive values',()=>{
 const saved=snapshotScenario([{operation,session:draft()}],'safe')
 assert.doesNotMatch(JSON.stringify(saved),/PRIVATE-/)
 const legacy=snapshotScenario([{operation:{...operation,requestBody:undefined},session:draft()}],'legacy')
 assert.match(JSON.stringify(legacy),/PRIVATE-/)
 assert.doesNotMatch(JSON.stringify(createCiBundle(legacy,spec,[],true).scenario),/PRIVATE-/)
})
test('history masks annotated response fields and omits request values without changing live response',()=>{
 const history=useRequestHistory(),session=draft(),result={status:200,contentType:'application/json',json:data,text:JSON.stringify(data)}
 history.add(operation,buildRequest(operation,configuration,session),result,'',session)
 assert.doesNotMatch(JSON.stringify(history.entries),/PRIVATE-/)
 assert.equal(history.entries[0].payload.code,'[redacted]');assert.equal(result.json.code,'PRIVATE-CODE')
})
test('schema references and union variants redact conservatively',()=>{
 const resolve=value=>value?.$ref==='nested'?nested:value
 const model={allOf:[schema,{properties:{extra:{$ref:'nested'}}}]}
 const value={...data,extra:{name:'Demo',note:'PRIVATE-EXTRA'}}
 assert.doesNotMatch(JSON.stringify(redactSchema(value,model,resolve)),/PRIVATE-/)
})
test('retention fails closed on deep payloads instead of silently truncating saved bodies',()=>{
 let value={code:'PRIVATE-DEEP'}
 const recursive={type:'object','x-necto-sensitive-properties':['code'],properties:{}}
 recursive.properties.child=recursive
 for(let i=0;i<70;i++)value={child:value}
 const op={...operation,requestBody:{content:{'application/json':{schema:recursive}}}}
 assert.throws(()=>retainDraft(op,{body:JSON.stringify(value)}),/safely retain/)
})
test('opaque responses with sensitive JSON metadata are not retained as unredacted text',()=>{
 const history=useRequestHistory(),session=draft()
 history.add(operation,buildRequest(operation,configuration,session),{status:200,contentType:'text/plain',text:'PRIVATE-OPAQUE'},'',session)
 assert.doesNotMatch(JSON.stringify(history.entries),/PRIVATE-/)
})

test('unstructured payloads are masked in default code export when metadata declares sensitive fields',()=>{
 const request={url:new URL('https://api.example/input'),options:{method:'POST',headers:new Headers({'Content-Type':'application/xml'}),body:'<code>PRIVATE-XML</code>'},bodyPolicy:{schema,resolve:value=>value}}
 assert.doesNotMatch(requestSnippet(request),/PRIVATE-/)
 assert.equal(request.options.body,'<code>PRIVATE-XML</code>')
})
