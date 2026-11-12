import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyFields, hasBodyExample, jsonBodyIssue } from './bodyHelp.js'
test('body guidance distinguishes examples and bounds recursive schema inspection', () => {
  const resolve = value => value
  assert.equal(hasBodyExample({ example: null }, resolve), true)
  assert.equal(hasBodyExample({ examples: { first: { value: { id: 7 } } } }, resolve), true)
  assert.equal(hasBodyExample({ schema: {} }, resolve), false)
  const schema = { required: ['id'], properties: { id: { type: 'integer', minimum: 1 }, read: { readOnly: true }, rows: { type: 'array', items: { properties: { quantity: { type: 'integer', minimum: 1 } } } } } }
  assert.deepEqual(bodyFields({ resolve }, schema).map(field => field.path), ['id', 'rows', 'rows[].quantity'])
  assert.match(bodyFields({ resolve }, schema)[0].rules, /required.*min 1/)
  schema.properties.recursive = schema
  assert.ok(bodyFields({ resolve }, schema).length < 10)
})
test('JSON errors identify a location without echoing user input', () => {
  const body = '{\n "secret": }'
  let cause; try { JSON.parse(body) } catch (error) { cause = error }
  assert.match(jsonBodyIssue(body, cause), /line 2, column/)
  assert.equal(jsonBodyIssue(body, cause).includes('secret'), false)
})
