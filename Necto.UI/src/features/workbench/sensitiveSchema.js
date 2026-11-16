import { bodyContent } from './body.js'
const LIMIT_MESSAGE = 'Payload is too deep or large to safely retain sensitive fields. Use a smaller saved payload.'
function shapes(raw, resolve) {
  const result=[],seen=new Set(),stack=[raw]
  while(stack.length) {
    const value=resolve(stack.pop())
    if(!value||typeof value!=='object'||seen.has(value))continue
    if(seen.size>=64)throw new Error(LIMIT_MESSAGE)
    seen.add(value);result.push(value)
    for(const kind of ['allOf','oneOf','anyOf'])if(Array.isArray(value[kind]))stack.push(...value[kind].slice(0,65))
  }
  return result
}
export function sensitiveFields(raw,resolve=value=>value) {
  return new Set(shapes(raw,resolve).flatMap(schema=>Array.isArray(schema['x-necto-sensitive-properties'])?schema['x-necto-sensitive-properties'].filter(value=>typeof value==='string'):[]))
}
function hasSensitive(raw,resolve) {
  const stack=[raw],seen=new Set()
  while(stack.length) {
    const value=resolve(stack.pop())
    if(!value||typeof value!=='object'||seen.has(value))continue
    if(seen.size>=4000)return true
    seen.add(value)
    if(Array.isArray(value['x-necto-sensitive-properties'])&&value['x-necto-sensitive-properties'].length)return true
    if(value['x-necto-sensitive']===true)return true
    if(value.items)stack.push(value.items)
    for(const kind of ['allOf','oneOf','anyOf'])if(Array.isArray(value[kind]))stack.push(...value[kind].slice(0,4001))
    for(const property of Object.values(value.properties??{}))stack.push(property)
  }
  return false
}
export function redactSchema(value,raw,resolve=value=>value,mode='mask') {
  if(!hasSensitive(raw,resolve))return value
  let remaining=20000
  function visit(value,schema,depth) {
    if(--remaining<0||depth>64)throw new Error(LIMIT_MESSAGE)
    const variants=shapes(schema,resolve)
    if(variants.some(schema=>schema['x-necto-sensitive']===true))return mode==='omit'?undefined:'[redacted]'
    if(!value||typeof value!=='object')return value
    if(Array.isArray(value)) {
      const items={allOf:variants.flatMap(schema=>schema.items?[schema.items]:[])}
      return value.map(item=>visit(item,items,depth+1))
    }
    const hidden=new Set(variants.flatMap(schema=>Array.isArray(schema['x-necto-sensitive-properties'])?schema['x-necto-sensitive-properties']:[])),entries=[]
    for(const [key,item] of Object.entries(value)) {
      if(hidden.has(key)){if(mode!=='omit')entries.push([key,'[redacted]']);continue}
      const child={allOf:variants.flatMap(schema=>schema.properties?.[key]?[schema.properties[key]]:schema.additionalProperties&&typeof schema.additionalProperties==='object'?[schema.additionalProperties]:[])}
      const result=visit(item,child,depth+1);if(result!==undefined)entries.push([key,result])
    }
    return Object.fromEntries(entries)
  }
  try{return visit(value,raw,0)}catch(error){if(mode==='omit')throw error;return '[redacted: retention limit]'}
}
export function bodyPolicy(operation,draft={}) {return {schema:bodyContent(operation,draft)?.[1]?.schema,resolve:operation.resolve??(value=>value)}}
export function retainPayload(draft,policy) {
  if(!draft||!policy?.schema||!hasSensitive(policy.schema,policy.resolve))return draft
  let body=draft.body
  if(typeof body==='string'&&body.trim()) {
    let parsed
    try{parsed=JSON.parse(body)}catch{throw new Error('Sensitive payload metadata requires a JSON body before saving. The original request is unchanged.')}
    body=JSON.stringify(redactSchema(parsed,policy.schema,policy.resolve,'omit'),null,2)
  }
  const hidden=sensitiveFields(policy.schema,policy.resolve)
  return {...draft,body,formFields:draft.formFields?.filter(row=>!hidden.has(row.name))}
}
export const retainDraft=(operation,draft)=>retainPayload(draft,bodyPolicy(operation,draft))
export function redactResponse(operation,result) {
  const resolve=operation.resolve??(value=>value),status=String(result?.status??200)
  const response=resolve(operation.responses?.[status]??operation.responses?.[status[0]+'XX']??operation.responses?.default)
  const type=result?.contentType?.split(';')[0].trim().toLowerCase()
  const content=response?.content??{}
  const schema=content[type]?.schema??{allOf:Object.entries(content).filter(([media])=>/(?:\/|\+)json$/i.test(media)).map(([,media])=>media.schema)}
  if(result?.json===undefined && hasSensitive(schema,resolve))return '[redacted: unstructured response]'
  return redactSchema(result?.json??result?.text,schema,resolve)
}

export function hasSensitiveBody(operation,draft={}) { const policy=bodyPolicy(operation,draft); return hasSensitive(policy.schema,policy.resolve) }

export const hasSensitivePolicy = policy => Boolean(policy?.schema && hasSensitive(policy.schema,policy.resolve??(value=>value)))
