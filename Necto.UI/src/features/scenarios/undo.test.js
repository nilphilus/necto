import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, ref } from 'vue'
import { useScenarios } from './useScenarios.js'
const scenario={version:1,id:'saved',name:'Saved flow',steps:[{operationKey:'GET /x',apiId:'local',name:'x',method:'GET',path:'/x',fields:{},body:'',bindings:[],timeout:1234,responseLimitMiB:1}]}
function setup(t,options){
 const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}
 globalThis.localStorage=storage
 const configuration=ref({openApiUrl:'https://example.test/openapi.json'}),key='necto:scenarios:'+configuration.value.openApiUrl
 storage.setItem(key,JSON.stringify({version:1,scenarios:[scenario]}))
 const scope=effectScope();let store;scope.run(()=>store=useScenarios(configuration,options));t.after(()=>scope.stop())
 return {store,storage,configuration,key}
}
test('Undo restores the exact saved definition, not its run',t=>{
 const {store,storage,key}=setup(t);store.runs.set(scenario.id,{status:'completed'})
 store.remove(scenario.id);assert.equal(store.scenarios.value.length,0);assert.equal(store.deleted.value.name,scenario.name)
 store.undoRemove();assert.deepEqual(JSON.parse(storage.getItem(key)).scenarios,[scenario]);assert.equal(store.runs.size,0);assert.equal(store.pending.value,false);assert.equal(store.deleted.value,null)
})
test('Undo is scoped to workspace and expires',async t=>{
 const {store,configuration}=setup(t,{undoDuration:10});store.remove(scenario.id)
 configuration.value={openApiUrl:'https://other.test/openapi.json'};store.undoRemove();await nextTick()
 assert.equal(store.scenarios.value.length,0);assert.equal(store.deleted.value,null)
 configuration.value={openApiUrl:'https://example.test/openapi.json'};await nextTick()
 store.scenarios.value=[scenario];store.remove(scenario.id);await new Promise(r=>setTimeout(r,25));assert.equal(store.deleted.value,null);assert.equal(store.undoRemove(),undefined)
})
test('failed persistence keeps Undo retryable and does not overwrite conflicts',t=>{
 const {store,storage}=setup(t);store.remove(scenario.id)
 const write=storage.setItem;storage.setItem=()=>{throw new Error('quota')}
 assert.throws(()=>store.undoRemove(),/Could not save/);assert.ok(store.deleted.value)
 storage.setItem=write;store.scenarios.value=[{...scenario,id:'different'}]
 assert.throws(()=>store.undoRemove(),/overwrite/);assert.ok(store.deleted.value)
 store.scenarios.value=[];store.undoRemove();assert.equal(store.scenarios.value.length,1)
})
