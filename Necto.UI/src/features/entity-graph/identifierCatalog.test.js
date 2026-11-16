import test from 'node:test'
import assert from 'node:assert/strict'
import {catalogUses,catalogPage,validateEntityCatalog} from './identifierCatalog.js'
test('identifier navigation is scoped, unambiguous and paginated',()=>{
 const entry={uses:[{operationId:'Lines',direction:'response',path:['lines',null,'id']}]},local={id:'Lines',apiId:'local',name:'Lines'}
 assert.equal(catalogUses(entry,[local,{id:'Lines',apiId:'remote'}])[0].pathLabel,'lines.[].id')
 assert.equal(catalogUses(entry,[local,{...local}]).length,0)
 const entries=Array.from({length:80},(_,i)=>({name:'Invoice'+i,kind:'identifier'}))
 assert.equal(catalogPage(entries,'invoice',2).items.length,25);assert.equal(catalogPage(entries,'missing').total,0)
})

test('malformed uses fail before rendering',()=>{assert.throws(()=>validateEntityCatalog([{id:"x",name:"x",kind:"model",uses:[{}]}]),/Unsupported/);assert.deepEqual(validateEntityCatalog([]),[])})

test('relations only expose validated targets and remain bounded',async()=>{
 const {catalogRelations}=await import('./identifierCatalog.js')
 const target={id:'model:Customer',kind:'model',name:'Customer'}
 const relation={targetId:target.id,property:'customerId',targetProperty:'id',match:'explicit',explanation:'Customer identifier'}
 assert.equal(catalogRelations({relations:[relation,{}]},[target]).length,1)
 assert.equal(catalogRelations({relations:[relation]},[]).length,0)
})
