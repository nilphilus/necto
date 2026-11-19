#!/usr/bin/env node
// Read-only, offline validation. Never evaluates payloads or sends requests.
import { readFile, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { normalizeBodyFieldNames, normalizeParameterNames, resolveReference, validateBlueprint } from './lib/blueprint.mjs'

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
class OpenApiNamingError extends Error {}

function validateRequestNames(blueprint, spec) {
 if (typeof spec?.openapi !== 'string' || !spec.paths || typeof spec.paths !== 'object')
  throw new OpenApiNamingError('Expected a local OpenAPI 3 JSON document.')
 for (const [index, step] of blueprint.steps.entries()) {
  if (step.apiId !== 'local') continue
  const resolve = value => {
   const resolved = resolveReference(spec, value)
   if (value?.$ref && resolved === undefined)
    throw new OpenApiNamingError(`Step ${index + 1}: unresolved OpenAPI reference. Use a bundled OpenAPI document.`)
   return resolved
  }
  const pathItem = Object.hasOwn(spec.paths, step.path) ? resolve(spec.paths[step.path]) : undefined
  const operation = resolve(pathItem?.[step.method.toLowerCase()])
  if (!operation) throw new OpenApiNamingError(`Step ${index + 1}: operation does not appear in this OpenAPI document.`)
  const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map(resolve).filter(Boolean)
  const named = normalizeParameterNames({ parameters }, step.request.fields, step.inputs)
  if (named.conflict || Object.keys(step.request.fields).some(key => !Object.hasOwn(named.fields, key)) ||
      named.inputs.some((input, inputIndex) => input.name !== step.inputs[inputIndex].name))
   throw new OpenApiNamingError(`Step ${index + 1}: saved parameter name differs from the OpenAPI spelling. Check parameter names in fields and inputs.`)
  const requestBody = resolve(operation.requestBody)
  const normalized = normalizeBodyFieldNames({ resolve, requestBody }, step.request, step.inputs)
  if (normalized.conflict || normalized.body !== step.request.body ||
      normalized.inputs.some((input, inputIndex) => input.pointer !== step.inputs[inputIndex].pointer))
   throw new OpenApiNamingError(`Step ${index + 1}: JSON body key or target pointer differs from the OpenAPI spelling. Check the exact names in requestBody properties.`)
 }
}

export function validateText(text, spec) {
 if(Buffer.byteLength(text,'utf8')>2*1024*1024)throw new Error('File exceeds 2 MiB.')
 let file;try{file=JSON.parse(text)}catch{throw new Error('Invalid JSON.')}
 bounded(file)
 if(file?.format!=='necto-shared-scenario'||file.version!==1||file.kind!=='builder')throw new Error('Expected a version-1 shared Builder file.')
 const b=file.scenario
 if(b?.version!==7)throw new Error('This skill authors Builder version 7.')
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
 if (spec !== undefined) validateRequestNames(b, spec)
 return b
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [, , scenarioPath, flag, specPath, ...extra] = process.argv
  if (!scenarioPath || extra.length || (flag !== undefined && (flag !== '--openapi' || !specPath))) {
   throw new OpenApiNamingError('Usage: node validate.mjs <scenario.necto.json> [--openapi <local-openapi.json>]')
  }
  if ((await stat(scenarioPath)).size > 2 * 1024 * 1024) throw new Error('File exceeds 2 MiB.')
  let spec
  if (specPath) {
   if ((await stat(specPath)).size > 16 * 1024 * 1024) throw new OpenApiNamingError('OpenAPI document exceeds 16 MiB.')
   try { spec = JSON.parse(await readFile(specPath, 'utf8')) }
   catch { throw new OpenApiNamingError('OpenAPI document must be readable local JSON.') }
  }
  const b = validateText(await readFile(scenarioPath, 'utf8'), spec)
  const scope = specPath ? ' Checked parameter and JSON body key spelling for local API steps.' : ''
  console.log(`Valid shared Builder scenario (${b.steps.length} steps).${scope} Contract and secret review still required.`)
 }catch(error){
  // Validation messages may contain repository-controlled labels/values.
  console.error(error instanceof OpenApiNamingError ? error.message :
   'Validation failed. Check the shared wrapper, version-7 graph, fields and documented limits. Payload contents are not printed.')
  process.exitCode=1
 }
}
