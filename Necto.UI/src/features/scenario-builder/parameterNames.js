import { fieldKey, supportedParameters } from '../request-runner/request.js'

export function normalizeParameterNames(operation, fields, inputs) {
  if (!operation.parameters?.length) return { fields, inputs }
  const parameters = supportedParameters(operation)
  const exact = new Set(parameters.map(fieldKey))
  const candidates = new Map()
  for (const key of exact) {
    const folded = key.toLowerCase()
    candidates.set(folded, candidates.has(folded) ? null : key)
  }

  function canonicalKey(key) {
    if (exact.has(key)) return key
    const separator = key.indexOf(':')
    if (separator < 0) return key
    const candidate = candidates.get(key.toLowerCase())
    // Infer the name only within the original parameter location.
    return candidate?.startsWith(key.slice(0, separator + 1)) ? candidate : key
  }

  const normalizedFields = new Map()
  let conflict
  for (const [key, value] of Object.entries(fields)) {
    const canonical = canonicalKey(key)
    const previous = normalizedFields.get(canonical)
    if (previous && value && previous !== value) {
      conflict ??= `Conflicting saved values for ${canonical}. Keep a single value in the scenario definition.`
    }
    if (value || !normalizedFields.has(canonical)) normalizedFields.set(canonical, value)
  }

  const targets = new Set()
  const normalizedInputs = inputs.map(input => {
    if (input.location === 'body') return input
    const key = fieldKey({ in: input.location, name: input.name })
    const canonical = canonicalKey(key)
    if (targets.has(canonical)) {
      conflict ??= `Conflicting sources for ${canonical}. Keep a single source in the scenario definition.`
    }
    targets.add(canonical)
    return key === canonical ? input : { ...input, name: canonical.slice(input.location.length + 1) }
  })

  return conflict ? { fields, inputs, conflict }
    : { fields: Object.fromEntries(normalizedFields), inputs: normalizedInputs }
}
