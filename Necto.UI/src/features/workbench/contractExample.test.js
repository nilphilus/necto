import {test} from 'node:test'
import assert from 'node:assert/strict'
import {exampleBody, applyContractExample} from './contractExample.js'
test('request examples serialize JSON scalars and preserve text, refusing unsupported bodies',()=>{
 assert.equal(exampleBody('application/json',false),'false')
 assert.equal(exampleBody('application/problem+json','text'),'"text"')
 assert.equal(exampleBody('application/xml','<x/>'),'<x/>')
 assert.throws(()=>exampleBody('multipart/form-data',{file:'x'}),/editors/)
 assert.throws(()=>exampleBody('application/json',undefined),/no JSON/)
})
test('replacement keeps fields and old response, clears body bindings and refuses pending/unknown media',()=>{
 const operation={requestBody:{content:{'application/json':{}}}},session={body:'old',fields:{id:'42'},result:{status:200},bindings:[{location:'body'},{location:'parameter'}],sampleName:'saved'}
 applyContractExample(session,operation,{mediaType:'application/json',value:{name:'new'}})
 assert.equal(JSON.parse(session.body).name,'new');assert.equal(session.fields.id,'42');assert.equal(session.result.status,200);assert.equal(session.resultStale,true);assert.equal(session.bindings.length,1);assert.equal(session.sampleName,undefined)
 assert.throws(()=>applyContractExample({...session,pending:true},operation,{mediaType:'application/json',value:1}),/running/)
 assert.throws(()=>applyContractExample(session,operation,{mediaType:'text/plain',value:'x'}),/no longer/)
})
