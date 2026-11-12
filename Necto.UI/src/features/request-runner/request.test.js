import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyBodyPresets, buildRequest, contextKey, hasPresetFor, migratePreset, presetInputs, presetSource, resolveNamedRequestValues, resolveRequestValues } from './request.js'
import { applySample, readSamples } from './samples.js'

const configuration = { openApiUrl: 'https://api.example/openapi/v1.json' }
const preset = entries => new Map(entries.map(([name, value]) => [name, { value }]))
const tenant = { in: 'header', name: 'X-Tenant', required: true }
const invoice = {
  method: 'GET',
  path: '/{customer}/Invoice/{id}',
  parameters: [
    tenant,
    { in: 'path', name: 'customer' },
    { in: 'path', name: 'id' },
  ],
  resolve: value => value,
}

test('a saved request sample supplies the body and draft fields beneath active presets', () => {
  const operation = {
    ...invoice,
    method: 'POST',
    requestBody: { content: { 'application/json': {} } },
  }
  const sample = {
    name: 'Example',
    body: '{"amount":12}',
    fields: { 'header:X-Tenant': 'sample-tenant', 'path:customer': 'sample-customer', 'path:id': '123' },
  }
  const storage = new Map([['invoice', JSON.stringify({ samples: [sample], defaultName: sample.name })]])
  const { samples, defaultName } = readSamples({ getItem: key => storage.get(key) ?? null }, 'invoice')
  const draft = { fields: { 'query:old': 'old value' }, body: '{}', bindings: [{}] }
  applySample(operation, draft, samples.find(entry => entry.name === defaultName))

  const values = new Map([[contextKey(tenant), 'preset-tenant'], ['path:customer', 'preset-customer']])
  const request = buildRequest(operation, configuration, draft, values)
  assert.equal(request.url.pathname, '/preset-customer/Invoice/123')
  assert.equal(request.options.headers.get('X-Tenant'), 'preset-tenant')
  assert.equal(request.options.body, sample.body)
  assert.equal(buildRequest(operation, configuration, draft).options.headers.get('X-Tenant'), 'sample-tenant')
  assert.deepEqual(draft.fields, sample.fields)
  assert.deepEqual(draft.bindings, [])
})

test('environment values override request fields by location and name', () => {
  const request = buildRequest(invoice, configuration, {
    fields: { 'header:X-Tenant': 'form-tenant', 'path:customer': 'form-customer', 'path:id': '123' },
  }, new Map([
    [contextKey(tenant), 'environment-tenant'],
    ['path:customer', 'customer/42'],
    ['query:customer', 'unmatched'],
    ['header:x-region', 'eu'],
  ]))

  assert.equal(request.url.href, 'https://api.example/customer%2F42/Invoice/123')
  assert.equal(request.options.headers.get('X-Tenant'), 'environment-tenant')
  assert.equal(request.options.headers.get('X-Region'), 'eu')
})

test('preset values satisfy required fields', () => {
  const values = new Map([['header:x-tenant', 'preset-tenant'], ['path:customer', 'preset-customer']])
  const draft = { fields: { 'path:id': '123' } }

  const request = buildRequest(invoice, configuration, draft, values)
  assert.equal(request.url.pathname, '/preset-customer/Invoice/123')
  assert.equal(request.options.headers.get('X-Tenant'), 'preset-tenant')
  assert.throws(() => buildRequest(invoice, configuration, { fields: {} }, values), /id is required/)
  assert.throws(() => buildRequest(invoice, configuration, draft), /X-Tenant is required/)
})

test('query aliases use the OpenAPI spelling and respect preset precedence', () => {
  const assets = {
    ...invoice,
    path: '/assets',
    parameters: [{ in: 'query', name: 'customerId' }],
  }
  const firstPreset = preset([['customerId', '7']])
  const secondPreset = preset([['CustomerId', '12']])
  const values = resolveRequestValues(assets, firstPreset, secondPreset)
  assert.equal(values.get('query:customerId'), '12')
  const request = buildRequest(assets, configuration, { fields: { 'query:customerId': '3' } }, values)
  assert.equal(request.url.search, '?customerId=12')

  assets.parameters.push({ in: 'query', name: 'CustomerId' })
  const distinct = resolveRequestValues(assets, firstPreset, secondPreset, preset([['CUSTOMERID', '99']]))
  assert.deepEqual([...distinct], [['query:customerId', '7'], ['query:CustomerId', '12']])
})

test('active presets combine independent fields and the latest preset wins a shared field', () => {
  const assets = {
    ...invoice,
    path: '/assets',
    parameters: [
      { in: 'query', name: 'customerId' },
      { in: 'query', name: 'assetId' },
    ],
  }
  const cantoso = preset([['customerId', '7']])
  const assetType = preset([['assetId', '42']])
  const otherCustomer = preset([['CustomerId', '12']])

  const values = resolveRequestValues(assets, cantoso, assetType, otherCustomer)
  const request = buildRequest(assets, configuration, { fields: {} }, values)
  assert.equal(request.url.searchParams.get('customerId'), '12')
  assert.equal(request.url.searchParams.get('assetId'), '42')
  assert.equal(resolveRequestValues(assets, cantoso, assetType).get('query:customerId'), '7')
})

