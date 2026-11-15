export const TEMPLATE_NODE_LIMIT = 2000
export const TEMPLATE_DEPTH_LIMIT = 24
export const TEMPLATE_CHARACTER_LIMIT = 128 * 1024
export const TEMPLATE_NOTICE = 'Automatic example skipped because the schema exceeds the generation budget. Enter a request body or choose a smaller published example.'
export class TemplateLimitError extends Error {
  constructor() { super(TEMPLATE_NOTICE); this.code = 'TEMPLATE_LIMIT' }
}
const budget = () => ({ nodes: 0, characters: 0 })
function charge(state, characters) {
  state.characters += characters
  if (state.characters > TEMPLATE_CHARACTER_LIMIT) throw new TemplateLimitError()
}
function visit(state, depth) {
  if (++state.nodes > TEMPLATE_NODE_LIMIT || depth > TEMPLATE_DEPTH_LIMIT) throw new TemplateLimitError()
  // Include a conservative allowance for JSON indentation and punctuation before serializing.
  charge(state, 4 * depth + 16)
}
function string(state, value) {
  if (value.length > TEMPLATE_CHARACTER_LIMIT) throw new TemplateLimitError()
  charge(state, JSON.stringify(value).length)
  return value
}
function copy(value, state, depth, ancestors = new Set()) {
  visit(state, depth)
  if (typeof value === 'string') return string(state, value)
  if (!value || typeof value !== 'object') return value
  if (ancestors.has(value)) return null
  const nested = new Set(ancestors).add(value)
  if (Array.isArray(value)) {
    const result = []
    for (const item of value) result.push(copy(item, state, depth + 1, nested))
    return result
  }
  const result = Object.create(null)
  for (const [key, item] of Object.entries(value)) {
    string(state, key); result[key] = copy(item, state, depth + 1, nested)
  }
  return result
}
function generate(operation, raw, state, depth, ancestors, useExamples) {
  visit(state, depth)
  const schema = operation.resolve(raw)
  if (!schema || ancestors.has(schema)) return null
  const nested = new Set(ancestors).add(schema)
  const example = schema.examples?.[0] ?? schema.enum?.[0] ?? schema.const ?? schema.default
  if (useExamples && Object.hasOwn(schema, 'example')) return copy(schema.example, state, depth)
  if (useExamples && example !== undefined) return copy(example, state, depth)
  if (schema.oneOf || schema.anyOf) return generate(operation, (schema.oneOf ?? schema.anyOf)[0], state, depth + 1, nested, useExamples)
  if (schema.allOf) {
    const result = Object.create(null)
    for (const part of schema.allOf) Object.assign(result, generate(operation, part, state, depth + 1, nested, useExamples))
    return result
  }
  const type = Array.isArray(schema.type) ? schema.type.find(type => type !== 'null') : schema.type
  if (type === 'object' || schema.properties) {
    const result = Object.create(null)
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      if (operation.resolve(property)?.readOnly) continue
      string(state, name)
      result[name] = generate(operation, property, state, depth + 1, nested, useExamples)
    }
    return result
  }
  if (type === 'array') return schema.items ? [generate(operation, schema.items, state, depth + 1, nested, useExamples)] : []
  if (type === 'boolean') return false
  if (type === 'integer' || type === 'number') return schema.minimum ?? 0
  if (type === 'string') return 'string'
  return null
}
export function schemaTemplate(operation, schema, useExamples = true) {
  return generate(operation, schema, budget(), 0, new Set(), useExamples)
}
export function formatTemplate(value) {
  const text = JSON.stringify(copy(value, budget(), 0), null, 2)
  if (text?.length > TEMPLATE_CHARACTER_LIMIT) throw new TemplateLimitError()
  return text
}
