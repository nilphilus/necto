import test from 'node:test'
import assert from 'node:assert/strict'
import { runScenario } from '../../../../tools/necto-run.mjs'
import { junitReport } from '../../../../tools/junit.mjs'
import { failureDiagnostic } from '../../../../tools/failure-diagnostic.mjs'
import { executeScenario } from '../scenarios/scenario.js'
const document={openapi:'3.1.0',paths:{'/invoices':{get:{responses:{200:{description:'OK'}}}}}}
const scenario=()=>({version:1,id:'test',name:'CI diagnostics',steps:[{operationKey:'GET /invoices',apiId:'local',name:'Invoices',method:'GET',path:'/invoices',fields:{},body:'',bindings:[],timeout:20,responseLimitMiB:1}]})
for(const [kind,code] of [['budget','RESPONSE_LIMIT_EXCEEDED'],['network','NETWORK_ERROR'],['timeout','TIMEOUT'],['http','HTTP_ERROR'],['checks','ASSERTION_FAILED']])test(`CI JSON and JUnit identify ${kind} without exposing exception text`,async()=>{
 const previous=globalThis.fetch,saved=scenario()
 if(kind==='checks')saved.steps[0].assertions=[{kind:'status',expected:201}]
 globalThis.fetch=async()=>{
  if(kind==='network')throw new Error('https://user:private-token@example.test?secret=private-token')
  if(kind==='timeout')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'))}}),{headers:{'content-type':'application/json'}})
  return new Response(kind==='budget'?'x'.repeat(2*1024*1024):'{"secret":"private-token"}',{status:kind==='http'?503:200,headers:{'content-type':'application/json'}})
 }
 try{
  const report=await runScenario({scenario:saved,document,baseUrl:'https://example.test'})
  assert.equal(report.steps[0].step,1);assert.equal(report.steps[0].failure.code,code)
  if(kind==='budget')assert.equal(report.steps[0].failure.limitMiB,1)
  if(kind==='timeout')assert.equal(report.steps[0].failure.timeoutMs,20)
  if(kind==='http')assert.equal(report.steps[0].failure.httpStatus,503)
  const xml=junitReport(report);assert.match(xml,new RegExp(code));assert.ok(!JSON.stringify(report).includes('private-token'));assert.ok(!xml.includes('private-token'))
 }finally{globalThis.fetch=previous}
})
test('binding failures have their own code before a request is executed',async()=>{
 const plan=[{operation:{},session:{},bindings:[{sourceStep:0}],status:'waiting'}]
 let called=false;await executeScenario(plan,{signal:new AbortController().signal,execute:()=>{called=true}})
 assert.equal(called,false);assert.equal(plan[0].failureCode,'BINDING_ERROR')
 assert.equal(failureDiagnostic('raw-secret').code,'REQUEST_ERROR')
})
