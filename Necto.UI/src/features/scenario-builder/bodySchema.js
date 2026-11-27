import { applyInput } from './model.js'
import { pointerParts, readPointer } from './pointers.js'
import { schemaTemplate } from '../request-runner/schemaTemplate.js'
export const BODY_VALUE=Symbol('necto-body-value')
export const BODY_FIELD_EDITOR = Symbol('necto-body-field-editor')
export const BODY_SOURCE_LABELS = {
  response: 'From response', variable: 'Shared variable', preset: 'Preset',
  generate: 'Generate data', expression: 'Expression', random: 'Pick random', human: 'Ask at run time',
}
export const pointer = parts => parts.length ? '/' + parts.map(part=>String(part).replaceAll('~','~0').replaceAll('/','~1')).join('/') : ''
export const prefix = (a,b) => a.length<=b.length && a.every((part,index)=>String(part)===String(b[index]))
export function schemaView(operation, raw, variant=0, seen=new Set()) {
  const schema=operation.resolve(raw) ?? {}
  if (seen.has(schema)) return schema
  const next=new Set(seen).add(schema), variants=schema.oneOf ?? schema.anyOf ?? []
  const parts=[schema,...(schema.allOf??[]).map(part=>schemaView(operation,part,0,next)),...(variants.length?[schemaView(operation,variants[variant]??variants[0],0,next)]:[])]
  const view=Object.assign(Object.create(null),...parts,{properties:Object.assign(Object.create(null),...parts.map(part=>part.properties??{})),required:[...new Set(parts.flatMap(part=>part.required??[]))]})
  delete view.allOf;delete view.oneOf;delete view.anyOf
  return view
}
export function bodyAt(step,path) { try{return readPointer(JSON.parse(step.request.body),pointer(path))}catch{return undefined} }
export function bindingAt(step,path) { return step.inputs.find(input=>input.location==='body'&&input.pointer===pointer(path)) }
export function bodyBindingsUnder(bindings, path) {
  return bindings.flatMap((binding) => {
    if (binding.location !== 'body') return []
    try {
      const target = pointerParts(binding.pointer)
      return target.length > path.length && prefix(path, target) ? [target[path.length]] : []
    } catch {
      // The step validator reports malformed pointers while they are being edited.
      return []
    }
  })
}
export function bodyFieldEntries(schema, value, bindings, path) {
  const fields = new Map(Object.entries(schema.properties ?? {}))
  const present = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const inferred = typeof schema.additionalProperties === 'object' ? schema.additionalProperties : {}
  for (const key of [...Object.keys(present), ...bodyBindingsUnder(bindings, path)]) {
    if (!fields.has(key)) fields.set(key, inferred)
  }
  return [...fields]
}

