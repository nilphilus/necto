import { bodyContent, isJson } from '../workbench/body.js'
import { inferVariant, pointer, prefix, schemaView } from './bodySchema.js'
import { pointerParts } from './pointers.js'

// Prefer the exact OpenAPI name. Only infer casing when the match is unique.
function fieldName(properties, key) {
  if (Object.hasOwn(properties, key)) return key
  const lower = key.toLowerCase()
  const matches = Object.keys(properties).filter(name => name.toLowerCase() === lower)
  return matches.length === 1 ? matches[0] : key
}

export function normalizeBodyFieldNames(operation, request, inputs) {
  const media = bodyContent(operation, request)
  if (!isJson(media?.[0] ?? '') || !media[1].schema) return { body: request.body, inputs }

  let body
  try { body = JSON.parse(request.body || '{}') } catch { return { body: request.body, inputs } }
  let changed = false
  let conflict
  const viewFor = (raw, value, path) => schemaView(operation, raw,
    inferVariant(operation, raw, value, request.bodyVariants?.[pointer(path)]))

  function normalizeValue(raw, value, path) {
    if (!raw || !value || typeof value !== 'object' || path.length >= 32) return value
    const schema = viewFor(raw, value, path)
    if (Array.isArray(value)) return value.map((item, index) => normalizeValue(schema.items, item, [...path, index]))
    const entries = Object.entries(value)
    const mapped = entries.map(([key, item]) => [fieldName(schema.properties, key), key, item])
    const counts = new Map()
    for (const [name] of mapped) counts.set(name, (counts.get(name) ?? 0) + 1)
    return Object.fromEntries(mapped.map(([name, key, item]) => {
      if (name !== key && counts.get(name) > 1) {
        conflict ??= `Both ${pointer([...path, key])} and ${pointer([...path, name])} refer to the same OpenAPI field. Keep one spelling in Raw JSON.`
        return [key, item]
      }
      if (name !== key) changed = true
      return [name, normalizeValue(schema.properties[name], item, [...path, name])]
    }))
  }
  body = normalizeValue(media[1].schema, body, [])

  function normalizeInput(input) {
    if (input.location !== 'body' || !input.pointer) return input
    let original
    try { original = pointerParts(input.pointer) } catch { return input }
    let raw = media[1].schema
    let value = body
    const parts = []
    for (const part of original) {
      const schema = viewFor(raw, value, parts)
      const array = Array.isArray(value) || schema.type === 'array'
      const name = array ? part : fieldName(schema.properties, part)
      parts.push(name)
      raw = array ? schema.items : schema.properties[name]
      value = value && typeof value === 'object' && Object.hasOwn(value, name) ? value[name] : undefined
    }
    const target = pointer(parts)
    if (target === input.pointer) return input
    try { pointerParts(target) } catch { return input }
    return { ...input, pointer: target }
  }
  const normalized = inputs.map(normalizeInput)
  const targets = []
  for (const input of normalized) {
    if (input.location !== 'body') continue
    let path
    try { path = pointerParts(input.pointer) } catch { continue }
    if (targets.some(target => prefix(path, target) || prefix(target, path))) {
      conflict ??= `Conflicting sources for ${input.pointer || '(whole body)'} after matching OpenAPI field names. Keep one source in Advanced body bindings.`
    }
    targets.push(path)
  }
  return conflict ? { body: request.body, inputs, conflict }
    : { body: changed ? JSON.stringify(body, null, 2) : request.body, inputs: normalized }
}
