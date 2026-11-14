import { applyContractExample } from './contractExample.js'
import { formFields, isJson } from './body.js'

export const exampleDrafts = new WeakMap()

export function mediaExamples(content = {}, resolve = value => value) {
  const entries = Object.entries(content.examples ?? {}).flatMap(([name, raw]) => {
    const example = resolve(raw)
    if (!example) return []
    return [{ id: name, name: example.summary || name, description: example.description,
      value: example.value, available: Object.hasOwn(example, 'value'),
      reason: example.externalValue ? 'External example files are not fetched.' : 'Example value is unavailable.' }]
  })
  // Media examples override schema examples, including external-only examples.
  if (entries.length) return entries
  if (Object.hasOwn(content, 'example')) return [{ id: '$example', name: 'Example', value: content.example, available: true }]
  const schema = resolve(content.schema)
  if (Array.isArray(schema?.examples)) return schema.examples.map((value, index) => ({ id: '$schema:'+index, name: 'Example '+(index+1), value, available:true }))
  return schema && Object.hasOwn(schema, 'example') ? [{ id:'$schema', name:'Example', value:schema.example, available:true }] : []
}
export function requestExamples(operation) {
  const entries = Object.entries(operation.requestBody?.content ?? {}).flatMap(([mediaType, content]) =>
    mediaExamples(content, operation.resolve).map(example => ({ ...example, id:JSON.stringify(['body',mediaType,example.id]), kind:'body', mediaType,
      name: example.name, subtitle: mediaType,
      available: example.available && (isJson(mediaType) || /^(text\/)|xml|yaml|javascript|multipart\/form-data|application\/x-www-form-urlencoded/i.test(mediaType)),
      reason: example.available ? 'This media type requires its file or request editor.' : example.reason })))
  for (const parameter of operation.parameters ?? []) {
    if (!['path','query','header','cookie'].includes(parameter.in)) continue
    const content = parameter.content ? Object.values(parameter.content)[0] : parameter
    for (const example of mediaExamples(content, operation.resolve)) entries.push({ ...example,
      id:JSON.stringify(['parameter',parameter.in,parameter.name,example.id]),kind:'parameter',location:parameter.in,field:parameter.name,
      name:parameter.name+' · '+example.name, subtitle:parameter.in,
      available:example.available && parameter.in !== 'cookie', reason:parameter.in === 'cookie' ? 'Browser cookies are managed through Authorize.' : example.reason })
  }
  return entries
}
export function applyRequestExample(operation, session, example) {
  if (session.pending) throw new Error('Wait for the running request before loading an example.')
  if (!example.available) throw new Error(example.reason)
  if (example.kind === 'parameter') {
    if (!operation.parameters?.some(parameter => parameter.in === example.location && parameter.name === example.field)) throw new Error('This example parameter is no longer available.')
    const key = `${example.location}:${example.field}`
    session.fields[key] = typeof example.value === 'object' ? JSON.stringify(example.value) : String(example.value)
    session.bindings = (session.bindings ?? []).filter(binding => binding.location !== example.location || binding.name !== example.field)
  } else if (['multipart/form-data','application/x-www-form-urlencoded'].includes(example.mediaType)) {
    if (!example.value || typeof example.value !== 'object' || Array.isArray(example.value)) throw new Error('This form example must be an object.')
    if (!Object.hasOwn(operation.requestBody?.content ?? {}, example.mediaType)) throw new Error('This request media type is no longer available.')
    const rows = formFields(operation, example.mediaType).map(row => {
      const present = Object.hasOwn(example.value, row.name), value = example.value[row.name]
      return { ...row, enabled:present || row.required, files:[], attachmentRequired:row.kind === 'file' && (present || row.required),
        value:present && row.kind !== 'file' ? typeof value === 'object' ? JSON.stringify(value) : String(value) : '' }
    })
    session.mediaType = example.mediaType; session.formFields = rows; session.body = ''; session.binaryFile = undefined; session.binaryAttachmentRequired = false
    session.bindings = (session.bindings ?? []).filter(binding => binding.location !== 'body')
  } else {
    applyContractExample(session, operation, {mediaType:example.mediaType,value:example.value})
    session.formFields = undefined; session.binaryFile = undefined; session.binaryAttachmentRequired = false
  }
  session.sampleName = undefined; session.exampleKey = example.id
  session.resultStale = Boolean(session.result); session.error = ''
}
// A reversible switch into published examples. No results or credentials copied.
export function draftSnapshot(session) {
  return { body:session.body, fields:{...session.fields}, mediaType:session.mediaType, variantIndex:session.variantIndex,
    formFields:session.formFields?.map(row => ({...row,files:[...(row.files ?? [])]})), binaryFile:session.binaryFile,
    binaryAttachmentRequired:session.binaryAttachmentRequired, bindings:(session.bindings ?? []).map(binding => ({...binding})), sampleName:session.sampleName }
}
export function restoreExampleDraft(session, snapshot) {
  if (session.pending) return
  Object.assign(session, snapshot);session.exampleKey = undefined;session.resultStale=Boolean(session.result);session.error=''
}
