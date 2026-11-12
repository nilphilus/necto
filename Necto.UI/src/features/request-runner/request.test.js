import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRequest, contextKey, resolveRequestValues } from './request.js'

const configuration = { openApiUrl: 'https://api.example/openapi/v1.json' }
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
  const firstPreset = new Map([['query:customerId', '7']])
  const secondPreset = new Map([['query:CustomerId', '12']])
  const values = resolveRequestValues(assets, firstPreset, secondPreset)
  assert.equal(values.get('query:customerId'), '12')
  const request = buildRequest(assets, configuration, { fields: { 'query:customerId': '3' } }, values)
  assert.equal(request.url.search, '?customerId=12')

  assets.parameters.push({ in: 'query', name: 'CustomerId' })
  const distinct = resolveRequestValues(assets, firstPreset, secondPreset, new Map([['query:CUSTOMERID', '99']]))
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
  const cantoso = new Map([['query:customerId', '7']])
  const assetType = new Map([['query:assetId', '42']])
  const otherCustomer = new Map([['query:CustomerId', '12']])

  const values = resolveRequestValues(assets, cantoso, assetType, otherCustomer)
  const request = buildRequest(assets, configuration, { fields: {} }, values)
  assert.equal(request.url.searchParams.get('customerId'), '12')
  assert.equal(request.url.searchParams.get('assetId'), '42')
  assert.equal(resolveRequestValues(assets, cantoso, assetType).get('query:customerId'), '7')
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
