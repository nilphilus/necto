import { valueAtPath } from '../payload-search/search.js'

const brief = value => String(value).slice(0, 80) + (String(value).length > 80 ? '…' : '')

// Follow only the selected path, including composed schemas; never scan the payload.
function variants(schema, resolve, seen = new Set()) {
  if (!schema || typeof schema !== 'object' || seen.has(schema) || seen.size >= 64) return []
  seen.add(schema)
  const resolved = resolve(schema)
  const result = [{ schema: resolved, reference: schema.$ref }]
  if (resolved && resolved !== schema) seen.add(resolved)
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    for (const child of resolved?.[key] ?? []) result.push(...variants(child, resolve, seen))
  }
  return result
}

function typeName(operation, result) {
  const resolve = operation?.resolve ?? (schema => schema)
  const status = String(result.status ?? 200)
  const response = resolve(operation?.responses?.[status] ?? operation?.responses?.[`${status[0]}XX`] ?? operation?.responses?.default)
  const mediaType = result.contentType?.split(';')[0].trim().toLowerCase()
  const content = response?.content
  const schema = content?.[mediaType]?.schema ?? Object.entries(content ?? {}).find(([type]) => /(?:\/|\+)json$/i.test(type))?.[1]?.schema
  let candidates = variants(schema, resolve)
  for (const part of result.selectedPath) {
    candidates = candidates.flatMap(({ schema }) => variants(typeof part === 'number' ? schema?.items : schema?.properties?.[part] ?? schema?.additionalProperties, resolve))
    if (candidates.length > 64) return 'object'
  }
  const names = new Set(candidates.map(({ schema, reference }) => {
    if (typeof schema?.title === 'string' && schema.title.trim()) return schema.title.trim()
    if (reference?.startsWith('#/components/schemas/')) {
      try { return decodeURIComponent(reference.slice('#/components/schemas/'.length)).replaceAll('~1', '/').replaceAll('~0', '~') } catch { return undefined }
    }
  }).filter(Boolean))
  return names.size === 1 ? brief([...names][0].replace(/([a-z0-9])([A-Z])/g, '$1 $2')) : 'object'
}

export function selectionLabel(operation, result) {
  if (!Array.isArray(result.selectedPath)) return ''
  const value = valueAtPath(result.json, result.selectedPath)
  const identifiers = [], descriptions = []
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    let inspected = 0
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      if (++inspected > 100) break
      const field = value[key]
      if (!['string', 'number'].includes(typeof field) || field === '') continue
      if (/(?:^id$|Id$|_id$)/.test(key)) identifiers.push(`${brief(key)}: ${brief(field)}`)
      else if (/^(name|title|code)$/i.test(key)) descriptions.push(`${key}: ${brief(field)}`)
      if (identifiers.length === 2) break
    }
  }
  const identity = (identifiers.length ? identifiers : descriptions).slice(0, 2)
  return [`Selected ${typeName(operation, result)}`, ...identity].join(' · ')
}
