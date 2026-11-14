import {test} from 'node:test'
import assert from 'node:assert/strict'
import {effectScope, ref, nextTick} from 'vue'
import {notifyWorkspaceImport, onWorkspaceImport} from './workspaceUpdates.js'
import {useScenarios} from '../scenarios/useScenarios.js'
import {useExternalApis} from '../external-apis/connections.js'
function storage(t) {
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map()
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}})
 t.after(()=>previous?Object.defineProperty(globalThis,'localStorage',previous):delete globalThis.localStorage)
 return globalThis.localStorage
}
const scenario=(id,name)=>({version:1,id,name,steps:[{operationKey:'GET /x',apiId:'local',name:'x',method:'GET',path:'/x',fields:{},body:'',bindings:[]}]})
test('imports refresh the matching scenario store without resetting unrelated run context',async t=>{
 const store=storage(t),configuration=ref({openApiUrl:'https://api.test/openapi.json'}),key='necto:scenarios:'+configuration.value.openApiUrl
 const old=scenario('old','Existing');store.setItem(key,JSON.stringify({version:1,scenarios:[old]}))
 const scope=effectScope();t.after(()=>scope.stop());let models,notifications=0
 scope.run(()=>{models=useScenarios(configuration);onWorkspaceImport(()=>key,()=>notifications++)})
 models.runs.set('old',{status:'passed'});models.state.id='old';models.state.status='passed'
 store.setItem(key,JSON.stringify({version:1,scenarios:[old,scenario('new','Imported')]}))
 notifyWorkspaceImport(['necto:samples:other']);assert.equal(models.scenarios.value.length,1)
 notifyWorkspaceImport([key]);assert.equal(models.scenarios.value.length,2);assert.equal(models.state.status,'passed');assert.equal(models.runs.get('old').status,'passed')
 await nextTick();scope.stop();notifyWorkspaceImport([key]);assert.equal(notifications,1)
})
test('a multi-connection import reports every changed API identity in one update',async t=>{
 const store=storage(t),configuration=ref({openApiUrl:'https://api.test/openapi.json'}),key='necto:external-apis:'+configuration.value.openApiUrl
 const entry=(id,name)=>({id,name,openApiUrl:`https://${id}.test/openapi.json`,endpointMappingsUrl:`https://${id}.test/mappings`,apiBaseUrl:'',usePresets:false})
 store.setItem(key,JSON.stringify({show:false,connections:[entry('one','One'),entry('two','Two')]}))
 const scope=effectScope();t.after(()=>scope.stop());let apis;scope.run(()=>apis=useExternalApis(configuration));await nextTick()
 store.setItem(key,JSON.stringify({show:false,connections:[entry('one','Renamed One'),entry('two','Renamed Two')]}))
 notifyWorkspaceImport([key]);assert.deepEqual(apis.changedApiIds.value,['one','two']);assert.equal(apis.revision.value,1);assert.equal(apis.connections.value[1].name,'Renamed Two')
})
