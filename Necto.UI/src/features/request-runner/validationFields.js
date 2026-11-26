import { parseExpressionAt } from 'acorn'

function errorPath(key) {
  if (key.startsWith('/')) return key.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  const path = key.replace(/^\$\./, '').replace(/\[(\d+)\]/g, '.$1')
  return path && !/[\[\]]/.test(path) ? path.split('.') : []
}

export function validationFields(errors, body) {
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
    let node = root, start
    for (const segment of path) {
      if (node?.type === 'ObjectExpression') {
        const properties = node.properties.filter(property => property.key?.value === segment)
        start = properties[0]?.start
        node = properties.length === 1 ? properties[0].value : null
      } else if (node?.type === 'ArrayExpression' && /^(0|[1-9]\d*)$/.test(segment)) {
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
