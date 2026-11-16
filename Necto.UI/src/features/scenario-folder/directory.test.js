import test from 'node:test'
import assert from 'node:assert/strict'
import { memoryFolder } from './folderFixture.js'
import { scanDirectory,scenarioDirectory,writeScenarioFile } from './directory.js'
import { serializeShared } from './format.js'
const source={version:1,id:'one',name:'Read',steps:[{operationKey:'GET /one',apiId:'local',method:'GET',path:'/one',name:'Read',fields:{},body:'',bindings:[]}]}
test('folder scans only managed files and rejects duplicate IDs and malformed definitions',async()=>{
 const root=memoryFolder();assert.deepEqual(await scanDirectory(root),[]);assert.equal(root.directories.size,0)
 const directory=await scenarioDirectory(root,true),text=serializeShared('chain',source)
 directory.files.set('read.necto.json',text);directory.files.set('README.md','ignored');assert.equal((await scanDirectory(root)).length,1)
 directory.files.set('duplicate.necto.json',text);await assert.rejects(scanDirectory(root),/duplicate/)
 directory.files.delete('duplicate.necto.json');directory.files.set('broken.necto.json','bad json');await assert.rejects(scanDirectory(root),/broken.necto.json/)
})
test('writes detect disk modifications before and after acquiring a stream and preserve the other writer',async()=>{
 const directory=memoryFolder();directory.files.set('one.necto.json','before')
 await assert.rejects(writeScenarioFile(directory,'one.necto.json','ours','old'),/changed/);assert.equal(directory.files.get('one.necto.json'),'before')
 directory.onWrite=()=>directory.files.set('one.necto.json','colleague')
 await assert.rejects(writeScenarioFile(directory,'one.necto.json','ours','before'),/changed before writing/);assert.equal(directory.files.get('one.necto.json'),'colleague');assert.equal(directory.aborts,1)
 directory.onWrite=null;await writeScenarioFile(directory,'one.necto.json','ours','colleague');assert.equal(directory.files.get('one.necto.json'),'ours')
 await assert.rejects(writeScenarioFile(directory,'missing.necto.json','ours','deleted'),/removed/)
})
