import { valueAtPath } from '../payload-search/search.js'

export function fragmentPath(fragment) {
  if (fragment === '#' || fragment === '') return []
  if (!fragment.startsWith('#')) return null
  try {
    const pointer = decodeURIComponent(fragment.slice(1))
    if (!pointer.startsWith('/')) return null
    return pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
  } catch { return null }
}

export function referenceTarget(current, reference, documents = []) {
  let source = current
  let fragment = reference
  if (!reference.startsWith('#')) {
    try {
      const url = new URL(reference, current.url)
      fragment = url.hash
      url.hash = ''
      source = [current, ...documents].find(candidate => candidate?.url === url.href)
    } catch { return null }
  }
  const path = fragmentPath(fragment)
  if (!source?.document || !path || valueAtPath(source.document, path) === undefined) return null
  return { source, path }
}

export function findOperationPath(source, path, method) {
  let parts = ['paths', path]
  const seen = new Set()
  while (parts) {
    const item = valueAtPath(source.document, parts)
    if (item && Object.hasOwn(item, method)) return [...parts, method]
    const reference = item?.$ref
    if (typeof reference !== 'string' || !reference.startsWith('#') || seen.has(reference)) return null
    seen.add(reference)
    parts = fragmentPath(reference)
  }
  return null
}
