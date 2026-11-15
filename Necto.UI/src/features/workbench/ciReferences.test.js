import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { resolveCiReferences, referenceOrigin } from '../../../../tools/ci-references.mjs'
const document = (url) => ({ openapi: '3.1.0', paths: {}, components: { schemas: { Item: { $ref: url } } } })

test('CI references make no network request without an explicit trusted-origin permission', async () => {
  for (const target of ['https://api.example/schema', 'http://127.0.0.1:8080/internal', 'http://169.254.169.254/latest']) {
    let called = false
    await assert.rejects(resolveCiReferences(document(target), 'https://api.example/openapi.json', {
      fetcher: async () => { called = true; throw new Error('unexpected') }
    }), /External references are disabled/)
    assert.equal(called, false)
  }
})
test('local and prebundled references work offline; nested external references still require permission', async () => {
  const local = document('#/components/schemas/Actual'); local.components.schemas.Actual = { type: 'string' }
  const result = await resolveCiReferences(local, 'https://api.example/openapi.json', { fetcher: () => { throw new Error('network') } })
  assert.equal(result.components.schemas.Item.$ref, '#/components/schemas/Actual')
  await assert.rejects(resolveCiReferences(document('https://allowed.example/schema'), 'https://api.example/openapi.json', {
    allowedOrigins: ['https://allowed.example'], fetcher: async () => new Response('{"$ref":"http://127.0.0.1/private"}')
  }), /External references are disabled/)
})
test('trusted metadata fetches omit credentials and fail closed on redirects', async () => {
  let destinationHits = 0
  const destination = http.createServer((req, res) => { destinationHits++; res.end('{}') })
  const source = http.createServer((req, res) => { res.writeHead(302, { Location: `http://127.0.0.1:${destination.address().port}/private` }); res.end() })
  try {
    await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve)); await new Promise(resolve => source.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${source.address().port}`
    await assert.rejects(resolveCiReferences(document(origin + '/schema'), 'https://api.example/openapi.json', { allowedOrigins: [origin] }))
    assert.equal(destinationHits, 0)
    const result = await resolveCiReferences(document(origin + '/schema'), 'https://api.example/openapi.json', {
      allowedOrigins: [origin], fetcher: async (url, options) => {
        assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.ok(options.signal)
        return new Response('{"type":"string"}')
      }
    })
    assert.equal(result['x-necto-references'][1].type, 'string')
  } finally { await Promise.all([source, destination].map(server => new Promise(resolve => server.close(resolve)))) }
})
test('metadata byte limit cancels reception even with a dishonest Content-Length', async () => {
  let canceled = false
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)) }, cancel() { canceled = true } }), { headers: { 'Content-Length': '1' } })
  await assert.rejects(resolveCiReferences(document('https://allowed.example/schema'), 'https://api.example/openapi.json', {
    allowedOrigins: ['https://allowed.example'], fetcher: async () => response
  }), /budget/)
  assert.equal(canceled, true)
})
test('metadata timeout interrupts an unfinished body and cancels the reader', async () => {
  let canceled = false
  const keepAlive = setTimeout(() => {}, 1000)
  try {
    await assert.rejects(resolveCiReferences(document('https://allowed.example/schema'), 'https://api.example/openapi.json', {
      allowedOrigins: ['https://allowed.example'], timeout: 20,
      fetcher: async () => new Response(new ReadableStream({ cancel() { canceled = true } }))
    }), /timeout|timed out/i)
    assert.equal(canceled, true)
  } finally { clearTimeout(keepAlive) }
})
test('network permission accepts only explicit HTTP(S) origins', () => {
  assert.equal(referenceOrigin('https://schemas.example:8443/'), 'https://schemas.example:8443')
  for (const value of ['file:///tmp/schema', 'https://u:p@schemas.example', 'https://schemas.example/path', 'https://schemas.example/?token=x'])
    assert.throws(() => referenceOrigin(value))
})

test('CLI checks writes before allowed metadata and rejects unapproved references before any connection', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const directory = await mkdtemp(join(tmpdir(), 'necto-ref-policy-'))
  let hits = 0
  const server = http.createServer((req, res) => { hits++; res.setHeader('Content-Type', 'application/json'); res.end('{"type":"string"}') })
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const scenario = { version: 1, id: 'policy', name: 'policy', steps: [{ operationKey: 'POST /write', apiId: 'local', method: 'POST', path: '/write', name: 'write', fields: {}, body: '', bindings: [] }] }
    const spec = document(origin + '/schema'); spec.paths = { '/write': { post: { responses: {} } } }
    await writeFile(join(directory, 'scenario.json'), JSON.stringify(scenario)); await writeFile(join(directory, 'openapi.json'), JSON.stringify(spec))
    const args = ['tools/necto-run.mjs', '--scenario', join(directory, 'scenario.json'), '--document', join(directory, 'openapi.json'), '--base-url', 'http://127.0.0.1:1']
    await assert.rejects(promisify(execFile)(process.execPath, [...args, '--allow-ref-origin', origin]), error => /allow-writes/.test(error.stderr))
    await assert.rejects(promisify(execFile)(process.execPath, [...args, '--allow-writes']), error => /External references are disabled/.test(error.stderr))
    assert.equal(hits, 0)
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) }
})
