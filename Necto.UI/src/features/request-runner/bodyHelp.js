export function hasBodyExample(content, resolve) {
  return Object.hasOwn(content, 'example') || Object.values(content.examples ?? {}).some(entry => Object.hasOwn(resolve(entry) ?? {}, 'value'))
}

export function bodyFields(operation, schema) {
  const fields = []
  function visit(value, path = '', depth = 0, seen = new Set()) {
    value = operation.resolve(value)
    if (!value || seen.has(value) || depth > 3 || fields.length >= 40) return
    const nested = new Set([...seen, value])
    for (const [name, raw] of Object.entries(value.properties ?? {})) {
      const property = operation.resolve(raw)
      if (!property || property.readOnly) continue
      const label = path ? `${path}.${name}` : name
      const rules = [value.required?.includes(name) ? 'required' : 'optional', property.type ?? (property.$ref ? 'reference' : 'object')]
      if (property.minimum !== undefined) rules.push(`min ${property.minimum}`)
      if (property.minLength) rules.push(`at least ${property.minLength} characters`)
      if (property.pattern) rules.push(`pattern ${property.pattern}`)
      if (property.enum) rules.push(property.enum.map(String).join(' / '))
      fields.push({ path: label, rules: rules.join(' · ') })
      if (fields.length >= 40) return
      visit(property.type === 'array' ? property.items : property, property.type === 'array' ? label + '[]' : label, depth + 1, nested)
    }
  }
  visit(schema)
  return fields
}

// Locate the first invalid token when the engine omits an offset from SyntaxError.
export function jsonErrorOffset(text) {
  const stack = [{ kind: 'root', state: 'value' }]
  const token = /"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y
  let i = 0
  while (i < text.length) {
    if (/[ \t\r\n]/.test(text[i])) { i++; continue }
    const frame = stack.at(-1), char = text[i]
    if (frame.state === 'end') return i
    if (frame.state === 'colon') {
      if (char !== ':') return i
      frame.state = 'value'; i++; continue
    }
    if (frame.state === 'comma') {
      if (char === (frame.kind === 'object' ? '}' : ']')) { stack.pop(); i++; continue }
      if (char !== ',') return i
      frame.state = frame.kind === 'object' ? 'key' : 'value'; i++; continue
    }
    if (frame.state === 'key' || frame.state === 'firstKey') {
      if (char === '}' && frame.state === 'firstKey') { stack.pop(); i++; continue }
      if (char !== '"') return i
      token.lastIndex = i
      const match = token.exec(text)
      if (!match) return i
      i = token.lastIndex; frame.state = 'colon'; continue
    }
    if (char === ']' && frame.state === 'firstValue') { stack.pop(); i++; continue }
    frame.state = frame.kind === 'root' ? 'end' : 'comma'
    if (char === '{' || char === '[') {
      stack.push({ kind: char === '{' ? 'object' : 'array', state: char === '{' ? 'firstKey' : 'firstValue' }); i++; continue
    }
    token.lastIndex = i
    if (!token.exec(text)) return i
    i = token.lastIndex
  }
  return text.length
}

export function jsonBodyIssue(body, cause) {
  const nativeOffset = Number(cause?.message?.match(/position\s+(\d+)/i)?.[1])
  const offset = Number.isFinite(nativeOffset) ? nativeOffset : jsonErrorOffset(body)
  const before = body.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - before.lastIndexOf('\n')
  return `Invalid JSON body at line ${line}, column ${column}. Check property quotes, commas and brackets.`
}
