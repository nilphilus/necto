import test from 'node:test'
import assert from 'node:assert/strict'
import { API_ACCESS, authorizeRequest, redactedRequest, validateCredential } from './authentication.js'
import { useAuthentication } from './useAuthentication.js'
import { readOperations } from '../api-catalog/catalog.js'
import { createPkce } from './oauth.js'
const origin = 'https://api.example'
const bearer = { type: 'http', scheme: 'bearer' }
const key = { type: 'apiKey', in: 'header', name: 'X-Key' }
const credential = (token = 'secret', extra = {}) => ({ token, origins: [origin], scopes: [], ...extra })
const request = (url = origin + '/invoices', headers = {}) => ({ url: new URL(url), options: { method: 'GET', headers: new Headers(headers) } })
const operation = security => ({ apiId: 'local', security, securitySchemes: { bearer, key } })
const auth = { schemes: { bearer, key }, credentials: { bearer: credential(), key: credential('key-secret') } }
test('OpenAPI security inherits from the document and respects explicit anonymous overrides', () => {
  const doc = { security: [{ bearer: [] }], components: { securitySchemes: { bearer } }, paths: { '/secure': { get: {} }, '/anonymous': { get: { security: [] } } } }
  const ops = readOperations(doc)
  assert.deepEqual(ops[0].security, [{ bearer: [] }]); assert.deepEqual(ops[1].security, [])
  assert.equal(readOperations({ paths: { '/unknown': { get: {} } } })[0].security, null)
  assert.equal(authorizeRequest(request(), ops[0], auth).options.headers.get('Authorization'), 'Bearer secret')
  assert.equal(authorizeRequest(request(), ops[1], auth).options.headers.has('Authorization'), false)
})
test('OR alternatives and AND requirements are resolved atomically without partial headers', () => {
  const result = authorizeRequest(request(), operation([{ missing: [] }, { bearer: [], key: [] }]), auth)
  assert.equal(result.options.headers.get('X-Key'), 'key-secret')
  assert.equal(result.options.headers.get('Authorization'), 'Bearer secret')
  const missing = { ...auth, credentials: { bearer: credential() } }
  const original = request()
  assert.throws(() => authorizeRequest(original, operation([{ bearer: [], key: [] }]), missing), /Authorize key/)
  assert.equal(original.options.headers.has('Authorization'), false)
  assert.equal(authorizeRequest(request(), operation([{ bearer: [], key: [] }, {}]), missing).options.headers.has('Authorization'), false)
})
test('origins, API identities, expiration and required OAuth scopes prevent credential reuse', () => {
  assert.throws(() => authorizeRequest(request('https://other.example/'), operation([{ bearer: [] }]), auth), /origin/)
  assert.throws(() => authorizeRequest(request(), operation([{ bearer: [] }]), { ...auth, credentials: {} }), /Authorize/)
  assert.throws(() => authorizeRequest(request(), operation([{ bearer: [] }]), { ...auth, credentials: { bearer: credential('expired', { expiresAt: 10 }) } }, 20), /expired/)
  const oauth = { type: 'oauth2' }
  assert.throws(() => authorizeRequest(request(), { security: [{ oauth: ['write'] }], securitySchemes: { oauth } }, { credentials: { oauth: credential('token', { scopes: ['read'] }) } }), /scope/)
})
test('Basic, query API keys and cookie sessions use the correct browser transport', () => {
  const schemes = { basic: { type: 'http', scheme: 'basic' }, query: { type: 'apiKey', in: 'query', name: 'api_key' }, cookie: { type: 'apiKey', in: 'cookie', name: 'session' } }
  const credentials = { basic: { username: 'demo', password: 'päss', origins: [origin] }, query: credential('a+b&secret'), cookie: { enabled: true, origins: [origin] } }
  const basic = authorizeRequest(request(), { security: [{ basic: [] }], securitySchemes: schemes }, { credentials })
  assert.equal(Buffer.from(basic.options.headers.get('Authorization').slice(6), 'base64').toString(), 'demo:päss')
  const query = authorizeRequest(request(), { security: [{ query: [] }], securitySchemes: schemes }, { credentials })
  assert.equal(query.url.searchParams.get('api_key'), 'a+b&secret'); assert.equal(query.options.redirect, 'error')
  assert.equal(authorizeRequest(request(), { security: [{ cookie: [] }], securitySchemes: schemes }, { credentials }).options.credentials, 'include')
})
test('conflicting inputs fail instead of silently overriding headers or query values', () => {
  assert.throws(() => authorizeRequest(request(undefined, { Authorization: 'Bearer preset' }), operation([{ bearer: [] }]), auth), /conflicts/)
  assert.equal(authorizeRequest(request(undefined, { Authorization: 'Bearer secret' }), operation([{ bearer: [] }]), auth).options.headers.get('Authorization'), 'Bearer secret')
})
test('bootstrap credentials work for compatible declarations but never replace an anonymous override', () => {
  const bootstrap = { accessScheme: bearer, access: credential() }
  assert.equal(authorizeRequest(request(), operation([{ bearer: [] }]), bootstrap).options.headers.get('Authorization'), 'Bearer secret')
  assert.equal(authorizeRequest(request(), operation(null), bootstrap).options.headers.get('Authorization'), 'Bearer secret')
  assert.equal(authorizeRequest(request(), operation([]), bootstrap).options.headers.has('Authorization'), false)
  assert.throws(() => authorizeRequest(request(), operation([{ key: [] }]), bootstrap), /Authorize/)
})
test('trace redaction removes managed query/header keys and existing Authorization headers', () => {
  const schemes = { query: { type: 'apiKey', in: 'query', name: 'key' } }
  const result = authorizeRequest(request(origin + '/?invoiceId=42', { Authorization: 'Bearer unrelated' }), { security: [{ query: [] }], securitySchemes: schemes }, { credentials: { query: credential() } })
  const trace = redactedRequest(result)
  assert.equal(trace.url.searchParams.get('key'), '[redacted]'); assert.equal(trace.url.searchParams.get('invoiceId'), '42')
  assert.equal(trace.options.headers.get('Authorization'), '[redacted]')
  assert.equal(result.url.searchParams.get('key'), 'secret')
})
test('metadata authorization is limited to explicit known URLs and cannot cross API identities', () => {
  const store = useAuthentication()
  const configuration = { openApiUrl: origin + '/openapi.json', endpointMappingsUrl: origin + '/mappings', apiBaseUrl: origin }
  store.register({ id: 'local', configuration, schemes: { bearer } })
  store.register({ id: 'other', configuration, schemes: { bearer } })
  store.save('local', 'bearer', bearer, credential('secret', { metadata: true }))
  assert.equal(store.metadataFetch instanceof Function, true)
  assert.equal(store.apply(request(), operation([{ bearer: [] }])).options.headers.get('Authorization'), 'Bearer secret')
  assert.throws(() => store.apply(request(), { ...operation([{ bearer: [] }]), apiId: 'other' }), /Authorize/)
  store.clear('local'); assert.throws(() => store.apply(request(), operation([{ bearer: [] }])), /Authorize/)
})
test('credentials reject invalid headers without echoing their values and PKCE uses S256', async () => {
  assert.throws(() => validateCredential(key, credential('secret\nvalue'), origin), error => !error.message.includes('secret'))
  const pkce = await createPkce()
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pkce.verifier))).toString('base64url')
  assert.equal(pkce.challenge, challenge); assert.notEqual(pkce.state, pkce.verifier)
})

