const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
export function pointerParts(pointer) {
  if (typeof pointer !== 'string' || pointer.length > 2048 || pointer !== '' && !pointer.startsWith('/')) throw new Error('Use a JSON Pointer such as /items/0/id. Leave empty for the whole value.')
  const parts = pointer === '' ? [] : pointer.slice(1).split('/').map(part => {
    if (/~(?:[^01]|$)/.test(part)) throw new Error('Escape ~ as ~0 and / as ~1 in JSON Pointers.')
    return part.replaceAll('~1', '/').replaceAll('~0', '~')
  })
  if (parts.length > 32 || parts.some(part => forbidden.has(part))) throw new Error('This JSON Pointer is not supported.')
  return parts
}
export function readPointer(value, pointer) {
  for (const part of pointerParts(pointer)) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error(`Response has no value at ${pointer || '(root)'}.`)
    value = value[part]
  }
  if (value === undefined) throw new Error('Response has no JSON value.')
  return value
}
