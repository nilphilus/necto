#!/usr/bin/env node
// Read-only, offline validation. Never evaluates payloads or sends requests.
import { readFile, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { validateBlueprint } from './lib/blueprint.mjs'

function bounded(value) {
 const stack=[{value,depth:0}];let count=0
 while(stack.length){
  const item=stack.pop()
  if(++count>25000||item.depth>64)throw new Error('JSON structural limit exceeded.')
  if(item.value&&typeof item.value==='object'){
   const children=Object.values(item.value)
   if(children.length+stack.length>25000-count)throw new Error('JSON structural limit exceeded.')
   for(const value of children)stack.push({value,depth:item.depth+1})
  }
 }
}
const embedded=text=>{if(typeof text!=='string')return;let value;try{value=JSON.parse(text)}catch{return}bounded(value)}
export function validateText(text) {
 if(Buffer.byteLength(text,'utf8')>2*1024*1024)throw new Error('File exceeds 2 MiB.')
 let file;try{file=JSON.parse(text)}catch{throw new Error('Invalid JSON.')}
 bounded(file)
 if(file?.format!=='necto-shared-scenario'||file.version!==1||file.kind!=='builder')throw new Error('Expected a version-1 shared Builder file.')
 const b=file.scenario
 if(b?.version!==5)throw new Error('This skill authors Builder version 5.')
 // Match the additional shared-file identity bound before model validation.
 if(typeof b.id!=='string'||b.id.length>2000)throw new Error('Invalid shared scenario ID.')
 for(const step of b.steps??[]){
  const r=step.request??{};embedded(r.body)
  for(const row of r.formFields??[])embedded(row.value)
  for(const check of r.assertions??[])if(check.kind==='equals')embedded(check.expected)
 }
 for(const v of b.variables??[])if(v.source==='static'&&v.valueType==='json')embedded(v.value)
 for(const edge of b.connections??[])if(edge.waitFor?.valueType==='json')embedded(edge.waitFor.value)
 validateBlueprint(b)
 return b
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('Usage: node validate.mjs <scenario.necto.json>')
  if((await stat(process.argv[2])).size>2*1024*1024)throw new Error('File exceeds 2 MiB.')
  const b=validateText(await readFile(process.argv[2],'utf8'))
  console.log(`Valid shared Builder scenario (${b.steps.length} steps). Contract and secret review still required.`)
 }catch{
  // Validation messages may contain repository-controlled labels/values.
  console.error('Validation failed. Check the shared wrapper, version-5 graph, fields and documented limits. Payload contents are not printed.')
  process.exitCode=1
 }
}
