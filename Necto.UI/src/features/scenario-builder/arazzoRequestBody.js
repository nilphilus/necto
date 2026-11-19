import { isJson } from '../workbench/body.js'
import { pointer, prefix } from './bodySchema.js'
import { applyInput } from './model.js'
import { pointerParts } from './pointers.js'

export function applyArazzoRequestBody(body, operation, step, bind, payloadBudget) {
  const types = Object.keys(operation.requestBody?.content ?? {})
  const type = body.contentType ?? (types.length === 1 ? types[0] : undefined)
  if (!types.includes(type)) throw new Error('Choose a request body content type declared by OpenAPI.')
  step.request.mediaType = type

  if (!isJson(type)) {
    if (!/^(?:text\/|application\/(?:.+\+)?xml)/i.test(type) || typeof body.payload !== 'string' ||
        body.payload.startsWith('$') || body.payload.includes('{$') || body.replacements?.length) {
      throw new Error('Non-JSON request bodies support only literal text.')
    }
    step.request.body = body.payload
    return
  }

  function compilePayload(value, path = []) {
    if (--payloadBudget.remaining < 0 || path.length > 24) throw new Error('Request payload exceeds the import limit.')
    if (bind(value, { location: 'body', pointer: pointer(path) })) return null
    if (Array.isArray(value)) return value.map((item, index) => compilePayload(item, [...path, index]))
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) =>
        [key, compilePayload(child, [...path, key])]))
    }
    return value
  }

  step.request.body = JSON.stringify(compilePayload(body.payload ?? null), null, 2)
  for (const replacement of body.replacements ?? []) {
    const path = pointerParts(replacement.target)
    const target = { location: 'body', pointer: replacement.target }
    if (!Object.hasOwn(replacement, 'value')) throw new Error('A body replacement needs a value.')

    step.inputs = step.inputs.filter(input => {
      if (input.location !== 'body') return true
      const existing = pointerParts(input.pointer)
      if (existing.length < path.length && prefix(existing, path)) {
        throw new Error('A body replacement cannot target a child of a dynamic value.')
      }
      return !prefix(path, existing)
    })

    if (!bind(replacement.value, target)) applyInput(step.request, operation, target, replacement.value)
  }
}
