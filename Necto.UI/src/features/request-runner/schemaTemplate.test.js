import test from 'node:test'
import assert from 'node:assert/strict'
import { initialBody, initialPayload, applyBodyPresets, resolveRequestValues, buildRequest } from './request.js'
import { schemaTemplate, TEMPLATE_NOTICE, TEMPLATE_CHARACTER_LIMIT, TemplateLimitError } from './schemaTemplate.js'
import { readOperations } from '../api-catalog/catalog.js'
function operation(depth = 15) {
  const schemas = { Leaf: { type: 'string' } }
  for (let index = depth - 1; index >= 0; index--) {
    const ref = { $ref: '#/components/schemas/' + (index === depth - 1 ? 'Leaf' : `Level${index + 1}`) }
    schemas[`Level${index}`] = { type: 'object', properties: { left: ref, right: ref } }
  }
  return readOperations({ paths: { '/input': { post: { requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Level0' } } } }, responses: {} } } }, components: { schemas } })[0]
}
test('a small noncyclic schema DAG produces an explicit empty fallback, never an exponential body', () => {
  const result = initialPayload(operation())
  assert.deepEqual(result, { body: '', notice: TEMPLATE_NOTICE })
  assert.equal(initialBody(operation(30)), '')
})
test('deep chains, arrays and allOf share one generation budget', () => {
  let schema = { type: 'string' }
  for (let index = 0; index < 100; index++) schema = { type: 'array', items: schema }
  assert.throws(() => schemaTemplate({ resolve: value => value }, schema), TemplateLimitError)
  const property = { type: 'object', properties: Object.fromEntries(Array.from({ length: 100 }, (_, id) => ['field' + id, { type: 'string' }])) }
  assert.throws(() => schemaTemplate({ resolve: value => value }, { allOf: Array(100).fill(property) }), TemplateLimitError)
})
test('large or alias-expanded published examples are bounded before formatting', () => {
  const op = operation(1), media = op.requestBody.content['application/json']
  media.example = 'x'.repeat(TEMPLATE_CHARACTER_LIMIT + 1)
  assert.equal(initialPayload(op).notice, TEMPLATE_NOTICE)
  let alias = { value: 42 }
  for (let index = 0; index < 15; index++) alias = { left: alias, right: alias }
  media.example = alias
  assert.equal(initialPayload(op).body, '')
})
test('normal examples, recursive schemas and manual request bodies remain usable', () => {
  const op = operation(2)
  assert.deepEqual(JSON.parse(initialBody(op)), { left: { left: 'string', right: 'string' }, right: { left: 'string', right: 'string' } })
  const recursive = { type: 'object', properties: {} }; recursive.properties.next = recursive
  assert.deepEqual(JSON.parse(JSON.stringify(schemaTemplate({ resolve: value => value }, recursive))), { next: null })
  const body = '{"manual":"' + 'x'.repeat(TEMPLATE_CHARACTER_LIMIT + 1) + '"}'
  assert.equal(buildRequest(op, { openApiUrl: 'https://api.example/openapi.json' }, { fields: {}, body }).options.body, body)
})
test('body presets use the same shared budget and cannot silently send an incomplete automatic payload', () => {
  const op = operation(), values = resolveRequestValues(op, new Map([['left', { value: 'preset-value' }]]))
  const result = applyBodyPresets(op, '{}', values)
  assert.equal(result.body, '{}'); assert.match(result.notice, /presets exceed/)
  assert.throws(() => buildRequest(op, { openApiUrl: 'https://api.example/openapi.json' }, { fields: {}, body: '{}' }, values), /presets exceed/)
})

test('preset traversal of a deep manual body is bounded without changing the body', () => {
  const op = operation(1), values = resolveRequestValues(op, new Map([['unrelated', { value: 'x' }]]))
  let body = '42'
  for (let index = 0; index < 100; index++) body = '{"nested":' + body + '}'
  const result = applyBodyPresets(op, body, values)
  assert.equal(result.body, body); assert.match(result.notice, /presets exceed/)
})
