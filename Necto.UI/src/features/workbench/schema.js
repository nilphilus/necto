import { jsonEqual } from './equality.js'
export function schemaIssues(
  value,
  raw,
  resolve = (value) => value,
  path = '$',
  budget = { remaining: 5000 },
  depth = 0
) {
  if (--budget.remaining < 0 || depth > 32) return []
  const schema = resolve(raw)
  if (!schema) return []
  const issues = [],
    add = (message) => {
      if (issues.length < 30) issues.push(`${path}: ${message}`)
    }
  if (value === null && schema.nullable) return issues
  const type = Array.isArray(value)
    ? 'array'
    : value === null
      ? 'null'
      : typeof value
  const expected = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : []
  if (
    expected.length &&
    !expected.some(
      (item) => item === type || (item === 'integer' && Number.isInteger(value))
    )
  )
    add(`expected ${expected.join(' or ')}`)
  if (schema.enum && !schema.enum.some((item) => jsonEqual(item, value)))
    add('value is outside the enum')
  if (schema.const !== undefined && !jsonEqual(schema.const, value))
    add('does not match const')
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      add(`minimum ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum)
      add(`maximum ${schema.maximum}`)
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      add(`minimum length ${schema.minLength}`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      add(`maximum length ${schema.maxLength}`)
  }
  if (type === 'object') {
    for (const name of schema.required ?? [])
      if (!Object.hasOwn(value, name)) add(`${name} is required`)
    for (const [name, child] of Object.entries(schema.properties ?? {}))
      if (Object.hasOwn(value, name))
        issues.push(
          ...schemaIssues(
            value[name],
            child,
            resolve,
            `${path}.${name}`,
            budget,
            depth + 1
          )
        )
  }
  if (type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      add(`minimum ${schema.minItems} items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      add(`maximum ${schema.maxItems} items`)
    if (schema.items)
      for (let index = 0; index < value.length && budget.remaining > 0; index++)
        issues.push(
          ...schemaIssues(
            value[index],
            schema.items,
            resolve,
            `${path}[${index}]`,
            budget,
            depth + 1
          )
        )
  }
  for (const child of schema.allOf ?? [])
    issues.push(...schemaIssues(value, child, resolve, path, budget, depth + 1))
  for (const kind of ['oneOf', 'anyOf'])
    if (schema[kind]) {
      const matches = schema[kind].filter(
        (child) =>
          schemaIssues(value, child, resolve, path, budget, depth + 1)
            .length === 0
      ).length
      if (kind === 'oneOf' ? matches !== 1 : matches < 1)
        add(
          `${kind}: expected ${kind === 'oneOf' ? 'exactly one' : 'at least one'} matching variant`
        )
    }
  return issues.slice(0, 30)
}
