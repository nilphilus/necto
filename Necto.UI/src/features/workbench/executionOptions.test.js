import { test } from 'node:test'
import assert from 'node:assert/strict'
import { executionOptions } from './executionOptions.js'
import { snapshotScenario, prepareScenario } from '../scenarios/scenario.js'
import { historySnapshot, restoreHistoryDraft } from './historySnapshot.js'
import { exportWorkspace, inspectWorkspace } from './workspace.js'
import { runScenario } from '../../../../tools/necto-run.mjs'
const operation={key:'GET /invoices',apiId:'local',name:'Invoices',method:'GET',path:'/invoices',parameters:[],tags:['Invoices'],resolve:x=>x}
const configuration={openApiUrl:'https://api.test/openapi.json',apiBaseUrl:'https://api.test/'}
test('execution settings round-trip through scenario, workspace and history',()=>{
 for(const budget of [1,64]) {
  const session={fields:{},body:'',bindings:[],timeout:1234,responseLimitMiB:budget}
  const saved=snapshotScenario([{operation,session}],'Budget check')
  const storage={length:1,key:()=> 'necto:scenarios:test',getItem:()=>JSON.stringify({version:1,scenarios:[saved]})}
  const imported=inspectWorkspace(JSON.stringify(exportWorkspace(storage,true)),{getItem:()=>null}).entries[0].value.scenarios[0]
  const plan=prepareScenario(imported,{operations:[operation],links:[],configuration,createSession:()=>({fields:{},body:'',bindings:[],responseLimitMiB:32}),valuesFor:()=>new Map()})
  assert.equal(plan[0].session.responseLimitMiB,budget);assert.equal(plan[0].session.timeout,1234)
  const snapshot=historySnapshot({url:new URL('https://api.test/invoices'),options:{method:'GET',headers:new Headers()}},session)
  const restored={responseLimitMiB:128};restoreHistoryDraft(restored,snapshot);assert.equal(restored.responseLimitMiB,budget)
 }
 assert.deepEqual(executionOptions({}),{timeout:30000,responseLimitMiB:32})
 for(const responseLimitMiB of [-1,0,513,1.5,null,'1',Infinity])assert.throws(()=>executionOptions({responseLimitMiB}),/budget/)
})
test('CI reception obeys the saved budget and cancels an oversized body',async t=>{
 let canceled=false
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024))},cancel(){canceled=true}}),{headers:{'content-type':'application/json'}}))
 const document={openapi:'3.1.0',paths:{'/invoices':{get:{operationId:'Invoices',responses:{200:{description:'OK'}}}}}}
 const scenario=snapshotScenario([{operation,session:{fields:{},body:'',bindings:[],timeout:30000,responseLimitMiB:1}}],'CI budget')
 const outcome=await runScenario({scenario,document,baseUrl:'https://api.test/'})
 assert.equal(outcome.status,'failed');assert.equal(canceled,true)
})
