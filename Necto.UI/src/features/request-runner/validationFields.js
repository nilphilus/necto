import { parseExpressionAt } from 'acorn'

function errorPath(key) {
  if (key.startsWith('/')) return key.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  const path = key.replace(/^\$\./, '').replace(/\[(\d+)\]/g, '.$1')
  return path && !/[\[\]]/.test(path) ? path.split('.') : []
}

function schemaChildren(schemas, segment, array, resolve) {
  const seen = new Set(), children = new Set(), pending = [...schemas]
  while (pending.length && seen.size < 100) {
    const schema = resolve(pending.pop())
    if (!schema || seen.has(schema)) continue
    seen.add(schema)
    if (Array.isArray(schema.allOf)) pending.push(...schema.allOf.slice(0, 100))
    if (array) {
      const index = Number(segment)
      const child = schema.prefixItems?.[index] ?? schema.items
      if (child && typeof child === 'object') children.add(child)
    } else if (schema.properties && Object.hasOwn(schema.properties, segment)) {
      children.add(schema.properties[segment])
    }
  }
  return [...children]
}

export function validationFields(errors, body, schema, resolve = value => value) {
  if (!errors || typeof errors !== 'object' || Array.isArray(errors) || !body || body.length > 250000) return []
  let root
  try {
    JSON.parse(body)
    root = parseExpressionAt(body, 0, { ecmaVersion: 'latest' })
  } catch { return [] }

  const fields = []
  for (const [key, messages] of Object.entries(errors)) {
    const message = (Array.isArray(messages) ? messages : [messages]).find(value => typeof value === 'string' && value.trim())
    if (!message) continue
    const path = errorPath(key)
    const allowCaseFallback = !key.startsWith('/') && !key.startsWith('$.')
    let node = root, start, schemas = schema ? [schema] : []
    for (const [index, segment] of path.entries()) {
      if (node?.type === 'ObjectExpression') {
        const exact = node.properties.filter(property => property.key?.value === segment)
        const properties = exact.length || !allowCaseFallback ? exact : node.properties.filter(property =>
          typeof property.key?.value === 'string' && property.key.value.toLowerCase() === segment.toLowerCase())
        const name = properties.length === 1 ? properties[0].key.value : segment
        schemas = schemaChildren(schemas, name, false, resolve)
        if (!properties.length && index === path.length - 1 && schemas.length) {
          fields.push({ key, message, start: node.start, end: node.start + 1, parent: true })
          node = null
          break
        }
        start = properties[0]?.start
        node = properties.length === 1 ? properties[0].value : null
      } else if (node?.type === 'ArrayExpression' && /^(0|[1-9]\d*)$/.test(segment)) {
        schemas = schemaChildren(schemas, segment, true, resolve)
        node = node.elements[Number(segment)]
        start = node?.start
      } else {
        node = null
      }
    }
    if (path.length && node) fields.push({ key, message, start, end: node.end })
    if (fields.length === 20) break
  }
  return fields
}
