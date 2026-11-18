import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractValues } from './contractValues.js'

const values = schema => contractValues(schema).map(example => example.value)
test('numeric examples respect inclusive and exclusive boundaries', () => {
  assert.deepEqual(values({ type: 'integer', exclusiveMinimum: 1, maximum: 10, exclusiveMaximum: true }), [2, 9])
  assert.deepEqual(values({ type: 'integer', minimum: 4, maximum: 2 }), [])
  assert.deepEqual(values({ type: 'number', minimum: 0, maximum: 0 }), [0])
})
test('string generation is bounded and skips unsupported patterns', () => {
  assert.deepEqual(values({ type: 'string', minLength: 2, maxLength: 4 }), ['aa', 'aaaa'])
  assert.deepEqual(values({ type: 'string', minLength: 2000 }), [])
  assert.deepEqual(values({ type: 'string', pattern: '^(x+)+$' }), [])
  assert.deepEqual(values({ type: 'string', format: 'email', maxLength: 2 }), [])
})
