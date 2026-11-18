import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope,ref } from 'vue'
import { useScenarioFolder } from './useScenarioFolder.js'
import { memoryFolder,memoryStorage } from './folderFixture.js'
import { scenarioDirectory } from './directory.js'
import { parseShared,serializeShared } from './format.js'
import { newBlueprint,newStep } from '../scenario-builder/model.js'
const operation={key:'GET /one',apiId:'local',method:'GET',path:'/one',name:'Read',parameters:[],resolve:value=>value}
const draft=()=>({...newBlueprint(),name:'Team workflow',steps:[newStep(operation,{fields:{},body:''})]})
const settle=()=>new Promise(resolve=>setImmediate(resolve))
async function fixture({remembered,permission='granted',supported=true,secure=true}={}){
 const root=remembered??memoryFolder();root.permission=permission
 const storage=memoryStorage(),catalog=ref([operation]),configuration=ref({openApiUrl:'https://api.test/openapi.json'}),locked=ref(false),scope=effectScope();let picked=root,confirmations=0
 const handles={async get(){return remembered},async set(){},async remove(){}}
 const platform={isSecureContext:secure,localStorage:storage,confirm(){confirmations++;return true},...(supported?{showDirectoryPicker:async()=>picked}:{})}
 const folder=scope.run(()=>useScenarioFolder(configuration,catalog,locked,{platform,handles,storage}));await settle()
 return {folder,scope,root,storage,catalog,configuration,locked,get confirmations(){return confirmations},pick:value=>picked=value}
}
test('folder save/import uses document provenance; reload cannot bless a stale draft',async()=>{
 const f=await fixture();try{
 await f.folder.choose();const source=draft(),saved=await f.folder.save('builder',source);assert.ok(saved);assert.equal(source._sharedSource.kind,'builder')
 const directory=await scenarioDirectory(f.root),external=parseShared(directory.files.get(saved.name));external.scenario.name='Changed by teammate';directory.files.set(saved.name,serializeShared('builder',external.scenario))
 source.name='My concurrent edits';assert.equal(await f.folder.save('builder',source),null);assert.match(f.folder.error,/changed on disk/)
 await f.folder.reload();assert.equal(await f.folder.save('builder',source),null);assert.match(f.folder.error,/changed on disk/)
 await f.folder.importEntry(f.folder.entries[0]);assert.equal(await f.folder.save('builder',source),null);assert.match(f.folder.error,/changed on disk/)
 const stored=JSON.parse(f.storage.getItem('necto:scenario-builder:https://api.test/openapi.json')).blueprints[0];assert.equal(stored.name,'Changed by teammate');stored.name='Edited after import';assert.ok(await f.folder.save('builder',stored))
 assert.equal(parseShared(directory.files.get(saved.name)).scenario.name,'Edited after import')
 }finally{f.scope.stop()}
})
test('restoring remembered access does not prompt; reconnect requests permission explicitly',async()=>{
 const root=memoryFolder(),f=await fixture({remembered:root,permission:'prompt'});try{
 assert.equal(f.folder.connected,true);assert.equal(f.folder.ready,false);assert.equal(root.permissionRequests,0)
 root.requestPermission=async()=>{root.permissionRequests++;root.permission='granted';return 'granted'}
 assert.ok(await f.folder.reload());assert.equal(root.permissionRequests,1);assert.equal(f.folder.ready,true)
 await f.folder.disconnect();assert.equal(f.folder.connected,false);assert.equal(root.directories.size,0)
 }finally{f.scope.stop()}
})
test('unsupported browsers can import single files; runs and workspace changes guard writes',async()=>{
 const f=await fixture({supported:false});try{
 assert.equal(f.folder.supported,false);const source=draft();await f.folder.importFile(new Blob([serializeShared('builder',source)]));assert.equal(f.folder.error,'')
 f.locked.value=true;assert.equal(await f.folder.importFile(new Blob([serializeShared('builder',source)])),null);assert.match(f.folder.error,/active requests/)
 }finally{f.scope.stop()}
 const g=await fixture();try{await g.folder.choose();const old=g.catalog.value;g.root.getDirectoryHandle=async()=>{g.configuration.value={openApiUrl:'https://other.test/openapi.json'};await settle();throw new DOMException('Gone','NotFoundError')};await g.folder.save('builder',draft());assert.equal(g.folder.connected,false);assert.equal(g.storage.entries.size,0)}finally{g.scope.stop()}
})
test('single-file import works without secure-context provenance', async () => {
 const f=await fixture({supported:false,secure:false})
 try {
  const source=draft()
  const imported=await f.folder.importFile(new File([serializeShared('builder',source)],'download.json'))
  assert.equal(imported.scenario.id,source.id)
  assert.equal(imported.scenario._sharedSource,undefined)
  assert.equal(f.folder.error,'')
  const saved=JSON.parse(f.storage.getItem('necto:scenario-builder:https://api.test/openapi.json'))
  assert.equal(saved.blueprints[0].id,source.id)
 } finally {f.scope.stop()}
})
test('folder disconnection still works if remembering handles is unavailable',async()=>{
 const storage=memoryStorage(),root=memoryFolder(),scope=effectScope(),folder=scope.run(()=>useScenarioFolder(ref({openApiUrl:'https://api.test/spec'}),ref([operation]),ref(false),{platform:{isSecureContext:true,showDirectoryPicker:async()=>root,confirm:()=>true},storage,handles:{async get(){},async set(){throw new Error('Database denied')},async remove(){throw new Error('Database denied')}}}));await settle()
 try{assert.ok(await folder.choose());assert.equal(folder.remembered,false);assert.ok(await folder.disconnect());assert.equal(folder.connected,false);assert.match(folder.notice,/for this session/)}finally{scope.stop()}
})
test('cancelled folder picking and denied access keep existing files untouched',async()=>{
 const f=await fixture();try{await f.folder.choose();f.root.permission='denied';assert.equal(await f.folder.save('builder',draft()),null);assert.match(f.folder.error,/permission/);assert.equal(f.root.directories.size,0)}finally{f.scope.stop()}
})
test('cancelling the picker leaves an existing connection intact',async()=>{
 const root=memoryFolder(),storage=memoryStorage(),platform={isSecureContext:true,showDirectoryPicker:async()=>root,confirm:()=>true},scope=effectScope(),folder=scope.run(()=>useScenarioFolder(ref({openApiUrl:'https://api.test/spec'}),ref([operation]),ref(false),{platform,storage,handles:{async get(){},async set(){},async remove(){}}}));await settle()
 try{await folder.choose();platform.showDirectoryPicker=async()=>{throw new DOMException('Canceled','AbortError')};assert.equal(await folder.choose(),null);assert.equal(folder.connected,true);assert.equal(folder.name,'team-repo');assert.equal(folder.error,'')}finally{scope.stop()}
})
test('a slow remembered-folder lookup cannot replace a newly chosen connection',async()=>{
 const selected=memoryFolder('selected'),remembered=memoryFolder('old'),scope=effectScope(),storage=memoryStorage();let resolve
 const wait=new Promise(done=>resolve=done),folder=scope.run(()=>useScenarioFolder(ref({openApiUrl:'https://api.test/spec'}),ref([operation]),ref(false),{platform:{isSecureContext:true,showDirectoryPicker:async()=>selected,confirm:()=>true},storage,handles:{get:()=>wait,async set(){},async remove(){}}}))
 try{assert.equal(folder.restoring,true);assert.ok(await folder.choose());resolve(remembered);await settle();assert.equal(folder.name,'selected');assert.equal(folder.ready,true)}finally{scope.stop()}
})
