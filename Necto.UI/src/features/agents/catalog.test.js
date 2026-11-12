import test from 'node:test'
import assert from 'node:assert/strict'
import { agentCatalog } from './catalog.js'
import { readRoute, routePath } from '../routing/routes.js'
const document = { openapi: '3.1.0', info: { title: 'Invoices' }, paths: { '/invoices': { get: { operationId: 'Invoices', security: [{ Bearer: [] }] } } }, components: { schemas: { Invoice: { type: 'object' } } } }
const configuration = { openApiUrl: 'https://example.test/v1/openapi.json', apiBaseUrl: '/v1/', presets: 'private' }
const operation = { key: 'GET /invoices', apiId: 'local', path: '/invoices', method: 'GET', id: 'Invoices', name: 'Invoices', parameters: [] }
test('agent snapshot exports API metadata and scoped mappings without browser runtime data', () => {
  const mapping = { source: { apiId: 'local', operationId: 'Invoices', objectPath: [null] }, target: { apiId: 'billing', operationId: 'GetInvoice' } }
  const snapshot = agentCatalog(document, configuration, [{ ...operation, draft: 'secret', response: 'secret', usePresets: true }], [mapping])
  assert.equal(snapshot.apis[0].operations[0].baseUrl, 'https://example.test/v1/')
  assert.deepEqual(snapshot.apis[0].operations[0].definition.security, [{ Bearer: [] }])
  assert.deepEqual(snapshot.apis[0].mappings, [mapping])
  assert.equal(JSON.stringify(snapshot).includes('secret'), false)
  assert.equal(JSON.stringify(snapshot).includes('private'), false)
})
test('external identities, operation servers and configured overrides retain their own API URLs', () => {
  const external = { id: 'billing', name: 'Billing', document }
  const config = { openApiUrl: 'https://billing.test/openapi.json', apiBaseUrl: 'https://gateway.test/api/', overrideServer: true }
  const ops = [{ ...operation, server: { url: '/{tenant}', variables: { tenant: { default: 'acme' } } } }, { ...operation, key: 'billingKey', apiId: 'billing', server: { url: 'https://ignored.test/' }, configuration: config }]
  const result = agentCatalog(document, configuration, ops, [], [external])
  assert.equal(result.apis[0].operations[0].baseUrl, 'https://example.test/acme')
  assert.equal(result.apis[1].operations[0].baseUrl, 'https://gateway.test/api/')
  assert.equal(result.apis[1].operations[0].key, 'billingKey')
})
test('unresolved or unsafe server URLs fail explicitly instead of inventing an execution URL', () => {
  for (const server of [{ url: '/{tenant}' }, { url: 'file:///tmp/file' }, { url: 'https://user:password@example.test/' }]) {
    const op = agentCatalog(document, configuration, [{ ...operation, server }], []).apis[0].operations[0]
    assert.equal(op.baseUrl, null); assert.ok(op.urlError)
  }
})
test('bring your agent route supports mounted deep links', () => {
  assert.deepEqual(readRoute('/tools/necto/agent', '/tools/necto/'), { view: 'agent' })
  assert.equal(routePath({ view: 'agent' }, '/tools/necto/'), '/tools/necto/agent')
})

test('referenced path items preserve operation-specific security and definitions', () => {
  const item = { get: { operationId: 'Invoices', security: [{ ApiKey: [] }] } }
  const spec = { ...document, paths: { '/invoices': { $ref: '#/components/pathItems/Invoices' } }, components: { pathItems: { Invoices: item } } }
  const result = agentCatalog(spec, configuration, [{ ...operation, resolve: () => item }], [])
  assert.deepEqual(result.apis[0].operations[0].definition.security, [{ ApiKey: [] }])
})