test('metadata requests attach credentials only to known URLs and do not forward another API credentials', async () => {
  const store = useAuthentication(), seen = []
  const configuration = { openApiUrl: origin + '/openapi.json', endpointMappingsUrl: origin + '/mappings', apiBaseUrl: origin }
  store.register({ id: 'local', configuration, schemes: { bearer } })
  store.register({ id: 'other', configuration, schemes: { bearer } })
  store.save('local', 'bearer', bearer, credential('secret', { metadata: true }))
  const previous = globalThis.fetch
  globalThis.fetch = async (url, options) => { seen.push({ url: String(url), options }); return { ok: true } }
  try {
    await store.metadataFetch(configuration.openApiUrl)
    await store.metadataFetch(origin + '/not-metadata')
    await store.metadataFetch(configuration.openApiUrl, 'other')
    assert.equal(new Headers(seen[0].options.headers).get('Authorization'), 'Bearer secret')
    assert.equal(new Headers(seen[1].options.headers).has('Authorization'), false)
    assert.equal(new Headers(seen[2].options.headers).has('Authorization'), false)
    assert.equal(seen[0].options.redirect, 'error')
  } finally { globalThis.fetch = previous }
})
test('changing a configured API URL revokes credentials, while the first bootstrap transition retains same-origin login', () => {
  const store = useAuthentication()
  const configuration = { openApiUrl: origin + '/initial', apiBaseUrl: origin }
  store.register({ id: 'local', configuration, bootstrap: true })
  store.save('local', API_ACCESS, bearer, credential())
  store.register({ id: 'local', configuration: { ...configuration, openApiUrl: origin + '/actual' } })
  assert.equal(store.apply(request(), operation([{ bearer: [] }])).options.headers.get('Authorization'), 'Bearer secret')
  store.register({ id: 'local', configuration: { ...configuration, openApiUrl: origin + '/replacement' } })
  assert.throws(() => store.apply(request(), operation([{ bearer: [] }])), /Authorize/)
})
test('an explicitly enabled browser session can accept login cookies from an anonymous API login endpoint', () => {
  const api = { accessScheme: { type: 'browserSession' }, access: { enabled: true, origins: [origin] } }
  assert.equal(authorizeRequest(request(), operation([]), api).options.credentials, 'include')
  assert.equal(authorizeRequest(request('https://other.example/'), operation([]), api).options.credentials, 'same-origin')
})