test('one preset name fills route, query, header and nested JSON fields', () => {
  const operation = {
    ...invoice,
    method: 'POST',
    path: '/{id}',
    parameters: [{ in: 'path', name: 'id' }, { in: 'query', name: 'id' }, { in: 'header', name: 'ID' }],
    requestBody: { content: { 'application/json': { schema: {
      properties: { id: { type: 'integer' }, nested: { properties: { id: { type: 'string' } } } },
    } } } },
  }
  const values = resolveRequestValues(operation, preset([['id', '7'], ['unmatched', 'no']]), preset([['ID', '42']]))
  const draft = { fields: {}, body: '{"items":[{"id":1}],"other":true}' }
  const { url, options } = buildRequest(operation, configuration, draft, values)
  assert.equal(url.href, 'https://api.example/42?id=42')
  assert.equal(options.headers.get('id'), '42')
  assert.equal(options.headers.has('unmatched'), false)
  assert.deepEqual(JSON.parse(options.body), { items: [{ id: 42 }], other: true, id: 42, nested: { id: '42' } })
  assert.equal(draft.body, '{"items":[{"id":1}],"other":true}')

  const bodyOnly = { ...operation, parameters: [], path: '/body' }
  const bodyValues = resolveRequestValues(bodyOnly, preset([['id', '7']]))
  assert.equal(hasPresetFor(bodyOnly, '', bodyValues), true)
  assert.deepEqual(JSON.parse(buildRequest(bodyOnly, configuration, { fields: {}, body: '' }, bodyValues).options.body),
    { id: 7, nested: { id: '7' } })
})

test('migrated header presets still send undeclared headers and match other fields by name', () => {
  const values = resolveRequestValues(invoice, migratePreset([['header:authorization', 'token'], ['query:customer', 'acme']]))
  const { url, options } = buildRequest(invoice, configuration, { fields: { 'path:id': '123', 'header:X-Tenant': 'acme' } }, values)
  assert.equal(url.pathname, '/acme/Invoice/123')
  assert.equal(options.headers.get('Authorization'), 'token')
})

test('canceling a large response parser terminates its worker', async t => {
  const { sendRequest } = await import('./request.js')
  const controller = new AbortController()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  let terminated = false
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {
    postMessage() { controller.abort() }
    terminate() { terminated = true }
  } })
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor); else delete globalThis.Worker })
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => '"' + 'x'.repeat(1000000) + '"' }))
  await assert.rejects(sendRequest({ url: 'https://api.test', options: { signal: controller.signal } }), { name: 'AbortError' })
  assert.equal(terminated, true)
})


test('named presets identify the winning field even when equal values override each other', () => {
  const first = preset([['customer', 'acme'], ['X-Tenant', 'tenant']])
  const last = preset([['CUSTOMER', 'acme']])
  const values = resolveNamedRequestValues(invoice, { name: 'Base', values: first }, { name: 'Latest', values: last })
  assert.equal(presetSource(values, 'path:customer'), 'Latest')
  assert.equal(presetSource(values, 'header:x-tenant'), 'Base')
  const draft = { fields: { 'path:id': '42' } }
  const named = buildRequest(invoice, configuration, draft, values)
  const original = buildRequest(invoice, configuration, draft, resolveRequestValues(invoice, first, last))
  assert.equal(named.url.href, original.url.href)
  assert.deepEqual([...named.options.headers], [...original.options.headers])
})
test('preset body origins follow winning nested and array fields while preserving typed values', () => {
  const operation = { ...invoice, method: 'POST', parameters: [], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { nested: { type: 'object', properties: { id: { type: 'integer' } } }, items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, active: { type: 'boolean' } } } } } } } } } }
  const values = resolveNamedRequestValues(operation, { name: 'Base', values: preset([['id', '7'], ['active', 'false']]) }, { name: 'Override', values: preset([['ID', '0']]) })
  const applied = applyBodyPresets(operation, '{"items":[{"id":9,"active":true}]}', values)
  assert.deepEqual(JSON.parse(applied.body), { nested: { id: 0 }, items: [{ id: 0, active: false }] })
  assert.deepEqual(new Map(applied.sources.map(source => [JSON.stringify(source.path), source.preset])), new Map([[JSON.stringify(['nested', 'id']), 'Override'], [JSON.stringify(['items', 0, 'id']), 'Override'], [JSON.stringify(['items', 0, 'active']), 'Base']]))
  assert.equal(presetInputs(operation, '{"items":[{}]}', values).length, 3)
})
test('undeclared legacy headers retain accurate later ownership without exposing header values in summaries', () => {
  const first = migratePreset([['header:Authorization', 'first-secret']])
  const second = preset([['authorization', 'later-secret']])
  const operation = { ...invoice, parameters: [] }
  const values = resolveNamedRequestValues(operation, { name: 'Auth', values: first }, { name: 'Replacement', values: second })
  assert.equal(values.get('header:authorization'), 'later-secret')
  assert.equal(presetSource(values, 'header:authorization'), 'Replacement')
  assert.equal(presetInputs(operation, '', values)[0].value, 'Header value hidden')
  assert.equal(JSON.stringify(presetInputs(operation, '', values)).includes('secret'), false)
  assert.equal(hasPresetFor(operation, '', values), true)
})
test('unmatched and ambiguous presets do not claim ownership or make an empty request match', () => {
  const operation = { ...invoice, parameters: [{ in: 'query', name: 'id' }, { in: 'query', name: 'ID' }] }
  const values = resolveNamedRequestValues(operation, { name: 'Ambiguous', values: preset([['Id', '7']]) })
  assert.equal(presetSource(values, 'query:id'), undefined)
  assert.deepEqual(presetInputs(operation, '', values), [])
  assert.equal(Boolean(hasPresetFor(operation, '', values)), false)
})
