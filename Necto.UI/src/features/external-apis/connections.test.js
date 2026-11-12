import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, ref } from 'vue'
import { normalizeConnection, loadConnection, useExternalApis } from './connections.js'
import { readOperations } from '../api-catalog/catalog.js'
import { resolveMappingLinks } from '../related-endpoints/mappings.js'
import { buildRequest } from '../request-runner/request.js'

const entry = { id: 'billing', name: 'Billing', openApiUrl: 'https://billing.test/openapi.json',
  endpointMappingsUrl: 'https://billing.test/mappings', apiBaseUrl: '' }
const document = { openapi: '3.1.0', info: { title: 'Invoices' }, paths: {
  '/invoices/{id}': { get: { operationId: 'GetInvoice', parameters: [{ in: 'path', name: 'id', required: true }], responses: {} } },
} }
const mapping = { source: { operationId: 'GetInvoice', eachItem: false, property: 'id' },
  target: { operationId: 'GetInvoice', location: 'parameter', name: 'id' } }

test('connection IDs and URLs are validated and normalized', () => {
  assert.equal(normalizeConnection(entry).usePresets, false)
  for (const id of ['local', '', 'Bad Id', '../billing']) assert.throws(() => normalizeConnection({ ...entry, id }))
  for (const url of ['javascript:alert(1)', 'https://user:secret@billing.test/api', 'https://billing.test/#secret']) {
    assert.throws(() => normalizeConnection({ ...entry, openApiUrl: url }))
  }
})
test('identical operation IDs and paths stay isolated and use their own document/base URL', () => {
  const local = readOperations(document)[0]
  const external = readOperations(document, { id: 'billing', name: 'Billing', configuration: {
    openApiUrl: entry.openApiUrl, apiBaseUrl: 'https://billing.test/v2', overrideServer: true,
  } })[0]
  assert.notEqual(local.key, external.key)
  assert.equal(local.key, 'GET /invoices/{id}')
  external.server = { url: 'https://wrong.test' }
  const request = buildRequest(external, { openApiUrl: 'https://local.test/openapi.json' }, { fields: { 'path:id': '42' } })
  assert.equal(request.url.href, 'https://billing.test/v2/invoices/42')
  assert.match(external.tags[0], /billing/)
})
test('mapping ownership resolves local links and explicit cross-API links without guessing', () => {
  const local = readOperations(document), external = readOperations(document, { id: 'billing', name: 'Billing' })
  const operations = [...local, ...external]
  const own = resolveMappingLinks(operations, [{ apiId: 'billing', mappings: [mapping] }])
  assert.equal(own[0].from.key, external[0].key)
  assert.equal(own[0].to.key, external[0].key)
  const cross = { ...mapping, source: { ...mapping.source, apiId: 'local' }, target: { ...mapping.target, apiId: 'billing' } }
  const links = resolveMappingLinks(operations, [{ apiId: 'local', mappings: [cross] }])
  assert.equal(links[0].from.key, local[0].key)
  assert.equal(links[0].to.key, external[0].key)
  assert.equal(resolveMappingLinks(local, [{ apiId: 'local', mappings: [cross] }]).length, 0)
  assert.equal(resolveMappingLinks([...local, { ...local[0], key: 'duplicate' }], [{ apiId: 'local', mappings: [mapping] }]).length, 0)
})
test('metadata fetches omit credentials and reject malformed mappings', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => url === entry.openApiUrl ? document : [mapping] }
  })
  const result = await loadConnection(entry)
  assert.equal(result.mappings.length, 1)
  assert.ok(calls.every(call => call.options.credentials === 'omit' && !call.options.headers.Authorization))
  globalThis.fetch = async url => ({ ok: true, json: async () => url === entry.openApiUrl ? document : [null] })
  await assert.rejects(loadConnection(entry), /Necto endpoint mappings/)
})
test('connections persist by host, hide instantly, and reject stale in-flight metadata', async t => {
  const store = new Map()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value),
  } })
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage })
  const deferred = []
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => deferred.push({ url, options, resolve })))
  const scope = effectScope()
  const api = scope.run(() => useExternalApis(ref({ openApiUrl: 'https://host.test/openapi.json' })))
  api.saveConnection(entry)
  api.show.value = true
  await nextTick()
  assert.equal(deferred.length, 2)
  api.show.value = false
  await nextTick()
  assert.ok(deferred.every(item => item.options.signal.aborted))
  for (const pending of deferred) pending.resolve({ ok: true, json: async () => pending.url === entry.openApiUrl ? document : [mapping] })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(api.contexts.value.length, 0)
  assert.equal(api.statuses.get('billing').ready, undefined)
  assert.equal(JSON.parse(store.get('necto:external-apis:https://host.test/openapi.json')).show, false)
  const secondScope = effectScope()
  const restored = secondScope.run(() => useExternalApis(ref({ openApiUrl: 'https://host.test/openapi.json' })))
  assert.equal(restored.connections.value.length, 1)
  assert.equal(restored.show.value, false)
  assert.throws(() => restored.saveConnection(entry), /already exists/)
  restored.removeConnection('billing')
  assert.equal(restored.connections.value.length, 0)
  scope.stop(); secondScope.stop()
})
