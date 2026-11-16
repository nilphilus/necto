// Suggestions are bounded and contain paths only, never captured response values.
const segment = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1')
export function pointerHints(operation, response) {
  const paths = new Set(['']), limit = 150
  const add = path => { if (paths.size < limit) paths.add(path) }
  function visitValue(value, path, depth) {
    if (depth >= 8 || paths.size >= limit || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { if (value.length) { add(path + '/0'); visitValue(value[0], path + '/0', depth + 1) }; return }
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      const child = path + '/' + segment(key); add(child); visitValue(value[key], child, depth + 1)
      if (paths.size >= limit) break
    }
  }
  function visitSchema(raw, path, depth, ancestors = new Set()) {
    if (!raw || depth >= 8 || paths.size >= limit || ancestors.has(raw)) return
    const schema = operation?.resolve(raw)
    if (!schema) return
    const seen = new Set(ancestors); seen.add(raw)
    for (const branch of [...(schema.allOf ?? []), ...(schema.oneOf ?? []).slice(0, 1), ...(schema.anyOf ?? []).slice(0, 1)]) visitSchema(branch, path, depth + 1, seen)
    if (schema.items) { add(path + '/0'); visitSchema(schema.items, path + '/0', depth + 1, seen) }
    for (const key in schema.properties ?? {}) {
      if (!Object.hasOwn(schema.properties, key)) continue
      const child = path + '/' + segment(key); add(child); visitSchema(schema.properties[key], child, depth + 1, seen)
      if (paths.size >= limit) break
    }
  }
  visitValue(response, '', 0)
  if (operation) {
    const entries = Object.entries(operation.responses ?? {})
    const raw = entries.find(([code]) => /^2\d\d$/.test(code))?.[1] ?? entries[0]?.[1]
    const result = operation.resolve(raw)
    const media = Object.entries(result?.content ?? {}).find(([type]) => /(?:\/|\+)json(?:;|$)/i.test(type))
    visitSchema(media?.[1]?.schema, '', 0)
  }
  return [...paths]
}
