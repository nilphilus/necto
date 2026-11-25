import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCollectedValues, collectionFields } from './collectionFields.js'

test('collectable fields skip active presets and distinguish missing values from zero and false', () => {
  const operation = {
    parameters: [
      { in: 'query', name: 'id' },
      { in: 'header', name: 'Tenant' },
      { in: 'query', name: 'active' },
    ],
    requestBody: { content: { 'application/json': {} } },
    resolve: value => value,
  }
  const fields = collectionFields(operation, { fields: { 'query:id': '0', 'query:active': 'false' }, body: '{}' },
    new Map([['header:tenant', 'production']]),
    (_, location, name) => location === 'body' ? [{ name: 'customerId' }, { name: null }] : [{ name }])
  assert.deepEqual(fields.map(({ location, name, missing }) => [location, name, missing]), [
    ['query', 'id', false], ['query', 'active', false], ['body', 'customerId', true],
  ])
})

test('applying picks preserves unrelated inputs and rolls back on invalid JSON', () => {
  const session = {
    fields: { 'query:existing': 'keep' }, body: 'invalid JSON',
    bindings: [{ location: 'query', name: 'id' }, { location: 'query', name: 'existing' }],
  }
  const picks = [
    { location: 'query', name: 'id', value: 0 },
    { location: 'body', name: 'active', value: false },
  ]
  assert.throws(() => applyCollectedValues(session, picks), /Fix the JSON/)
  assert.deepEqual(session.fields, { 'query:existing': 'keep' })
  session.body = '{"name":"Draft"}'
  applyCollectedValues(session, picks)
  assert.deepEqual(session.fields, { 'query:existing': 'keep', 'query:id': '0' })
  assert.deepEqual(JSON.parse(session.body), { name: 'Draft', active: false })
  assert.deepEqual(session.bindings, [{ location: 'query', name: 'existing' }])
})
