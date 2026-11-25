import { valueAtPath } from '../payload-search/search.js'
import { fragmentPath } from './references.js'

function resolvedPath(document, path) {
  const references = new Set()
  while (path) {
    const node = valueAtPath(document, path)
    if (node === undefined) return null
    if (typeof node?.$ref !== 'string') return path
    if (references.has(node.$ref)) return null
    references.add(node.$ref)
    path = fragmentPath(node.$ref)
  }
  return null
}

function propertyPath(document, schemaPath, field) {
  const queue = [schemaPath], seen = new Set(), candidates = new Map()
  while (queue.length && seen.size < 100) {
    const path = resolvedPath(document, queue.shift())
    if (!path) continue
    const key = JSON.stringify(path)
    if (seen.has(key)) continue
    seen.add(key)
    const schema = valueAtPath(document, path)
    if (schema?.properties && Object.hasOwn(schema.properties, field)) {
      const candidate = [...path, 'properties', field]
      candidates.set(JSON.stringify(candidate), candidate)
      continue
    }
    if (/^(0|[1-9][0-9]*)$/.test(field) && schema?.items && typeof schema.items === 'object') {
      const candidate = [...path, 'items']
      candidates.set(JSON.stringify(candidate), candidate)
      continue
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
      if (!Array.isArray(schema?.[keyword])) continue
      for (let index = 0; index < Math.min(schema[keyword].length, 100); index++) {
        queue.push([...path, keyword, String(index)])
      }
    }
  }
  return !queue.length && candidates.size === 1 ? candidates.values().next().value : null
}

export function requestSchemaPath(document, operationPath, { mediaType, pointer } = {}) {
  if (!operationPath) return null
  const bodyPath = [...operationPath, 'requestBody']
  if (valueAtPath(document, bodyPath) === undefined) return operationPath
  const body = resolvedPath(document, bodyPath)
  if (!body || !mediaType) return body ?? bodyPath
  const schemaPath = [...body, 'content', mediaType, 'schema']
  let path = resolvedPath(document, schemaPath)
  if (!path) return body
  const fields = pointer ? fragmentPath('#' + pointer.replaceAll('%', '%25')) : []
  for (const field of fields ?? []) {
    const target = propertyPath(document, path, field)
    if (!target) break
    path = target
  }
  return path
}
