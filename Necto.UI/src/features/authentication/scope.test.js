import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { useAuthentication } from './useAuthentication.js'
import { useRequestRunner } from '../request-runner/useRequestRunner.js'
const origin='https://example.test', bearer={type:'http',scheme:'bearer'}
function setup(){
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
 const config={openApiUrl:origin+'/openapi.json',apiBaseUrl:origin}, auth=useAuthentication()
 for(const id of ['local','partner'])auth.register({id,configuration:config,schemes:{bearer},origins:[origin]})
 const scope=effectScope();let runner;scope.run(()=>runner=useRequestRunner(ref(config),auth));return {auth,runner,scope}
}
test('Bearer change clears only its API results and history, including removal',()=>{
 const {auth,runner,scope}=setup(), a={apiId:'local',key:'GET /a'},b={apiId:'partner',key:'GET /b'}
 runner.sessionFor(a).result={json:{a:1}};runner.sessionFor(b).result={json:{b:1}}
 runner.history.add(a);runner.history.add(b)
 auth.save('partner','bearer',bearer,{token:'fixture',origins:[origin]})
 assert.ok(runner.sessionFor(a).result);assert.equal(runner.sessionFor(b).result,null)
 assert.deepEqual(runner.history.entries.map(x=>x.apiId),['local'])
 runner.sessionFor(b).result={json:{b:2}};auth.remove('partner');assert.equal(runner.sessionFor(b).result,null)
 auth.save('local','bearer',bearer,{token:'fixture',origins:[origin]});assert.equal(runner.sessionFor(a).result,null);scope.stop()
})
test('shared browser-session changes invalidate APIs on the affected origin',()=>{
 const {auth,runner,scope}=setup();for(const id of ['local','partner'])runner.sessionFor({apiId:id,key:id}).result={json:1}
 const scheme={type:'browserSession'};auth.save('partner','session',scheme,{enabled:true,origins:[origin]})
 for(const session of runner.sessions.values())assert.equal(session.result,null)
 assert.ok(auth.apiRevision('local'));scope.stop()
})
test('auth invalidation aborts pending affected requests without repopulating history',async()=>{
 const {auth,runner,scope}=setup(), previous=globalThis.fetch
 globalThis.fetch=async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))
 const op={key:'GET /a',apiId:'local',method:'GET',path:'/a',parameters:[],security:[]}
 try {
  const session=runner.sessionFor(op), pending=runner.run(op,session,new Map())
  auth.save('local','bearer',bearer,{token:'fixture',origins:[origin]});await pending
  assert.equal(session.result,null);assert.equal(session.error,'');assert.equal(runner.history.entries.length,0)
 }finally{scope.stop();globalThis.fetch=previous}
})
