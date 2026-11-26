import { numericError, numericRules } from '../request-runner/numericParameter.js'

export function collectedValueIssue(field, value) {
  for (const schema of field.schemas ?? []) {
    const issue = schemaIssue(schema, value, field.location === 'body', field.required)
    if (issue) return issue
  }
  return ''
}

function schemaIssue(schema, value, json, required) {
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter(Boolean)
  if (value === null && schema.nullable) return ''
  if (!json && value === '' && required) return 'cannot be empty'
  if (types.length) {
    const results = types.map(type => typeIssue(type, schema, value, json))
    if (results.every(Boolean)) return types.length === 1 ? results[0] : 'must be ' + types.join(' or ')
  }
  const equal = (a, b) => json || typeof a === 'object' || typeof b === 'object' ? a === b : String(a) === String(b)
  if (Array.isArray(schema.enum) && schema.enum.every(item => item === null || typeof item !== 'object') &&
      !schema.enum.some(item => equal(item, value))) return 'must match one of the allowed values'
  if (Object.hasOwn(schema, 'const') && (schema.const === null || typeof schema.const !== 'object') &&
      !equal(schema.const, value)) return 'must match the specified constant'
  return ''
}

function typeIssue(type, schema, value, json) {
  switch (type) {
    case 'integer':
    case 'number':
      if (value === null || (json && (typeof value !== 'number' ||
          (type === 'integer' && !Number.isInteger(value))))) return 'must be a finite ' + type
      return numericError(value, json ? 'number' : type, numericRules(schema))
    case 'boolean':
      return typeof value === 'boolean' || (!json && ['true', 'false'].includes(value)) ? '' : 'must be a boolean'
    case 'string':
      return typeof value === 'string' || (!json && value !== null && ['number', 'boolean'].includes(typeof value))
        ? '' : 'must be a string'
    case 'array':
      return Array.isArray(value) ? '' : 'must be an array'
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? '' : 'must be an object'
    case 'null':
      return value === null ? '' : 'must be null'
    default:
      return ''
  }
}
