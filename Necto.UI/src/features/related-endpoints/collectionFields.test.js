import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCollectedValues, collectionFields } from './collectionFields.js'

test('value discovery excludes sources requiring the requested value, ignoring name casing', () => {
  const resolve = value => value
  const operation = { parameters: [{ in: 'query', name: 'InvoiceId' }], resolve }
  const details = { parameters: [{ in: 'path', name: 'invoiceId' }], resolve }
  const list = { parameters: [{ in: 'query', name: 'invoiceId' }], resolve }
  const otherInput = { parameters: [{ in: 'path', name: 'customerId' }], resolve }
  const bodyInput = { parameters: [], resolve, requestBody: { required: true, content: {
    'application/json': { schema: { allOf: [{ required: ['invoiceId'] }] } },
  } } }
  const sources = [details, list, otherInput, bodyInput].map(operation => ({ operation }))
  const fields = collectionFields(operation, { fields: {}, body: '' }, new Map(), () => sources)
  assert.deepEqual(fields[0].sources.map(source => source.operation), [list, otherInput])
  assert.deepEqual(collectionFields(operation, { fields: {}, body: '' }, new Map(),
    () => [{ operation: details }]), [])
})

test('body value discovery excludes circular sources per field', () => {
  const resolve = value => value
  const operation = { parameters: [], resolve, requestBody: { content: {
    'application/json': { schema: { properties: { InvoiceId: {}, customerId: {} } } },
  } } }
  const source = { parameters: [{ in: 'query', name: 'invoiceId', required: true }], resolve }
  const fields = collectionFields(operation, { fields: {}, body: '{}' }, new Map(),
    () => ['InvoiceId', 'customerId'].map(name => ({ name, operation: source })))
  assert.deepEqual(fields.map(field => field.name), ['customerId'])
})

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

test('required source fields follow parameter rules and the active JSON body schema', () => {
  const operation = {
    parameters: [{ in: 'path', name: 'id' }, { in: 'query', name: 'tag' }],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { allOf: [{ $ref: 'required' }], required: ['name'] } } },
    },
    resolve: value => value?.$ref === 'required' ? { required: ['customerId'] } : value,
  }
  const fields = collectionFields(operation, { fields: {}, body: '{}' }, new Map(),
    (_, location, name) => location === 'body'
      ? [{ name: 'name' }, { name: 'customerId' }, { name: 'comment' }]
      : [{ name }])
  assert.deepEqual(fields.map(({ name, required }) => [name, required]), [
    ['id', true], ['tag', false], ['name', true], ['customerId', true], ['comment', false],
  ])
})
