import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bodyContent,
  formFields,
  buildNonJsonBody,
  payloadSnapshot
} from './body.js'
import { evaluateAssertions, validateAssertions } from './assertions.js'
import { parseDocument, bundleReferences } from './document.js'
import { schemaIssues } from './schema.js'
import { requestSnippet } from './snippets.js'
import { sendRequest, STREAM_EVENT_LIMIT } from './response.js'
import {
  exportWorkspace,
  inspectWorkspace,
  importWorkspace
} from './workspace.js'
import { diffValues, useRequestHistory } from './history.js'
const operation = {
  key: 'POST /upload',
  name: 'Upload',
  resolve: (value) => value,
  requestBody: {
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['file', 'title'],
          properties: {
            file: { type: 'string', format: 'binary' },
            title: { type: 'string', example: 'hello' }
          }
        }
      }
    }
  }
}
const request = (body) => ({
  url: new URL('https://example.test/upload?api_key=private&q=hello'),
  options: {
    method: 'POST',
    headers: new Headers({
      Authorization: 'Bearer private',
      'Content-Type': 'application/json'
    }),
    body
  }
})
test('multipart files stay binary; required attachment and explicit media type', () => {
  const rows = formFields(operation, 'multipart/form-data')
  assert.equal(rows[0].kind, 'file')
  assert.throws(
    () =>
      buildNonJsonBody(operation, { formFields: rows }, 'multipart/form-data'),
    /Choose a file/
  )
  rows[0].files = [new Blob(['abc'])]
  const body = buildNonJsonBody(
    operation,
    { formFields: rows },
    'multipart/form-data'
  )
  assert.equal(body.get('file').size, 3)
  assert.equal(body.get('title'), 'hello')
  assert.equal(
    payloadSnapshot({ formFields: rows }).formFields[0].files.length,
    0
  )
  assert.equal(bodyContent(operation)[0], 'multipart/form-data')
})
test('urlencoded repeated fields and raw binary do not stringify file bytes', () => {
  const fields = [
    {
      name: 'tag',
      enabled: true,
      kind: 'text',
      multiple: true,
      value: '["a b","c"]'
    }
  ]
  assert.equal(
    buildNonJsonBody(
      operation,
      { formFields: fields },
      'application/x-www-form-urlencoded'
    ).toString(),
    'tag=a+b&tag=c'
  )
  const binary = new Blob(['abc'])
  assert.equal(
    buildNonJsonBody(
      operation,
      { binaryFile: binary },
      'application/octet-stream'
    ),
    binary
  )
})
test('declarative checks cover status, JSON pointers, values, emptiness and duration', () => {
  const checks = [
    { kind: 'status', expected: '201' },
    { kind: 'exists', path: '/a~1b/0' },
    { kind: 'equals', path: '/a~1b/0', expected: 'false' },
    { kind: 'nonempty', path: '/a~1b' },
    { kind: 'duration', expected: '100' }
  ]
  assert.ok(
    evaluateAssertions(checks, {
      status: 201,
      json: { 'a/b': [false] },
      elapsed: 30
    }).every((check) => check.passed)
  )
  assert.throws(
    () => validateAssertions([{ kind: 'equals', expected: 'bad' }]),
    /JSON/
  )
  assert.throws(
    () => validateAssertions([{ kind: 'exists', path: 'bad' }]),
    /Pointer/
  )
})
test('safe generated snippets use actual URL/body and mask credentials', () => {
  for (const language of ['curl', 'fetch', 'csharp']) {
    const code = requestSnippet(
      request('{"password":"private","invoiceId":42}'),
      language
    )
    assert.equal(code.includes('private'), false)
    assert.ok(code.includes('42'))
    assert.ok(code.includes('redacted'))
  }
  const form = new FormData()
  form.append('file', new Blob(['bytes']), 'x.txt')
  assert.match(requestSnippet(request(form)), /@\/path\/to\/x.txt/)
})
test('YAML, version checks and Swagger2 body conversion', () => {
  assert.equal(
    parseDocument('openapi: 3.1.0\ninfo:\n  title: Demo\npaths: {}').info.title,
    'Demo'
  )
  assert.throws(() => parseDocument('openapi: 4.0.0'), /Supported/)
  const converted = parseDocument(
    JSON.stringify({
      swagger: '2.0',
      host: 'example.test',
      paths: {
        '/x': {
          post: {
            parameters: [
              { in: 'body', name: 'data', schema: { $ref: '#/definitions/X' } }
            ],
            responses: {
              200: { description: 'ok', schema: { type: 'string' } }
            }
          }
        }
      },
      definitions: { X: { type: 'object' } }
    })
  )
  assert.equal(
    converted.paths['/x'].post.requestBody.content['application/json'].schema
      .$ref,
    '#/components/schemas/X'
  )
})
test('external references bundle shared and circular models without forwarding credentials', async () => {
  const seen = []
  const document = {
    openapi: '3.1.0',
    paths: {},
    components: {
      schemas: { A: { $ref: 'models.yaml#/A' }, B: { $ref: 'models.yaml#/A' } }
    }
  }
  await bundleReferences(
    document,
    'https://example.test/openapi.yaml',
    async (url, options) => {
      seen.push({ url, options })
      return new Response(
        'A:\n  type: object\n  properties:\n    child:\n      $ref: "#/A"'
      )
    }
  )
  assert.equal(seen.length, 1)
  assert.equal(seen[0].options.credentials, 'omit')
  assert.equal(document.components.schemas.A.$ref, '#/x-necto-references/1/A')
  assert.equal(
    document['x-necto-references'][1].A.properties.child.$ref,
    '#/x-necto-references/1/A'
  )
})
test('schema hints support required, enum, formats in models and oneOf constraints', () => {
  assert.ok(schemaIssues({}, { type: 'object', required: ['id'] }).length)
  assert.equal(
    schemaIssues(
      { id: 3 },
      {
        oneOf: [
          {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'integer' } }
          },
          { type: 'string' }
        ]
      }
    ).length,
    0
  )
  assert.ok(schemaIssues('c', { enum: ['a', 'b'] }).length)
})
test('binary responses preserve original bytes and exposed headers', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(new Uint8Array([0, 255, 128, 1]), {
        headers: { 'Content-Type': 'application/pdf', ETag: 'v1' }
      })
  )
  const result = await sendRequest(request())
  assert.deepEqual(
    [...new Uint8Array(await result.binary.arrayBuffer())],
    [0, 255, 128, 1]
  )
  assert.equal(result.headers.etag, 'v1')
})
test('NDJSON/SSE progress is incremental and event count bounded', async (t) => {
  let progress = 0
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        Array.from({ length: 500 }, (_, i) => JSON.stringify({ id: i })).join(
          '\n'
        ),
        { headers: { 'Content-Type': 'application/x-ndjson' } }
      )
  )
  const result = await sendRequest(request(), { onProgress: () => progress++ })
  assert.equal(result.stream.events.length, STREAM_EVENT_LIMIT)
  assert.equal(result.stream.limited, true)
  assert.ok(progress)
  globalThis.fetch = async () =>
    new Response('event: invoice\nid: 7\ndata: {"id":7}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' }
    })
  const sse = await sendRequest(request())
  assert.deepEqual(sse.stream.events[0].data, { id: 7 })
  assert.equal(sse.stream.events[0].event, 'invoice')
})
function storage(values = {}) {
  const map = new Map(Object.entries(values))
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index],
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key)
  }
}
test('workspace is versioned, excludes auth and bodies by default, previews conflicts', () => {
  const store = storage({
    'necto:scenarios:api': JSON.stringify({
      version: 1,
      scenarios: [
        {
          version: 1,
          id: 'flow',
          name: 'flow',
          steps: [
            {
              operationKey: 'GET /x',
              apiId: 'local',
              name: 'x',
              method: 'GET',
              path: '/x',
              bindings: [],
              body: 'secret',
              fields: { 'header:Authorization': 'private', 'query:id': '42' }
            }
          ]
        }
      ]
    }),
    'necto:authentication:api': 'private'
  })
  const exported = exportWorkspace(store)
  assert.equal(exported.entries.length, 1)
  assert.equal(JSON.stringify(exported).includes('private'), false)
  assert.equal(JSON.stringify(exported).includes('secret'), false)
  const preview = inspectWorkspace(JSON.stringify(exported), store)
  assert.equal(preview.entries[0].conflict, true)
  assert.equal(importWorkspace(preview, store), 0)
  assert.throws(
    () => inspectWorkspace(JSON.stringify({ ...exported, version: 2 }), store),
    /version/
  )
})
test('history caps entries and response memory; diff reports changed fields', () => {
  const history = useRequestHistory()
  for (let i = 0; i < 30; i++)
    history.add(operation, request(), {
      status: 200,
      json: { id: i },
      rawText: '{"id":0}'
    })
  assert.equal(history.entries.length, 20)
  assert.equal(history.entries[0].request.headers.authorization, '[redacted]')
  const huge = 'a'.repeat(300000)
  history.add(operation, request(), { json: { huge }, rawText: huge })
  assert.equal(history.entries[0].omitted, true)
  assert.equal(diffValues({ a: 1 }, { a: 2 }).changes[0].path, '/a')
})

