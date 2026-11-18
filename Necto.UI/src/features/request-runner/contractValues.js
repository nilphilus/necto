// Generate only for constraints we can evaluate locally. Never execute schema regexes.
export function contractValues(schema) {
  if (schema.pattern !== undefined || schema.allOf || schema.oneOf || schema.anyOf ||
      schema.not || schema.const !== undefined || schema.multipleOf !== undefined) return []
  const types = Array.isArray(schema.type) ? schema.type.filter(type => type !== 'null') : [schema.type]
  if (types.length !== 1) return []
  const [type] = types
  const found = new Map()
  const add = (label, value) => { if (!found.has(value)) found.set(value, { label, value }) }

  if (type === 'integer' || type === 'number') {
    if (schema.format && !['int32', 'int64', 'float', 'double', 'decimal'].includes(schema.format)) return []
    const exclusive = key => typeof schema[key] === 'number' ? schema[key] : undefined
    const low = exclusive('exclusiveMinimum') ?? schema.minimum
    const high = exclusive('exclusiveMaximum') ?? schema.maximum
    const openLow = schema.exclusiveMinimum === true || exclusive('exclusiveMinimum') !== undefined
    const openHigh = schema.exclusiveMaximum === true || exclusive('exclusiveMaximum') !== undefined
    const valid = value => Number.isFinite(value) && (type !== 'integer' || Number.isSafeInteger(value)) &&
      (schema.format !== 'int32' || value >= -2147483648 && value <= 2147483647) &&
      (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum) &&
      (low === undefined || (openLow ? value > low : value >= low)) &&
      (high === undefined || (openHigh ? value < high : value <= high))
    if (Array.isArray(schema.enum)) {
      for (const value of schema.enum.slice(0, 20)) if (valid(value)) add('Allowed value', value)
    } else if (low !== undefined || high !== undefined) {
      const first = low === undefined ? undefined : type === 'integer' ? (openLow ? Math.floor(low) + 1 : Math.ceil(low)) : openLow ? undefined : low
      const last = high === undefined ? undefined : type === 'integer' ? (openHigh ? Math.ceil(high) - 1 : Math.floor(high)) : openHigh ? undefined : high
      if (valid(first)) add('Lower boundary', first)
      if (valid(last)) add('Upper boundary', last)
      if (!found.size) for (const value of [0, 1, -1, low !== undefined && high !== undefined ? low / 2 + high / 2 : undefined]) {
        if (valid(value)) { add('Inside range', value); break }
      }
    }
  } else if (type === 'string') {
    if (schema.format && !['email', 'uri'].includes(schema.format)) return []
    const min = schema.minLength ?? 0, max = schema.maxLength ?? Infinity
    const valid = value => typeof value === 'string' && value.length <= 1024 &&
      [...value].length >= min && [...value].length <= max &&
      (schema.format !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) &&
      (schema.format !== 'uri' || /^https?:\/\/[^\s]+$/.test(value) && URL.canParse(value))
    if (Array.isArray(schema.enum)) {
      for (const value of schema.enum.slice(0, 20)) if (valid(value)) add('Allowed value', value)
    } else if (schema.format) {
      const sample = schema.format === 'email' ? 'a@example.invalid' : 'https://example.invalid/'
      const padding = Math.max(0, min - sample.length)
      if (padding <= 64) {
        const value = schema.format === 'email' ? 'a'.repeat(padding) + sample : sample + 'a'.repeat(padding)
        if (valid(value)) add('Format example', value)
      }
    } else if (schema.minLength !== undefined || schema.maxLength !== undefined) {
      for (const [label, length] of [[schema.minLength === undefined ? 'Length example' : 'Minimum length', schema.minLength ?? Math.min(1, max)], ['Maximum length', max]]) {
        if (Number.isInteger(length) && length >= 0 && length <= 1024 && length >= min && length <= max) add(label, 'a'.repeat(length))
      }
    }
  }
  return [...found.values()]
}
