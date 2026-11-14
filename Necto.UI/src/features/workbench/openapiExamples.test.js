import test from 'node:test'
import assert from 'node:assert/strict'
import { mediaExamples, requestExamples, applyRequestExample, draftSnapshot, restoreExampleDraft } from './openapiExamples.js'
const resolve=value=>value?.$ref ? {summary:'Referenced',value:false} : value
const operation={resolve,parameters:[{in:'query',name:'active',example:false},{in:'cookie',name:'session',example:'cookie'}],requestBody:{content:{'application/json':{examples:{empty:{value:null},false:{value:false},ref:{$ref:'#/examples/False'},external:{externalValue:'https://example.test/example.json'}}},'application/xml':{example:'<invoice/>'}}}}
test('examples retain null/false, resolve references and do not fetch external examples',()=>{
 const list=requestExamples(operation)
 assert.equal(list.length,7);assert.equal(list[0].value,null);assert.equal(list[1].value,false);assert.equal(list[2].name,'Referenced')
 assert.equal(list[3].available,false);assert.equal(list.at(-1).available,false)
 assert.deepEqual(mediaExamples({example:false,schema:{examples:[true]}},resolve)[0].value,false)
 assert.equal(mediaExamples({schema:{examples:[null,false]}},resolve).length,2)
 assert.equal(mediaExamples({examples:{external:{externalValue:'https://example.test'}},schema:{example:42}},resolve)[0].available,false)
})
test('choosing examples changes draft only, preserves unrelated fields and is reversible',()=>{
 const result={status:200,json:{id:7}},session={fields:{'query:reference':'keep'},body:'{"unsaved":true}',bindings:[{location:'body'},{location:'query',name:'reference'}],sampleName:'Saved',result}
 const snapshot=draftSnapshot(session), examples=requestExamples(operation)
 applyRequestExample(operation,session,examples[0]);assert.equal(session.body,'null');assert.equal(session.result,result);assert.equal(session.fields['query:reference'],'keep');assert.equal(session.bindings.length,1)
 applyRequestExample(operation,session,examples[1]);assert.equal(session.body,'false')
 applyRequestExample(operation,session,examples.find(x=>x.kind==='parameter'&&x.field==='active'));assert.equal(session.fields['query:active'],'false')
 restoreExampleDraft(session,snapshot);assert.equal(session.body,'{"unsaved":true}');assert.equal(session.sampleName,'Saved');assert.equal(session.exampleKey,undefined);assert.equal(session.result,result)
 assert.throws(()=>applyRequestExample(operation,{...session,pending:true},examples[0]),/running/)
 assert.throws(()=>applyRequestExample(operation,session,examples[3]),/not fetched/)
})
test('form examples populate editors without retaining or fetching file bytes',()=>{
 const op={resolve:value=>value,requestBody:{content:{'multipart/form-data':{schema:{type:'object',properties:{reference:{type:'string'},file:{type:'string',format:'binary'}},required:['file']},example:{reference:'INV-42',file:'https://example.test/file'}}}}}
 const session={fields:{},body:'',bindings:[],binaryFile:new Blob(['old'])};applyRequestExample(op,session,requestExamples(op)[0])
 assert.equal(session.formFields[0].value,'INV-42');assert.equal(session.formFields[1].attachmentRequired,true);assert.deepEqual(session.formFields[1].files,[]);assert.equal(session.binaryFile,undefined)
})
