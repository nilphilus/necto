import test from 'node:test'
import assert from 'node:assert/strict'
import { newBlueprint,newStep } from '../scenario-builder/model.js'
import { sharedDefinition,serializeShared,parseShared } from './format.js'
import { managedFileName,writeScenarioFile } from './directory.js'
import { memoryFolder } from './folderFixture.js'
const operation={key:'POST /probe',apiId:'local',method:'POST',path:'/probe',name:'Probe',parameters:[],resolve:value=>value,requestBody:{content:{'application/json':{schema:{type:'object'}}}},responses:{200:{content:{'application/json':{schema:{type:'object',properties:{profile:{type:'object','x-necto-sensitive-properties':['code']}}}}}}}}
const blueprint=request=>({...newBlueprint(),steps:[newStep(operation,{fields:{},body:'{}',...request})]})
test('custom OpenAPI credential names are removed from manual transport fields and variables',()=>{
 const secured={...operation,securitySchemes:{header:{type:'apiKey',in:'header',name:'X-Session'},query:{type:'apiKey',in:'query',name:'access'}}}
 const source=blueprint({fields:{'header:x-session':'HEADER_CREDENTIAL','query:access':'QUERY_CREDENTIAL','query:reference':'INV-42'},extraHeaders:{' X-Session ':'EXTRA_HEADER_CREDENTIAL'},extraQuery:[['access','EXTRA_QUERY_CREDENTIAL'],['page','2']]})
 source.variables=[{id:'v',name:'opaqueValue',source:'static',valueType:'text',value:'VARIABLE_CREDENTIAL'}];source.steps[0].inputs=[{source:'variable',variableId:'v',location:'header',name:'X-Session'}]
 const shared=sharedDefinition('builder',source,[secured]),text=serializeShared('builder',shared)
 for(const literal of ['HEADER_CREDENTIAL','QUERY_CREDENTIAL','EXTRA_HEADER_CREDENTIAL','EXTRA_QUERY_CREDENTIAL','VARIABLE_CREDENTIAL'])assert.ok(!text.includes(literal))
 assert.equal(shared.variables[0].source,'human');assert.equal(shared.steps[0].request.fields['query:reference'],'INV-42');assert.deepEqual(shared.steps[0].request.extraQuery,[['page','2']]);assert.equal(source.variables[0].value,'VARIABLE_CREDENTIAL')
})
test('OAuth fragments and URL userinfo are removed while ordinary URLs and JSON strings stay unchanged',()=>{
 const source=blueprint({body:JSON.stringify({redirect:'https://app.test/#access_token=FRAGMENT_CREDENTIAL&state=example',basic:'https://u:BASIC_CREDENTIAL@app.test/',normal:'https://app.test',encoded:'{ "count": 3 }'})})
 const shared=sharedDefinition('builder',source,[operation]),body=JSON.parse(shared.steps[0].request.body)
 assert.equal(body.redirect,'https://app.test/');assert.equal(body.basic,'https://app.test/');assert.equal(body.normal,'https://app.test');assert.equal(body.encoded,'{ "count": 3 }')
})
test('sensitive response-check literals fail closed instead of being shared or silently changing the test',()=>{
 for(const [path,expected]of [['/access_token','"CHECK_CREDENTIAL"'],['/profile','{"code":"SCHEMA_CREDENTIAL"}'],['/safe','{"password":"NESTED_CREDENTIAL"}']]){
  const source=blueprint({});source.steps[0].request.assertions=[{kind:'equals',path,expected}]
  assert.throws(()=>sharedDefinition('builder',source,[operation]),error=>/sensitive comparison value/.test(error.message)&&!error.message.includes('CREDENTIAL'))
  assert.equal(source.steps[0].request.assertions[0].expected,expected)
 }
 const source=blueprint({});source.steps[0].request.assertions=[{kind:'exists',path:'/access_token',expected:'UNUSED_CREDENTIAL'},{kind:'equals',path:'/safe',expected:'"https://app.test"'}]
 assert.ok(!serializeShared('builder',sharedDefinition('builder',source,[operation])).includes('UNUSED_CREDENTIAL'))
})
test('wait conditions and quick selectors cannot share sensitive comparison literals',()=>{
 const source=blueprint({});source.connections=[{from:null,to:source.steps[0].id,waitFor:{pointer:'/profile/code',value:'WAIT_CREDENTIAL',valueType:'text',retryCount:1,intervalMs:100}}]
 assert.throws(()=>sharedDefinition('builder',source,[operation]),/Wait condition contains a sensitive comparison/)
 const row={operationKey:operation.key,apiId:'local',name:'Read',method:operation.method,path:operation.path,fields:{},body:'{}',bindings:[]}
 const chain={version:1,id:'quick',name:'Quick',steps:[row,{...row,bindings:[{sourceStep:0,path:['items',0,'id'],location:'query',name:'id',selector:{arrayPath:['items'],field:'/password',expected:'"SELECTOR_CREDENTIAL"'}}]}]}
 assert.throws(()=>sharedDefinition('chain',chain,[operation]),/Object selector contains a sensitive comparison/)
})
test('untrusted JSON is structurally bounded, including embedded body JSON, and parse errors do not echo contents',()=>{
 const quick={version:1,id:'q',name:'Quick',steps:[{operationKey:'GET /q',apiId:'local',name:'Q',method:'GET',path:'/q',fields:{},body:'',bindings:[]}]}
 const deep='{"x":'.repeat(100)+'0'+'}'.repeat(100)
 const envelope='{"format":"necto-shared-scenario","version":1,"kind":"chain","extra":'+deep+',"scenario":'+JSON.stringify(quick)+'}'
 assert.throws(()=>parseShared(envelope),/structural limit/)
 quick.steps[0].body=deep;assert.throws(()=>parseShared(JSON.stringify({format:'necto-shared-scenario',version:1,kind:'chain',scenario:quick})),/structural limit/)
 quick.steps[0].body='{"__proto__":{"polluted":true}}';const parsed=parseShared(JSON.stringify({format:'necto-shared-scenario',version:1,kind:'chain',scenario:quick}));assert.equal(parsed.scenario.id,'q');assert.equal({}.polluted,undefined)
 assert.throws(()=>parseShared('PARSE_CREDENTIAL'),error=>error.message==='Invalid JSON in shared scenario file.')
 assert.throws(()=>parseShared(JSON.stringify({format:'necto-shared-scenario',version:1,kind:'chain',extra:Array(26000).fill(1),scenario:quick})),/structural limit/)
})
test('managed file operations reject traversal, control characters and alternate-stream paths',async()=>{
 const directory=memoryFolder()
 for(const name of ['../outside.necto.json','C:\\outside.necto.json','file:stream.necto.json','bad\nname.necto.json','/absolute.necto.json']){
  assert.throws(()=>managedFileName(name),/Invalid shared/)
  await assert.rejects(writeScenarioFile(directory,name,'text'),/Invalid shared/)
 }
 assert.equal(directory.files.size,0)
})
test('replacing the pathname with another equal-content file cannot redirect identity checks away from the writer',async()=>{
 let current,oldWritten=false,aborted=false
 const other={async getFile(){return new Blob(['before'])}}
 const original={async getFile(){return new Blob(['before'])},async isSameEntry(handle){return handle===original},async createWritable(){current=other;return {async write(){oldWritten=true},async close(){},async abort(){aborted=true}}}}
 current=original
 const directory={async getFileHandle(){return current}}
 await assert.rejects(writeScenarioFile(directory,'one.necto.json','ours','before'),/replaced or moved/);assert.equal(oldWritten,false);assert.equal(aborted,true)
})
test('a disk change during buffered writing aborts before close',async()=>{
 let text='before',closed=false,aborted=false
 const handle={async getFile(){return new Blob([text])},async isSameEntry(other){return other===handle},async createWritable(){return {async write(){text='concurrent edit'},async close(){closed=true},async abort(){aborted=true}}}}
 await assert.rejects(writeScenarioFile({async getFileHandle(){return handle}},'one.necto.json','ours','before'),/changed during writing/);assert.equal(closed,false);assert.equal(aborted,true);assert.equal(text,'concurrent edit')
})
