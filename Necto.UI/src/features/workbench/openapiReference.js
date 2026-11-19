export function resolveReference(spec, value) {
  const visited = new Set()
  while (value?.$ref) {
    const reference = value.$ref
    if (!reference.startsWith('#/') || visited.has(reference)) return undefined
    visited.add(reference)
    value = decodeURIComponent(reference.slice(2)).split('/').reduce(
      (node, key) => { const name = key.replaceAll('~1', '/').replaceAll('~0', '~'); return node && Object.hasOwn(node, name) ? node[name] : undefined },
      spec,
    )
  }
  return value
}
