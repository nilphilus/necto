import { redactedRequest } from '../authentication/authentication.js'
import { describeBody } from './body.js'
export const sensitiveName = (name) =>
  /authorization|cookie|token|secret|password|passwd|api[-_]?key|client[-_]?secret/i.test(
    name
  )
export function redactValue(value, depth = 0) {
  if (depth > 16) return '[depth limit]'
  if (Array.isArray(value))
    return value.slice(0, 1000).map((item) => redactValue(item, depth + 1))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 1000)
        .map(([key, item]) => [
          key,
          sensitiveName(key) ? '[redacted]' : redactValue(item, depth + 1)
        ])
    )
  return value
}
function redactDocument(value) {
  if (!value || typeof value !== 'object') return value
  const result = Array.isArray(value) ? [] : Object.create(null)
  const stack = [{ source: value, target: result, depth: 0 }]
  let visited = 0
  while (stack.length) {
    const { source, target, depth } = stack.pop()
    if (depth > 128)
      throw new Error('Request body is too deep to safely export.')
    for (const [key, item] of Object.entries(source)) {
      if (++visited > 250000)
        throw new Error('Request body is too large to safely export.')
      if (sensitiveName(key)) target[key] = '[redacted]'
      else if (item && typeof item === 'object') {
        target[key] = Array.isArray(item) ? [] : Object.create(null)
        stack.push({ source: item, target: target[key], depth: depth + 1 })
      } else target[key] = item
    }
  }
  return result
}
export function safeRequest(request, includeCredentials = false) {
  if (includeCredentials) return request
  const copy = redactedRequest(request),
    headers = new Headers(copy.options.headers)
  for (const key of headers.keys())
    if (sensitiveName(key)) headers.set(key, '[redacted]')
  for (const key of new Set(copy.url.searchParams.keys()))
    if (sensitiveName(key)) copy.url.searchParams.set(key, '[redacted]')
  let body = copy.options.body
  if (typeof body === 'string') {
    let parsed,
      valid = false
    try {
      parsed = JSON.parse(body)
      valid = true
    } catch {
      /* Unstructured text is intentionally not interpreted. */
    }
    if (valid) body = JSON.stringify(redactDocument(parsed))
  }
  if (body instanceof FormData || body instanceof URLSearchParams) {
    const result =
      body instanceof FormData ? new FormData() : new URLSearchParams()
    for (const [name, value] of body)
      result.append(name, sensitiveName(name) ? '[redacted]' : value)
    body = result
  }
  return { ...copy, options: { ...copy.options, headers, body } }
}
export const traceBody = (body) => redactValue(describeBody(body))
