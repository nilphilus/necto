import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { readOperations } from '../api-catalog/catalog.js'
import { resolveMappingLinks, useRelatedEndpoints, preferredRelatedChoice } from '../related-endpoints/mappings.js'
const doc={paths:{'/source':{get:{operationId:'Source',responses:{200:{description:'OK',links:{preferred:{operationId:'Detail',description:'Read this invoice.',parameters:{id:'$response.body#/id'}}}},default:{description:'Fallback',links:{fallback:{operationId:'Other',parameters:{id:'$response.body#/id'}}}}}}},'/other/{id}':{get:{operationId:'Other',parameters:[{name:'id',in:'path'}]}},'/details/{id}':{get:{operationId:'Detail',parameters:[{name:'id',in:'path'}]}}}}
const mapping=(target,property='id')=>({source:{operationId:'Source',property},target:{operationId:target,location:'path',name:'id'}})
function setup(t){const ops=readOperations(doc),scope=effectScope();t.after(()=>scope.stop());let related;scope.run(()=>related=useRelatedEndpoints(ref({}),ref(ops),ref([{id:'local',mappings:[mapping('Other'),mapping('Detail'),mapping('Detail','legacyId')]}])));return {related,ops}}
test('explicit OpenAPI target and candidate precede inferred mappings; duplicates keep provenance',t=>{
 const {related,ops}=setup(t),result={ok:true,status:200,json:{id:42,legacyId:99}}
 const targets=related.targetsFor(ops[0],result)
 assert.equal(targets[0].operation.id,'Detail');assert.equal(targets[0].preferred,true);assert.match(targets[0].description,/Read this invoice\./)
 assert.deepEqual(targets[0].candidates.map(x=>x.value),[42,99]);assert.equal(targets[0].candidates[0].origin,'openapi');assert.equal(targets[1].preferred,false)
 const choices=related.choicesFor(ops.find(x=>x.id==='Detail'),'path','id',new Map([[ops[0].key,[result]]]))
 assert.equal(choices[0].origin,'openapi');assert.deepEqual(choices.map(x=>x.value),[42,99])
})
test('unavailable Link values fall back to mappings; default is not preferred over a declared status',t=>{
 const {related,ops}=setup(t)
 const noId=related.targetsFor(ops[0],{ok:true,status:200,json:{legacyId:99}})
 assert.equal(noId[0].preferred,false);assert.equal(noId[0].candidates[0].value,99)
 const error=related.targetsFor(ops[0],{ok:false,status:404,json:{id:42}})
 assert.equal(error.length,1);assert.equal(error[0].operation.id,'Other');assert.equal(error[0].preferred,true)
 assert.equal(related.targetsFor(ops[0],{ok:true,status:200,incomplete:true,json:{id:42}}).length,0)
})
test('ambiguous or overridden Link destinations are not silently executed',()=>{
 const copy=structuredClone(doc);copy.paths['/source'].get.responses[200].links.preferred.server={url:'https://other.test'}
 assert.equal(resolveMappingLinks(readOperations(copy),[]).some(x=>x.to.id==='Detail'),false)
})

test('constant and parameterless Links work without a JSON response; exact statuses override ranges',t=>{
 const copy=structuredClone(doc)
 copy.paths['/source'].get.responses[200].links={constant:{operationId:'Detail',parameters:{id:42}},navigation:{operationId:'Other'}}
 copy.paths['/source'].get.responses['2XX']={description:'Range',links:{range:{operationId:'Detail',parameters:{id:99}}}}
 const ops=readOperations(copy),scope=effectScope();t.after(()=>scope.stop());let related
 scope.run(()=>related=useRelatedEndpoints(ref({}),ref(ops)))
 const targets=related.targetsFor(ops[0],{ok:true,status:200})
 assert.equal(targets.length,2);assert.equal(targets[0].preferred,true);assert.deepEqual(targets[0].candidates.map(x=>x.value),[42]);assert.equal(targets[0].candidates[0].binding,undefined)
 assert.equal(targets[1].preferred,true);assert.deepEqual(targets[1].candidates,[])
 assert.deepEqual(related.selectablePaths(ops[0]),[[]]) // only the default body-pointer link remains selectable
})

test('a constant Link cannot validate a saved binding that previously used a response body',async()=>{
 const { prepareScenario }=await import('../scenarios/scenario.js')
 const copy=structuredClone(doc)
 copy.paths['/create']={post:{operationId:'Create',requestBody:{content:{'application/json':{schema:{type:'object'}}}},responses:{200:{description:'OK'}}}}
 copy.paths['/source'].get.responses[200].links={literal:{operationId:'Create',requestBody:{fixed:42}}}
 const ops=readOperations(copy),source=ops.find(x=>x.id==='Source'),target=ops.find(x=>x.id==='Create')
 const saved={version:1,id:'s',name:'s',steps:[source,target].map((op,index)=>({operationKey:op.key,apiId:'local',name:op.name,method:op.method,path:op.path,fields:{},body:'',bindings:index?[{sourceStep:0,path:[],location:'body',name:null}]:[]}))}
 assert.throws(()=>prepareScenario(saved,{operations:ops,links:resolveMappingLinks(ops,[]),configuration:{openApiUrl:'https://example.test/openapi.json',apiBaseUrl:'https://example.test'},createSession:()=>({}),valuesFor:()=>new Map()}),/mapping.*no longer available/)
})

test('a single declared value is suggested first, but explicit user selection wins',()=>{
 const declared={value:42,origin:'openapi'},extra={value:43,origin:'mapping'}
 assert.equal(preferredRelatedChoice([declared,extra]),declared)
 assert.equal(preferredRelatedChoice([declared,extra],[extra]),extra)
 assert.equal(preferredRelatedChoice([declared,{value:44,origin:'openapi'},extra]),null)
})
