import { inputSources } from '../scenario-builder/variables.js'
import { savedBlueprint } from '../scenario-builder/useBuilder.js'
import { validateScenario } from '../scenarios/scenario.js'
import { payloadSnapshot } from '../workbench/body.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { pointerPath } from '../workbench/assertions.js'
import { expectedValue } from '../scenario-builder/waiting.js'
import { redactSchema } from '../workbench/sensitiveSchema.js'
import { sensitiveName } from '../workbench/privacy.js'
import { retainDraft, bodyPolicy, sensitiveFields } from '../workbench/sensitiveSchema.js'
import { pointerParts } from '../scenario-builder/pointers.js'
export const FILE_LIMIT = 2 * 1024 * 1024
export const FOLDER_NAME = 'necto-scenarios'
export const FILE_SUFFIX = '.necto.json'
const clone=value=>JSON.parse(JSON.stringify(value))
function requestDefinition(request) {
 request.assertions=(request.assertions??[]).map(check=>({kind:check.kind,path:check.path,...(!['exists','nonempty'].includes(check.kind)?{expected:check.expected}:{})}))
 if(request.formFields)request.formFields=request.formFields.map(row=>({name:row.name,value:row.value,kind:row.kind,enabled:row.enabled,required:Boolean(row.required),multiple:Boolean(row.multiple),attachmentRequired:Boolean(row.attachmentRequired),files:[]}))
 return request
}
export function canonicalScenario(kind,scenario) {
 if(!['builder','chain'].includes(kind))throw new Error('Unsupported scenario kind.')
 if(typeof scenario?.name!=='string'||scenario.name.length>200||typeof scenario?.id!=='string'||scenario.id.length>2000)throw new Error('Shared scenarios need a name of up to 200 characters and a bounded ID.')
 if(kind==='builder'){
  const definition=savedBlueprint(scenario)
  for(const step of definition.steps)requestDefinition(step.request)
  return definition
 }
 validateScenario(scenario)
 const definition=clone({version:1,id:scenario.id,name:scenario.name.trim(),steps:scenario.steps.map(step=>({operationKey:step.operationKey,apiId:step.apiId,name:step.name,method:step.method,path:step.path,fields:step.fields,body:step.body,bindings:step.bindings.map(binding=>({sourceStep:binding.sourceStep,path:binding.path,location:binding.location,name:binding.name,...(binding.selector?{selector:{arrayPath:binding.selector.arrayPath,field:binding.selector.field,expected:binding.selector.expected}}:{})})),...payloadSnapshot(step),...executionOptions(step),assertions:step.assertions??[],serverIndex:step.serverIndex,serverValues:step.serverValues??{}}))})
 definition.steps.forEach(requestDefinition)
 return definition
}
function clean(value,depth=0,budget={left:25000}) {
 if(--budget.left<0||depth>64)throw new Error('Static values are too deep or large to prepare for sharing.')
 if(Array.isArray(value))return value.map(item=>clean(item,depth+1,budget))
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!sensitiveName(key)).map(([key,item])=>[key,clean(item,depth+1,budget)]))
 if(typeof value==='string'&&/^\s*[\[{]/.test(value)){
  let parsed,valid=false;try{parsed=JSON.parse(value);valid=true}catch{/* Ordinary text is retained. */}
  if(valid){const sanitized=clean(parsed,depth+1,budget);return JSON.stringify(sanitized)===JSON.stringify(parsed)?value:JSON.stringify(sanitized)}
 }
 if(typeof value==='string'&&/^https?:\/\//i.test(value)){
  try {
   const url=new URL(value);let changed=Boolean(url.username||url.password)
   url.username='';url.password=''
   for(const key of [...url.searchParams.keys()])if(sensitiveName(key)){url.searchParams.delete(key);changed=true}
   if([...new URLSearchParams(url.hash.slice(1)).keys()].some(sensitiveName)){url.hash='';changed=true}
   return changed?url.href:value
  }catch{/* Keep non-URL static text. */}
 }
 return value
}
function shapes(raws,resolve) {
 const stack=[...raws],seen=new Set(),result=[]
 while(stack.length){const schema=resolve(stack.pop());if(!schema||typeof schema!=='object'||seen.has(schema))continue;if(seen.size>=256)throw new Error('Sensitive schema is too complex to share safely.');seen.add(schema);result.push(schema);for(const key of ['allOf','anyOf','oneOf'])stack.push(...(schema[key]??[]))}
 return result
}
function sensitiveTransport(operation,location,name) {
 const normalized=location==='header'?String(name).trim().toLowerCase():name
 return sensitiveName(name)||Object.values(operation.securitySchemes??{}).some(scheme=>scheme?.type==='apiKey'&&scheme.in===location&&(location==='header'?String(scheme.name).trim().toLowerCase():scheme.name)===normalized)||operation.parameters?.some(parameter=>parameter.in===location&&(location==='header'?parameter.name?.toLowerCase():parameter.name)===normalized&&(parameter['x-necto-sensitive']===true||operation.resolve(parameter.schema)?.['x-necto-sensitive']===true))
}
function schemaLocation(raws,parts,resolve) {
 let schemas=shapes(raws,resolve),sensitive=false
 for(const part of parts){
  const name=String(part)
  if(sensitiveName(name)||schemas.some(schema=>schema['x-necto-sensitive']===true||sensitiveFields(schema,resolve).has(name)))sensitive=true
  schemas=shapes(schemas.flatMap(schema=>Object.hasOwn(schema.properties??{},name)?[schema.properties[name]]:schema.items&&/^\d+$/.test(name)?[schema.items]:typeof schema.additionalProperties==='object'?[schema.additionalProperties]:[]),resolve)
 }
 return {schemas,sensitive:sensitive||schemas.some(schema=>schema['x-necto-sensitive']===true)}
}
function sensitiveTarget(operation,input,request) {
 if(input.location!=='body')return sensitiveTransport(operation,input.location,input.name)
 return schemaLocation([bodyPolicy(operation,request).schema],pointerParts(input.pointer),operation.resolve??(value=>value)).sensitive
}
function responseSchemas(operation) {
 const resolve=operation.resolve??(value=>value)
 return Object.values(operation.responses??{}).flatMap(raw=>Object.entries(resolve(raw)?.content??{}).filter(([type])=>/(?:\/|\+)json(?:;|$)/i.test(type)).map(([,media])=>media.schema))
}
function sharedComparison(operation,parts,value,label) {
 if(parts.length>64)throw new Error('Shared comparison paths are limited to 64 segments.')
 const resolve=operation.resolve??(value=>value),location=schemaLocation(responseSchemas(operation),parts,resolve)
 if(location.sensitive||JSON.stringify(clean(value))!==JSON.stringify(value)||JSON.stringify(redactSchema(value,{allOf:location.schemas},resolve,'omit'))!==JSON.stringify(value))throw new Error(`${label} contains a sensitive comparison value. Remove or replace that literal before sharing the scenario.`)
}
function comparisonParts(pointer) {
 if(typeof pointer!=='string'||pointer.length>2048)throw new Error('Shared comparison paths are limited to 2048 characters.')
 return pointerPath(pointer)
}
function guardComparisons(kind,scenario,operations) {
 const operationFor=step=>operations.find(operation=>operation.key===step.operationKey&&(operation.apiId??'local')===step.apiId)
 for(const step of scenario.steps){
  const request=kind==='builder'?step.request:step,operation=operationFor(step)
  for(const check of request.assertions??[])if(check.kind==='equals')sharedComparison(operation,comparisonParts(check.path??''),JSON.parse(check.expected),'Response check')
  if(kind==='chain')for(const binding of step.bindings)if(binding.selector){
   const selector=binding.selector,source=operationFor(scenario.steps[binding.sourceStep])
   sharedComparison(source,[...selector.arrayPath,0,...comparisonParts(selector.field)],JSON.parse(selector.expected),'Object selector')
  }
 }
 if(kind==='builder')for(const edge of scenario.connections??[])if(edge.waitFor){
  const target=scenario.steps.find(step=>step.id===edge.to)
  sharedComparison(operationFor(target),comparisonParts(edge.waitFor.pointer),expectedValue(edge.waitFor),'Wait condition')
 }
}
export function sharedDefinition(kind,source,operations) {
 let staticText=0
 for(const step of source?.steps??[]){
  const request=kind==='builder'?step.request:step
  for(const value of [request?.body,...Object.values(request?.fields??{}),...(request?.formFields??[]).map(row=>row.value)])if(typeof value==='string')staticText+=value.length
  if(staticText>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')
 }
 for(const variable of source?.variables??[])if(typeof variable.value==='string'){staticText+=variable.value.length;if(staticText>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')}
 const scenario=canonicalScenario(kind,source),secretVariables=new Set()
 for(const step of scenario.steps){
  const operation=operations.find(operation=>operation.key===step.operationKey&&(operation.apiId??'local')===step.apiId)
  if(!operation||operation.method!==step.method||operation.path!==step.path)throw new Error(`${step.label??step.name}: load the endpoint's API before saving to the folder.`)
  const request=kind==='builder'?step.request:step
  for(const input of step.inputs??[])if(sensitiveTarget(operation,input,request)) {
   if(input.source==='expression')throw new Error('Replace expressions targeting sensitive fields before sharing. Expression code is saved as written.')
   for(const source of inputSources(input))if(source.source==='variable')secretVariables.add(source.variableId)
  }
  const retained=retainDraft(operation,request)
  request.fields=clean(Object.fromEntries(Object.entries(request.fields).filter(([key])=>{const colon=key.indexOf(':');return !sensitiveTransport(operation,key.slice(0,colon),key.slice(colon+1))})))
  request.body=retained.body??''
  if(request.body.trim()){
   let json=false,value
   try{value=JSON.parse(request.body);json=true}catch{/* Free text is retained; UI asks users to review static data. */}
   if(json)request.body=JSON.stringify(clean(value),null,2)
  }
  request.formFields=retained.formFields?.filter(row=>!sensitiveName(row.name)).map(row=>({...row,value:clean(row.value),files:[]}))
  request.extraHeaders=request.extraHeaders?clean(Object.fromEntries(Object.entries(request.extraHeaders).filter(([name])=>!sensitiveTransport(operation,'header',name)))):undefined
  request.extraQuery=request.extraQuery?.filter(([name])=>!sensitiveTransport(operation,'query',name)).map(([name,value])=>[name,clean(value)])
  request.serverValues=clean(request.serverValues)
 }
 for(const variable of scenario.variables??[])if(variable.source==='static'){
  if(sensitiveName(variable.name)||secretVariables.has(variable.id)){variable.source='human';variable.prompt='Enter '+variable.name;delete variable.value}
  else if(variable.valueType==='json')variable.value=JSON.stringify(clean(JSON.parse(variable.value)))
  else variable.value=clean(variable.value)
 }
 guardComparisons(kind,scenario,operations)
 return canonicalScenario(kind,scenario)
}
export function serializeShared(kind,scenario) {
 const text=JSON.stringify({format:'necto-shared-scenario',version:1,kind,scenario:canonicalScenario(kind,scenario)},null,2)+'\n'
 if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')
 return text
}
export function boundedSharedJson(value) {
 const stack=[{value,depth:0}];let nodes=0
 while(stack.length){
  const current=stack.pop()
  if(++nodes>25000||current.depth>64)throw new Error('Shared scenario JSON exceeds the structural limit (25000 values, 64 levels).')
  if(current.value&&typeof current.value==='object'){
   const children=Object.values(current.value)
   if(children.length+stack.length>25000-nodes)throw new Error('Shared scenario JSON exceeds the structural limit (25000 values, 64 levels).')
   for(const child of children)stack.push({value:child,depth:current.depth+1})
  }
 }
}
function checkEmbeddedJson(text) {
 if(typeof text!=='string'||!text.trim())return
 let value;try{value=JSON.parse(text)}catch{return}
 boundedSharedJson(value)
}
export function parseShared(text) {
 if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')
 let file;try{file=JSON.parse(text)}catch{throw new Error('Invalid JSON in shared scenario file.')}
 boundedSharedJson(file)
 if(file?.format!=='necto-shared-scenario'||file.version!==1)throw new Error('Unsupported shared scenario file.')
 const scenario=canonicalScenario(file.kind,file.scenario)
 for(const step of scenario.steps){
  const request=file.kind==='builder'?step.request:step
  checkEmbeddedJson(request.body)
  for(const row of request.formFields??[])checkEmbeddedJson(row.value)
  for(const check of request.assertions??[])if(check.kind==='equals')checkEmbeddedJson(check.expected)
  for(const binding of step.bindings??[])if(binding.selector)checkEmbeddedJson(binding.selector.expected)
 }
 for(const variable of scenario.variables??[])if(variable.source==='static'&&variable.valueType==='json')checkEmbeddedJson(variable.value)
 for(const edge of scenario.connections??[])if(edge.waitFor?.valueType==='json')checkEmbeddedJson(edge.waitFor.value)
 return {kind:file.kind,scenario}
}
export const scenarioKey=(kind,id)=>JSON.stringify([kind,id])
export async function sharedFileName(kind,scenario) {
 if(!['builder','chain'].includes(kind))throw new Error('Unsupported scenario kind.')
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scenario.id)))].map(value=>value.toString(16).padStart(2,'0')).join('')
 const slug=scenario.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'scenario'
 return `${kind}-${slug}-${hash}${FILE_SUFFIX}`
}
