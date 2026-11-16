export function responseCollection(operation, result) {
  const resolve = operation?.resolve ?? (value => value)
  const status = String(result.status ?? 200)
  const response = resolve(operation?.responses?.[status] ?? operation?.responses?.[status[0] + 'XX'] ?? operation?.responses?.default)
  const media = result.contentType?.split(';')[0].trim().toLowerCase()
  const schema = resolve(response?.content?.[media]?.schema)
  const property = schema?.['x-necto-collection']
  if (typeof property !== 'string' || !result.json || typeof result.json !== 'object' || !Object.hasOwn(result.json, property) || !Array.isArray(result.json[property])) return null
  const countProperty = schema['x-necto-total-count']
  const total = typeof countProperty === 'string' && Object.hasOwn(result.json, countProperty) && Number.isSafeInteger(result.json[countProperty]) && result.json[countProperty] >= 0 ? result.json[countProperty] : null
  return { path: [property], total }
}