test('schemes remain available while protected metadata is being retried, but transport changes revoke named credentials', () => {
  const store = useAuthentication(), configuration = { openApiUrl: origin + '/openapi.json', apiBaseUrl: origin }
  store.register({ id: 'local', configuration, document: {}, schemes: { Bearer: bearer } })
  store.save('local', 'Bearer', bearer, credential('secret', { metadata: true }))
  store.register({ id: 'local', configuration })
  assert.equal(store.apis.get('local').credentials.Bearer.token, 'secret')
  store.register({ id: 'local', configuration, document: {}, schemes: { Bearer: key } })
  assert.equal(store.apis.get('local').credentials.Bearer, undefined)
})
test('a newer documentation authorization replaces a conflicting transport while preserving independent API keys', async () => {
  const store = useAuthentication(), configuration = { openApiUrl: origin + '/openapi.json', apiBaseUrl: origin }
  store.register({ id: 'local', configuration, schemes: { Bearer: bearer, Key: key } })
  store.save('local', API_ACCESS, bearer, credential('old', { metadata: true }))
  store.save('local', 'Key', key, credential('key-secret', { metadata: true }))
  store.save('local', 'Bearer', bearer, credential('new', { metadata: true }))
  assert.equal(store.apis.get('local').access.metadata, false)
  assert.equal(store.apis.get('local').credentials.Key.metadata, true)
  const previous = globalThis.fetch
  globalThis.fetch = async (url, options) => { assert.equal(options.headers.get('Authorization'), 'Bearer new'); assert.equal(options.headers.get('X-Key'), 'key-secret'); return { ok: true } }
  try { await store.metadataFetch(configuration.openApiUrl) } finally { globalThis.fetch = previous }
})

test('anonymous and undeclared security cannot enable redirects for manual keys or presets', () => {
  for (const security of [null, [], [{}]]) {
    const result = authorizeRequest({ ...request(origin + '/redirect', { 'X-API-Key': 'manual-secret' }),
      options: { ...request().options, headers: new Headers({ 'X-API-Key': 'manual-secret' }), redirect: 'follow' } }, operation(security), {})
    assert.equal(result.options.redirect, 'error')
    assert.equal(result.options.headers.get('X-API-Key'), 'manual-secret')
  }
})
