import { savedBlueprint } from '../scenario-builder/useBuilder.js'
import { validateScenario } from '../scenarios/scenario.js'
import { payloadSnapshot } from '../workbench/body.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { sensitiveName } from '../workbench/privacy.js'
import { retainDraft, bodyPolicy, sensitiveFields } from '../workbench/sensitiveSchema.js'
import { pointerParts } from '../scenario-builder/pointers.js'
export const FILE_LIMIT = 2 * 1024 * 1024
export const FOLDER_NAME = 'necto-scenarios'
export const FILE_SUFFIX = '.necto.json'
const clone=value=>JSON.parse(JSON.stringify(value))
function requestDefinition(request) {
 request.assertions=(request.assertions??[]).map(check=>({kind:check.kind,path:check.path,expected:check.expected}))
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
  if(valid)return JSON.stringify(clean(parsed,depth+1,budget))
 }
 if(typeof value==='string'&&/^https?:\/\//i.test(value)){
  try {const url=new URL(value);url.username='';url.password='';for(const key of [...url.searchParams.keys()])if(sensitiveName(key))url.searchParams.delete(key);return url.href}catch{/* Keep non-URL static text. */}
 }
 return value
}
function shapes(raws,resolve) {
 const stack=[...raws],seen=new Set(),result=[]
 while(stack.length){const schema=resolve(stack.pop());if(!schema||typeof schema!=='object'||seen.has(schema))continue;if(seen.size>=256)throw new Error('Sensitive schema is too complex to share safely.');seen.add(schema);result.push(schema);for(const key of ['allOf','anyOf','oneOf'])stack.push(...(schema[key]??[]))}
 return result
}
function sensitiveTarget(operation,input,request) {
 if(input.location!=='body')return sensitiveName(input.name)||operation.parameters?.some(parameter=>parameter.in===input.location&&parameter.name===input.name&&operation.resolve(parameter)?.['x-necto-sensitive']===true)
 const resolve=operation.resolve??(value=>value)
 let schemas=shapes([bodyPolicy(operation,request).schema],resolve)
 for(const part of pointerParts(input.pointer)){
  if(sensitiveName(part)||schemas.some(schema=>schema['x-necto-sensitive']===true||sensitiveFields(schema,resolve).has(part)))return true
  schemas=shapes(schemas.flatMap(schema=>schema.properties?.[part]?[schema.properties[part]]:schema.items&&/^\d+$/.test(part)?[schema.items]:typeof schema.additionalProperties==='object'?[schema.additionalProperties]:[]),resolve)
 }
 return schemas.some(schema=>schema['x-necto-sensitive']===true)
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
  if(!operation)throw new Error(`${step.label??step.name}: load the endpoint's API before saving to the folder.`)
  const request=kind==='builder'?step.request:step
  for(const input of step.inputs??[])if(input.source==='variable'&&sensitiveTarget(operation,input,request))secretVariables.add(input.variableId)
  const retained=retainDraft(operation,request)
  request.fields=clean(Object.fromEntries(Object.entries(request.fields).filter(([key])=>!operation.parameters?.some(parameter=>key===parameter.in+':'+parameter.name&&operation.resolve(parameter)?.['x-necto-sensitive']===true))))
  request.body=retained.body??''
  if(request.body.trim()){
   let json=false,value
   try{value=JSON.parse(request.body);json=true}catch{/* Free text is retained; UI asks users to review static data. */}
   if(json)request.body=JSON.stringify(clean(value),null,2)
  }
  request.formFields=retained.formFields?.filter(row=>!sensitiveName(row.name)).map(row=>({...row,value:clean(row.value),files:[]}))
  request.extraHeaders=clean(request.extraHeaders)
  request.extraQuery=request.extraQuery?.filter(([name])=>!sensitiveName(name)).map(([name,value])=>[name,clean(value)])
  request.serverValues=clean(request.serverValues)
 }
 for(const variable of scenario.variables??[])if(variable.source==='static'){
  if(sensitiveName(variable.name)||secretVariables.has(variable.id)){variable.source='human';variable.prompt='Enter '+variable.name;delete variable.value}
  else if(variable.valueType==='json')variable.value=JSON.stringify(clean(JSON.parse(variable.value)))
  else variable.value=clean(variable.value)
 }
 return canonicalScenario(kind,scenario)
}
export function serializeShared(kind,scenario) {
 const text=JSON.stringify({format:'necto-shared-scenario',version:1,kind,scenario:canonicalScenario(kind,scenario)},null,2)+'\n'
 if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')
 return text
}
export function parseShared(text) {
 if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')
 const file=JSON.parse(text)
 if(file?.format!=='necto-shared-scenario'||file.version!==1)throw new Error('Unsupported shared scenario file.')
 return {kind:file.kind,scenario:canonicalScenario(file.kind,file.scenario)}
}
export const scenarioKey=(kind,id)=>JSON.stringify([kind,id])
export async function sharedFileName(kind,scenario) {
 if(!['builder','chain'].includes(kind))throw new Error('Unsupported scenario kind.')
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scenario.id)))].map(value=>value.toString(16).padStart(2,'0')).join('')
 const slug=scenario.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'scenario'
 return `${kind}-${slug}-${hash}${FILE_SUFFIX}`
}
