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

test('context values satisfy required fields and flow overrides take precedence', () => {
  const environment = new Map([['header:x-tenant', 'env-tenant'], ['path:customer', 'env-customer']])
  const overrides = new Map([['path:customer', 'flow-customer']])
  const values = new Map([...environment, ...overrides])
  const draft = { fields: { 'path:id': '123' } }

  const request = buildRequest(invoice, configuration, draft, values)
  assert.equal(request.url.pathname, '/flow-customer/Invoice/123')
  assert.equal(request.options.headers.get('X-Tenant'), 'env-tenant')
  assert.throws(() => buildRequest(invoice, configuration, { fields: {} }, values), /id is required/)
  assert.throws(() => buildRequest(invoice, configuration, draft), /X-Tenant is required/)
})

test('query aliases use the OpenAPI spelling and respect call-flow precedence', () => {
  const assets = {
    ...invoice,
    path: '/assets',
    parameters: [{ in: 'query', name: 'customerId' }],
  }
  const environment = new Map([['query:customerId', '7']])
  const overrides = new Map([['query:CustomerId', '12']])
  const values = resolveRequestValues(assets, environment, overrides)
  assert.equal(values.get('query:customerId'), '12')
  const request = buildRequest(assets, configuration, { fields: { 'query:customerId': '3' } }, values)
  assert.equal(request.url.search, '?customerId=12')

  assets.parameters.push({ in: 'query', name: 'CustomerId' })
  const distinct = resolveRequestValues(assets, environment, overrides, new Map([['query:CUSTOMERID', '99']]))
  assert.deepEqual([...distinct], [['query:customerId', '7'], ['query:CustomerId', '12']])
})
