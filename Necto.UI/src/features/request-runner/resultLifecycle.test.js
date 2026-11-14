import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { useRequestRunner } from './useRequestRunner.js'
const operation={key:'GET /lookup',method:'GET',path:'/lookup',parameters:[]}
for(const failure of ['cancel','timeout','budget','network'])test(`last complete result survives ${failure} during the next response`,async()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
 const scope=effectScope();let runner;scope.run(()=>runner=useRequestRunner(ref({openApiUrl:'https://example.test/openapi.json',apiBaseUrl:'https://example.test'})))
 const previousFetch=globalThis.fetch, session=runner.sessionFor(operation)
 globalThis.fetch=async()=>new Response('{"id":42}',{headers:{'content-type':'application/json'}})
 try{
  await runner.run(operation,session,new Map());const complete=session.result
  if(failure==='network')globalThis.fetch=async()=>{throw new TypeError('Synthetic network failure')}
  else globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(failure==='budget'?'x'.repeat(2*1024*1024):'{"id":43,'))}}),{headers:{'content-type':'application/json'}})
  session.responseLimitMiB=1;session.timeout=failure==='timeout'?15:30000
  const pending=runner.run(operation,session,new Map())
  if(failure==='cancel'){await new Promise(r=>setTimeout(r,5));assert.equal(session.result,complete);assert.equal(session.responseProgress.receiving,true);runner.cancel(session)}
  await pending
  assert.equal(session.result,complete);assert.equal(session.result.json.id,42);assert.ok(session.error)
  if(session.responseProgress)assert.equal(session.responseProgress.receiving,false)
  globalThis.fetch=async()=>new Response('{"id":44}',{headers:{'content-type':'application/json'}})
  await runner.run(operation,session,new Map());assert.equal(session.result.json.id,44);assert.equal(session.responseProgress,null)
 }finally{scope.stop();globalThis.fetch=previousFetch}
})
