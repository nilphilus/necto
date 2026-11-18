export function numericRules(schema) {
  const rules = []
  if (typeof schema?.exclusiveMinimum === 'number') rules.push(['>', schema.exclusiveMinimum])
  if (typeof schema?.minimum === 'number')
    rules.push([schema.exclusiveMinimum === true ? '>' : '≥', schema.minimum])
  if (typeof schema?.exclusiveMaximum === 'number') rules.push(['<', schema.exclusiveMaximum])
  if (typeof schema?.maximum === 'number')
    rules.push([schema.exclusiveMaximum === true ? '<' : '≤', schema.maximum])
  if (Number.isFinite(schema?.multipleOf) && schema.multipleOf > 0)
    rules.push(['multiple of', schema.multipleOf])
  return rules
}

export function numericError(input, type, rules) {
  const pattern = type === 'integer' ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
  const value = Number(input)
  if (!pattern.test(String(input)) || !Number.isFinite(value)) return `must be a finite ${type}`
  for (const [operator, limit] of rules) {
    if (operator === 'multiple of') {
      const quotient = value / limit
      const tolerance = Math.min(1e-9, Math.abs(quotient) * Number.EPSILON * 4)
      if (!Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > tolerance)
        return `must be a multiple of ${limit}`
    } else if ((operator === '>' && value <= limit) || (operator === '≥' && value < limit) ||
      (operator === '<' && value >= limit) || (operator === '≤' && value > limit)) {
      return `must be ${operator} ${limit}`
    }
  }
}