test('conditional bindings follow the matching object after reordering and reject ambiguity', async () => {
  const { selectionRulePath } = await import('./selectionRule.js')
  const rule = { arrayPath: [], field: '/reference', expected: '"INV-42"' }
  assert.deepEqual(
    selectionRulePath(
      [
        { reference: 'INV-99', id: 1 },
        { reference: 'INV-42', id: 42 }
      ],
      [0, 'id'],
      rule
    ),
    [1, 'id']
  )
  assert.throws(() => selectionRulePath([], [0, 'id'], rule), /0 items/)
  assert.throws(
    () =>
      selectionRulePath(
        [{ reference: 'INV-42' }, { reference: 'INV-42' }],
        [0, 'id'],
        rule
      ),
    /2 items/
  )
})
test('native OpenAPI Links become usable mapped parameters', async () => {
  const { readOperations } = await import('../api-catalog/catalog.js')
  const { resolveMappingLinks } =
    await import('../related-endpoints/mappings.js')
  const document = {
    paths: {
      '/invoice': {
        get: {
          operationId: 'create',
          responses: {
            200: {
              links: {
                next: {
                  operationId: 'read',
                  parameters: { invoiceId: '$response.body#/id' }
                }
              }
            }
          }
        }
      },
      '/invoice/{invoiceId}': {
        get: {
          operationId: 'read',
          parameters: [
            { in: 'path', name: 'invoiceId', schema: { type: 'integer' } }
          ],
          responses: {}
        }
      }
    }
  }
  const links = resolveMappingLinks(readOperations(document), [])
  assert.equal(links.length, 1)
  assert.equal(links[0].source.property, 'id')
  assert.equal(links[0].location, 'path')
})
test('headless runner uses bindings and assertions and reports failure with no secret bodies', async () => {
  const http = await import('node:http')
  const { runScenario } = await import('../../../../tools/necto-run.mjs')
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ id: 42, password: 'private' }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const document = {
      paths: {
        '/invoice': {
          get: {
            operationId: 'read',
            responses: { 200: { description: 'ok' } }
          }
        }
      }
    }
    const scenario = {
      version: 1,
      id: 'one',
      name: 'CI',
      steps: [
        {
          operationKey: 'GET /invoice',
          apiId: 'local',
          name: 'read',
          method: 'GET',
          path: '/invoice',
          fields: {},
          body: '',
          bindings: [],
          assertions: [{ kind: 'equals', path: '/id', expected: '42' }]
        }
      ]
    }
    const report = await runScenario({ scenario, document, baseUrl })
    assert.equal(report.status, 'completed')
    assert.equal(JSON.stringify(report).includes('private'), false)
    scenario.steps[0].assertions[0].expected = '17'
    assert.equal(
      (await runScenario({ scenario, document, baseUrl })).status,
      'failed'
    )
    scenario.steps[0].method = 'POST'
    await assert.rejects(
      runScenario({ scenario, document, baseUrl }),
      /allow-writes/
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('checks compare object values regardless of key order and snippets retain large arrays', () => {
  assert.equal(
    evaluateAssertions(
      [{ kind: 'equals', path: '', expected: '{"b":2,"a":1}' }],
      { json: { a: 1, b: 2 } }
    )[0].passed,
    true
  )
  const rows = Array.from({ length: 1500 }, (_, id) => ({
    id,
    token: 'private'
  }))
  const code = requestSnippet(request(JSON.stringify({ rows })), 'fetch')
  assert.ok(code.includes('1499'))
  assert.equal(code.includes('private'), false)
})
test('workspace import rolls back partial writes and rejects malformed scenarios', () => {
  const store = storage(),
    original = store.setItem
  store.setItem = (key, value) => {
    if (key.endsWith(':two')) throw new Error('Quota')
    original(key, value)
  }
  const value = { local: { url: 'https://example.test' } }
  assert.throws(
    () =>
      importWorkspace(
        {
          format: 'necto-workspace',
          version: 1,
          entries: [
            { key: 'necto:servers:one', value },
            { key: 'necto:servers:two', value }
          ]
        },
        store
      ),
    /Quota/
  )
  assert.equal(store.length, 0)
  assert.throws(
    () =>
      inspectWorkspace(
        JSON.stringify({
          format: 'necto-workspace',
          version: 1,
          entries: [
            {
              key: 'necto:scenarios:api',
              value: { version: 1, scenarios: [{}] }
            }
          ]
        }),
        store
      ),
    /scenario/
  )
})
test('saved optional files require reattachment instead of silently changing the request', () => {
  assert.throws(
    () =>
      buildNonJsonBody(
        operation,
        { binaryAttachmentRequired: true },
        'application/octet-stream'
      ),
    /Choose a file/
  )
  assert.throws(
    () =>
      buildNonJsonBody(
        operation,
        {
          formFields: [
            {
              kind: 'file',
              name: 'optional',
              enabled: true,
              required: false,
              attachmentRequired: true,
              files: []
            }
          ]
        },
        'multipart/form-data'
      ),
    /Choose a file/
  )
})

test('an explicitly expected error status can pass a negative scenario test', async () => {
  const { executeScenario } = await import('../scenarios/scenario.js')
  const plan = [{ operation: {}, session: {}, values: new Map(), bindings: [] }]
  const result = await executeScenario(plan, {
    signal: new AbortController().signal,
    execute: async () => ({
      status: 404,
      ok: false,
      assertions: [{ kind: 'status', passed: true }]
    })
  })
  assert.equal(result.status, 'completed')
})
