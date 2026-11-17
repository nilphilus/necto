import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { validateText } from '../skills/necto-scenarios/scripts/validate.mjs'
import { parseShared } from '../Necto.UI/src/features/scenario-folder/format.js'
import { savedBlueprint } from '../Necto.UI/src/features/scenario-builder/useBuilder.js'
import { fileURLToPath } from 'node:url'
import { layers } from '../Necto.UI/src/features/scenario-builder/model.js'
const text=await readFile(new URL('../skills/necto-scenarios/examples/invoice-inspection.necto.json',import.meta.url),'utf8')
const mutate=fn=>{const f=JSON.parse(text);fn(f.scenario);return JSON.stringify(f)}
test('portable example imports through production parser and has the documented parallel layers',()=>{
 const a=validateText(text),b=parseShared(text).scenario
 assert.deepEqual(JSON.parse(JSON.stringify(savedBlueprint(a))),JSON.parse(JSON.stringify(b)))
 assert.deepEqual(layers(a).map(group=>group.map(step=>step.id)),[['invoice','weather'],['lines']])
})
test('portable validator and production import reject cycles, broken bindings and invalid edge waits',()=>{
 for(const edit of [b=>b.connections.push({from:'lines',to:'invoice'}), b=>b.steps[2].inputs[0].stepId='missing', b=>b.connections[0].waitFor={pointer:'/ready',valueType:'boolean',value:'true',retryCount:101,intervalMs:1000}, b=>b.steps[2].inputs.push({...b.steps[2].inputs[0]})]){
  const value=mutate(edit);assert.throws(()=>validateText(value));assert.throws(()=>parseShared(value))
 }
})
test('version-7 shared variables, generated JSON body and polling are accepted by both validators',()=>{
 const value=mutate(b=>{
  b.variables=[{id:'reference',name:'reference',source:'human',prompt:'Reference?',valueType:'text'}]
  b.steps[0].inputs=[{location:'query',name:'invoiceReference',source:'variable',variableId:'reference'}]
  // Structural fixture only: no claim this generated field belongs to SampleApi.
  b.steps[2].request.body='{"requestId":""}'
  b.steps[2].inputs.push({location:'body',pointer:'/requestId',source:'generate',generator:'uuid'})
  b.connections[0].waitFor={pointer:'/0/lineId',valueType:'number',value:'17',retryCount:2,intervalMs:1000}
 })
 assert.doesNotThrow(()=>validateText(value));assert.doesNotThrow(()=>parseShared(value))
})
test('rejects excessive embedded JSON and outer structures without recursive crashes',()=>{
 const deep='['.repeat(66)+'0'+']'.repeat(66)
 assert.throws(()=>validateText(mutate(b=>b.steps[0].request.body=deep)),/structural/)
 assert.throws(()=>validateText(JSON.stringify({...JSON.parse(text),unused:JSON.parse(deep)})),/structural/)
 assert.throws(()=>validateText(' '.repeat(2*1024*1024+1)),/2 MiB/)
})
test('archive works extracted outside Necto without dependencies',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'necto-skill-'))
 try{
  const archive=join(dir,'skill.zip')
  execFileSync(process.execPath,[fileURLToPath(new URL('./package-scenario-skill.mjs',import.meta.url)),archive])
  execFileSync('python3',['-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',archive,dir])
  const result=spawnSync(process.execPath,[join(dir,'necto-scenarios/scripts/validate.mjs'),join(dir,'necto-scenarios/examples/invoice-inspection.necto.json')],{cwd:dir,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Valid shared Builder/)
 }finally{await rm(dir,{recursive:true,force:true})}
})

test('installed skill validates expressions and runs its bundled interpreter offline',async()=>{
 const {evaluateExpression}=await import('../skills/necto-scenarios/scripts/lib/blueprint.mjs')
 const value=mutate(b=>b.steps[2].inputs=[{location:'path',name:'invoiceId',source:'expression',expression:'return invoice.id;',bindings:[{name:'invoice',source:'response',stepId:'invoice',responsePointer:''}]}])
 assert.doesNotThrow(()=>validateText(value));assert.doesNotThrow(()=>parseShared(value))
 assert.equal(evaluateExpression('switch(invoice.status){case "draft":return "review";default:return "send";}',{invoice:{status:'draft'}}),'review')
 assert.throws(()=>evaluateExpression('return fetch("https://evil.invalid");',{}))
 assert.throws(()=>validateText(mutate(b=>b.steps[0].inputs=[{location:'query',name:'invoiceReference',source:'expression',expression:'return import("fs");',bindings:[]}])) )
})

test('portable v7 random example matches production import and adds the source dependency',async()=>{
 const randomText=await readFile(new URL('../skills/necto-scenarios/examples/random-invoice.necto.json',import.meta.url),'utf8')
 const b=validateText(randomText);assert.equal(b.version,7);assert.equal(b.steps[2].inputs[0].source,'random');assert.equal(b.steps[2].inputs[0].itemPointer,'/id')
 assert.deepEqual(JSON.parse(JSON.stringify(savedBlueprint(b))),JSON.parse(JSON.stringify(parseShared(randomText).scenario)))
 assert.deepEqual(layers(b).map(items=>items.map(item=>item.id)),[['invoice','weather'],['lines']])
})