export function clearBodyEdits(step,path=[]) {
 if(!step.request.bodyFieldEdits)return
 for(const key of Object.keys(step.request.bodyFieldEdits))if(prefix(path,pointerParts(key))||prefix(pointerParts(key),path))delete step.request.bodyFieldEdits[key]
 if(!Object.keys(step.request.bodyFieldEdits).length)delete step.request.bodyFieldEdits
}
export function writeBody(step,operation,path,value) { applyInput(step.request,operation,{location:'body',pointer:pointer(path)},value);clearBodyEdits(step,path) }
export function editBodyNumber(step,operation,path,text,integer=false) {
 const value=Number(text)
 if(text.trim()===''||!Number.isFinite(value)||integer&&!Number.isInteger(value)) {
  step.request.bodyFieldEdits = { ...step.request.bodyFieldEdits, [pointer(path)]: text }
  return
 }
 writeBody(step,operation,path,value)
}
export function sourceFor(step,operation,path,source,schema) {
  const overlapping=step.inputs.filter(input=>input.location==='body'&&(prefix(path,pointerParts(input.pointer))||prefix(pointerParts(input.pointer),path)))
  const next=step.inputs.filter(input=>!overlapping.includes(input))
  if(source!=='static')next.push({location:'body',pointer:pointer(path),source,...(source==='random'?{stepId:'',responsePointer:'',itemPointer:''}:source==='expression'?{expression:'',bindings:[]}:source==='response'?{stepId:'',responsePointer:''}:source==='variable'?{variableId:''}:source==='generate'?{generator:schema.format==='email'?'email':schema.type==='integer'||schema.type==='number'?'integer':schema.type==='boolean'?'boolean':'uuid',pattern:'INV-[A-Z]{3}-\\d{4}'}:source==='human'?{prompt:'Enter '+(path.at(-1)??'request body'),valueType:schema.type==='number'||schema.type==='integer'?'number':schema.type==='boolean'?'boolean':schema.type==='object'||schema.type==='array'?'json':'text'}:{})})
  if(source!=='static'&&source!=='expression'&&bodyAt(step,path)===undefined)writeBody(step,operation,path,schemaTemplate(operation,schema))
  step.inputs=next;clearBodyEdits(step,path)
}
export function removeBodyField(step,path) {
  const parts=[...path],key=parts.pop()
  const body=JSON.parse(step.request.body),parent=parts.length?readPointer(body,pointer(parts)):body
  if(Array.isArray(parent))throw new Error('Use Remove item for array entries.')
  if(parent&&typeof parent==='object')delete parent[key]
  step.request.body=JSON.stringify(body,null,2);clearBodyEdits(step,path)
  step.inputs=step.inputs.filter(input=>input.location!=='body'||!prefix(path,pointerParts(input.pointer)))
}
export function removeArrayItem(step,operation,path,index) {
  const items=[...(bodyAt(step,path)??[])];items.splice(index,1)
  const inputs=[]
  for(const input of step.inputs){
    if(input.location!=='body'){inputs.push(input);continue}
    const target=pointerParts(input.pointer)
    if(prefix(path,target)&&target.length>path.length&&/^(0|[1-9]\d*)$/.test(target[path.length])){
      const item=Number(target[path.length]);if(item===index)continue
      if(item>index){target[path.length]=String(item-1);inputs.push({...input,pointer:pointer(target)});continue}
    }
    inputs.push(input)
  }
  const edits={}
  for(const [key,text] of Object.entries(step.request.bodyFieldEdits??{})) {
   const target=pointerParts(key)
   if(prefix(path,target)&&target.length>path.length&&/^(0|[1-9]\d*)$/.test(target[path.length])) {
    const item=Number(target[path.length]);if(item===index)continue
    if(item>index)target[path.length]=String(item-1)
   }
   edits[pointer(target)]=text
  }
  writeBody(step,operation,path,items);step.inputs=inputs
  if(Object.keys(edits).length)step.request.bodyFieldEdits=edits
}

export function inferVariant(operation,raw,value,stored) {
 const schema=operation.resolve(raw)??{},variants=schema.oneOf??schema.anyOf??[]
 if(!value||typeof value!=='object')return Number.isInteger(stored)&&stored>=0&&stored<variants.length?stored:0
 const tag=schema.discriminator?.propertyName,mapping=schema.discriminator?.mapping??{}
 if(tag&&Object.hasOwn(value,tag)){const index=variants.findIndex(variant=>variant.$ref===mapping[value[tag]]||operation.resolve(variant)?.properties?.[tag]?.const===value[tag]||operation.resolve(variant)?.properties?.[tag]?.enum?.includes(value[tag]));if(index>=0)return index}
 const scores=variants.map(variant=>Object.keys(schemaView(operation,variant).properties??{}).filter(key=>Object.hasOwn(value,key)).length),best=Math.max(0,...scores)
 return best&&scores.filter(score=>score===best).length===1?scores.indexOf(best):Number.isInteger(stored)&&stored>=0&&stored<variants.length?stored:0
}

export function variantTemplate(operation,raw,index){
 const schema=operation.resolve(raw)??{},selected=(schema.oneOf??schema.anyOf??[])[index],value=schemaTemplate(operation,schemaView(operation,raw,index))
 if(schema.discriminator&&value&&typeof value==='object'&&!Array.isArray(value)){const tag=Object.entries(schema.discriminator.mapping??{}).find(([,reference])=>reference===selected?.$ref)?.[0]??selected?.$ref?.split('/').pop();if(tag)value[schema.discriminator.propertyName]=tag}
 return value
}
