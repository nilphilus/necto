import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref, nextTick } from 'vue'
import {
  newBlueprint,
  newStep,
  dependencies,
  layers,
  validateBlueprint,
  parseBlueprint,
  readPointer,
  applyInput,
  parseHuman,
} from './model.js'
import { executeBlueprint } from './runner.js'
import { prepareBlueprint } from './prepareBlueprint.js'
import { patternTokens, generateValue } from './generation.js'
import { useBuilder, savedBlueprint } from './useBuilder.js'
import { teamDefinitions } from './definition.js'
import { readOperations } from '../api-catalog/catalog.js'
import { initialPayload, resolveRequestValues, buildRequest } from '../request-runner/request.js'
import { exportWorkspace, inspectWorkspace } from '../workbench/workspace.js'
import { notifyWorkspaceImport } from '../workbench/workspaceUpdates.js'
const operation = (id) => ({
  key: id,
  apiId: 'local',
  name: id,
  method: 'GET',
  path: '/' + id,
  parameters: [],
  tags: ['Test'],
  servers: [],
  resolve: (value) => value,
})
const draft = (...ids) => ({
  ...newBlueprint(),
  version: 2,
  name: 'Fan out and join',
  steps: ids.map((id) => ({ ...newStep(operation(id), { fields: {}, body: '' }), id })),
})
const prepared = (blueprint) =>
  blueprint.steps.map((step) => ({
    id: step.id,
    label: step.label,
    operation: operation(step.id),
    session: { fields: {}, body: '{}' },
    values: new Map(),
    inputs: step.inputs,
    dependencies: dependencies(step),
    status: 'waiting',
  }))
const deferred = () => {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
const success = (json) => ({ ok: true, status: 200, json })
const responseInput = (stepId, name, responsePointer = '/id') => ({
  source: 'response',
  stepId,
  responsePointer,
  location: 'query',
  name,
})
const context = (operations) => ({
  operations,
  configuration: { apiBaseUrl: 'https://api.test' },
  createSession: (operation) => ({ fields: {}, ...initialPayload(operation) }),
  valuesFor: () => new Map(),
})

test('DAG starts siblings concurrently, joins both responses, then fans out again without inferred links', async () => {
  const blueprint = draft('a', 'b', 'join', 'next-a', 'next-b')
  blueprint.steps[2].inputs = [responseInput('a', 'a'), responseInput('b', 'b')]
  blueprint.steps[3].inputs = [responseInput('join', 'joined')]
  blueprint.steps[4].dependsOn = ['join']
  validateBlueprint(blueprint)
  assert.deepEqual(
    layers(blueprint).map((layer) => layer.map((step) => step.id)),
    [['a', 'b'], ['join'], ['next-a', 'next-b']]
  )
  const plan = prepared(blueprint),
    gates = new Map(blueprint.steps.map((step) => [step.id, deferred()])),
    started = []
  const run = executeBlueprint(plan, {
    concurrency: 4,
    signal: new AbortController().signal,
    execute: async (operation, session) => {
      started.push(operation.key)
      await gates.get(operation.key).promise
      return success({ id: operation.key + '-result', ...session.fields })
    },
  })
  assert.deepEqual(started, ['a', 'b'])
  gates.get('a').resolve()
  await tick()
  assert.deepEqual(started, ['a', 'b'])
  gates.get('b').resolve()
  await tick()
  assert.deepEqual(started, ['a', 'b', 'join'])
  assert.deepEqual(plan[2].session.fields, { 'query:a': 'a-result', 'query:b': 'b-result' })
  gates.get('join').resolve()
  await tick()
  assert.deepEqual(started, ['a', 'b', 'join', 'next-a', 'next-b'])
  gates.get('next-a').resolve()
  gates.get('next-b').resolve()
  assert.equal((await run).status, 'completed')
  assert.equal(plan[3].session.fields['query:joined'], 'join-result')
})
test('scheduler releases a ready child without waiting for an unrelated slow sibling; honors parallelism', async () => {
  const blueprint = draft('a', 'slow', 'child')
  blueprint.steps[2].dependsOn = ['a']
  const gates = new Map(blueprint.steps.map((step) => [step.id, deferred()])),
    started = []
  let active = 0,
    peak = 0
  const run = executeBlueprint(prepared(blueprint), {
    concurrency: 2,
    signal: new AbortController().signal,
    execute: async (operation) => {
      started.push(operation.key)
      peak = Math.max(peak, ++active)
      await gates.get(operation.key).promise
      active--
      return success({})
    },
  })
  gates.get('a').resolve()
  await tick()
  assert.deepEqual(started, ['a', 'slow', 'child'])
  assert.equal(peak, 2)
  gates.get('child').resolve()
  gates.get('slow').resolve()
  assert.equal((await run).status, 'completed')
})
test('one failure aborts in-flight requests and skips descendants without retrying', async () => {
  const blueprint = draft('fail', 'slow', 'child')
  blueprint.steps[2].dependsOn = ['fail']
  const plan = prepared(blueprint),
    calls = []
  const outcome = await executeBlueprint(plan, {
    signal: new AbortController().signal,
    execute: async (operation, session, values, signal) => {
      calls.push(operation.key)
      if (operation.key === 'fail') return { ok: false, status: 500 }
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
      return null
    },
  })
  assert.equal(outcome.status, 'failed')
  assert.deepEqual(calls, ['fail', 'slow'])
  assert.deepEqual(
    plan.map((step) => step.status),
    ['failed', 'cancelled', 'skipped']
  )
})
test('human pause holds dependent requests; an independent branch continues; answers never change the definition', async () => {
  const blueprint = draft('approval', 'parallel', 'child')
  blueprint.steps[0].inputs = [
    {
      source: 'human',
      location: 'query',
      name: 'code',
      prompt: 'Approval code',
      valueType: 'text',
    },
  ]
  blueprint.steps[2].dependsOn = ['approval']
  const plan = prepared(blueprint),
    answers = deferred(),
    calls = []
  const run = executeBlueprint(plan, {
    signal: new AbortController().signal,
    ask: async () => answers.promise,
    execute: async (operation, session) => {
      calls.push([operation.key, session.fields['query:code']])
      return success({})
    },
  })
  await tick()
  assert.equal(plan[0].status, 'needs-input')
  assert.deepEqual(
    calls.map(([id]) => id),
    ['parallel']
  )
  answers.resolve(['one-time-value'])
  assert.equal((await run).status, 'completed')
  assert.deepEqual(
    calls.map(([id]) => id),
    ['parallel', 'approval', 'child']
  )
  assert.equal(plan[0].session.fields['query:code'], 'one-time-value')
  assert.ok(!JSON.stringify(savedBlueprint(blueprint)).includes('one-time-value'))
})
test('canceling a paused human step stops it and its descendants', async () => {
  const blueprint = draft('ask', 'child')
  blueprint.steps[0].inputs = [
    { source: 'human', location: 'query', name: 'code', prompt: 'Code', valueType: 'text' },
  ]
  blueprint.steps[1].dependsOn = ['ask']
  const controller = new AbortController(),
    plan = prepared(blueprint)
  const run = executeBlueprint(plan, {
    signal: controller.signal,
    ask: (step, inputs, signal) =>
      new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      ),
    execute: () => assert.fail('Must not send'),
  })
  await tick()
  controller.abort()
  assert.equal((await run).status, 'cancelled')
  assert.deepEqual(
    plan.map((step) => step.status),
    ['cancelled', 'skipped']
  )
})
test('cycles, missing dependencies and overlapping targets are rejected before execution', () => {
  const blueprint = draft('a', 'b')
  blueprint.steps[0].dependsOn = ['b']
  blueprint.steps[1].inputs = [responseInput('a', 'id')]
  assert.throws(() => validateBlueprint(blueprint), /cycle/)
  blueprint.steps[0].dependsOn = ['missing']
  assert.throws(() => validateBlueprint(blueprint), /dependency/)
  blueprint.steps[0].dependsOn = []
  blueprint.steps[1].inputs = [
    { source: 'generate', location: 'body', pointer: '/customer', generator: 'uuid' },
    { source: 'generate', location: 'body', pointer: '/customer/id', generator: 'uuid' },
  ]
  assert.throws(() => validateBlueprint(blueprint), /Overlapping/)
})
test('JSON Pointers preserve types and escaped names; arrays need existing indices; prototype targets are blocked', () => {
  assert.equal(readPointer({ 'a/b': { '~id': 42 } }, '/a~1b/~0id'), 42)
  assert.throws(() => readPointer({}, '/missing'), /no value/)
  const operation = { requestBody: { content: { 'application/json': {} } } },
    session = { body: '{"items":[{}]}', fields: {} }
  applyInput(session, operation, { location: 'body', pointer: '/items/0/id' }, 42)
  assert.equal(JSON.parse(session.body).items[0].id, 42)
  assert.throws(
    () => applyInput(session, operation, { location: 'body', pointer: '/items/1/id' }, 42),
    /index/
  )
  assert.throws(
    () =>
      applyInput(session, operation, { location: 'body', pointer: '/__proto__/polluted' }, true),
    /not supported/
  )
  assert.equal({}.polluted, undefined)
  assert.throws(() => readPointer({}, '/bad~2escape'), /Escape/)
})
test('Faker generators return appropriate types; bounded patterns match and unsafe expressions are rejected', async () => {
  assert.match(await generateValue({ generator: 'email' }), /@/)
  assert.equal(typeof (await generateValue({ generator: 'integer' })), 'number')
  assert.equal(typeof (await generateValue({ generator: 'boolean' })), 'boolean')
  for (let i = 0; i < 20; i++)
    assert.match(
      await generateValue({ generator: 'regex', pattern: '^INV-[A-Z]{3}-\\d{4}$' }),
      /^INV-[A-Z]{3}-\d{4}$/
    )
  for (const pattern of ['(a+)+', '.*', '[A-Z]{1,99}', '\\d{99}', '[Z-A]', '[abc', 'a{1,}', '^$'])
    assert.throws(() => patternTokens(pattern))
})
test('human inputs parse types strictly', () => {
  assert.equal(parseHuman('12', 'number'), 12)
  assert.equal(parseHuman('false', 'boolean'), false)
  assert.deepEqual(parseHuman('{"id":4}', 'json'), { id: 4 })
  for (const [value, type] of [
    ['', 'text'],
    ['NaN', 'number'],
    ['yes', 'boolean'],
    ['{', 'json'],
  ])
    assert.throws(() => parseHuman(value, type))
})
test('preflight checks every request and API identity before sending; manual response bindings do not require mapping metadata', () => {
  const document = {
    paths: {
      '/source': { get: { operationId: 'Source', responses: {} } },
      '/target/{id}': {
        get: {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {},
        },
      },
    },
  }
  const operations = readOperations(document),
    blueprint = draft('source', 'target')
  blueprint.steps = operations.map((operation, index) => ({
    ...newStep(operation, { fields: {}, body: '' }),
    id: index ? 'target' : 'source',
  }))
  blueprint.steps[1].inputs = [{ ...responseInput('source', 'id'), location: 'path' }]
  assert.equal(prepareBlueprint(blueprint, context(operations)).length, 2)
  blueprint.steps[1].inputs = []
  assert.throws(() => prepareBlueprint(blueprint, context(operations)), /id is required/)
  blueprint.steps[1].apiId = 'different'
  assert.throws(() => prepareBlueprint(blueprint, context(operations)), /unavailable/)
})
test('presets override dynamic body inputs while preserving unrelated fields', () => {
  const operation = readOperations({
    paths: {
      '/body': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'integer' }, name: { type: 'string' } },
                },
              },
            },
          },
          responses: {},
        },
      },
    },
  })[0]
  const blueprint = draft('body')
  blueprint.steps = [
    {
      ...newStep(operation, { fields: {}, body: '{"id":0,"name":"old"}' }),
      id: 'body',
      inputs: [{ location: 'body', pointer: '/id', source: 'generate', generator: 'integer' }],
    },
  ]
  const ctx = context([operation])
  ctx.valuesFor = () =>
    resolveRequestValues(
      operation,
      new Map([
        ['id', { value: '77' }],
        ['name', { value: 'preset-name' }],
      ])
    )
  const [step] = prepareBlueprint(blueprint, ctx)
  assert.equal(step.inputs.length, 0)
  assert.deepEqual(
    JSON.parse(buildRequest(operation, ctx.configuration, step.session, step.values).options.body),
    { id: 77, name: 'preset-name' }
  )
})
function storage(t) {
  const entries = new Map()
  const store = {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index],
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  }
  return store
}
test('saved definitions round-trip through workspace import/export; malformed builder imports are rejected', (t) => {
  const store = storage(t),
    blueprint = draft('a'),
    key = 'necto:scenario-builder:https://api.test/openapi.json'
  store.setItem(key, JSON.stringify({ version: 1, blueprints: [blueprint] }))
  const exported = exportWorkspace(store, true)
  assert.equal(exported.entries[0].key, key)
  assert.equal(inspectWorkspace(JSON.stringify(exported), store).entries.length, 1)
  assert.equal(parseBlueprint(JSON.stringify(blueprint)).name, blueprint.name)
  blueprint.steps[0].dependsOn = ['missing']
  assert.throws(() => parseBlueprint(JSON.stringify(blueprint)), /dependency/)
})
test('builder persistence excludes results and files, reloads on workspace import and scopes drafts to the API', async (t) => {
  const previous = globalThis.localStorage
  globalThis.localStorage = storage(t)
  t.after(() => {
    globalThis.localStorage = previous
  })
  const configuration = ref({ openApiUrl: 'https://one.test/openapi.json' }),
    scope = effectScope()
  let builder
  scope.run(() => {
    builder = useBuilder(configuration)
  })
  t.after(() => scope.stop())
  builder.draft.value = draft('a')
  builder.save()
  assert.equal(builder.saved.value.length, 1)
  const key = 'necto:scenario-builder:' + configuration.value.openApiUrl,
    other = draft('imported')
  localStorage.setItem(key, JSON.stringify({ version: 1, blueprints: [other] }))
  notifyWorkspaceImport([key])
  assert.equal(builder.saved.value[0].steps[0].id, 'imported')
  configuration.value = { openApiUrl: 'https://two.test/openapi.json' }
  await nextTick()
  assert.equal(builder.saved.value.length, 0)
  assert.equal(builder.draft.value.steps.length, 0)
})

test('invalid saved definitions stay on disk and do not block other scenarios or team imports', (t) => {
  const previous = globalThis.localStorage
  const store = globalThis.localStorage = storage(t)
  const scope = effectScope()
  t.after(() => {
    scope.stop()
    globalThis.localStorage = previous
  })
  const workspace = 'https://api.test/openapi.json'
  const key = 'necto:scenario-builder:' + workspace
  const valid = draft('available')
  const invalid = { ...draft('broken'), concurrency: '4' }
  store.setItem(key, JSON.stringify({ version: 1, blueprints: [valid, invalid] }))
  const builder = scope.run(() => useBuilder(ref({ openApiUrl: workspace })))
  assert.deepEqual(builder.saved.value.map(item => item.id), [valid.id])
  assert.match(builder.error.value, /Saved scenario #2: Scenario parallelism/)
  assert.throws(() => validateBlueprint({ ...valid, name: '' }), /Scenario name/)

  const importTeam = (definition, confirmReplace) => teamDefinitions.importDefinition({
    storage: store, workspace, definition: savedBlueprint(definition), confirmReplace,
    guard() {}, byteLimit: 2 * 1024 * 1024,
  })
  builder.saveCaptured(draft('newly saved'))
  assert.ok(importTeam(draft('from team'), () => assert.fail('No replacement needed')))
  assert.equal(builder.saved.value.length, 3)
  assert.deepEqual(JSON.parse(store.getItem(key)).blueprints.find(item => item.id === invalid.id), JSON.parse(JSON.stringify(invalid)))
  const corrected = { ...invalid, concurrency: 4 }
  assert.equal(importTeam(corrected, () => false), false)
  assert.ok(importTeam(corrected, () => true))
  assert.equal(builder.saved.value.length, 4)
  assert.equal(builder.error.value, '')
})

test('saved snapshots whitelist definition data and omit binary contents, results and irrelevant input settings', () => {
  const blueprint = draft('a')
  blueprint.response = { secret: 'do-not-retain' }
  blueprint.steps[0].request.result = { json: { secret: 'do-not-retain' } }
  blueprint.steps[0].request.binaryFile = new Blob(['file-contents'])
  blueprint.steps[0].inputs = [
    {
      source: 'generate',
      location: 'query',
      name: 'id',
      generator: 'uuid',
      prompt: 'irrelevant-run-question',
    },
  ]
  const saved = savedBlueprint(blueprint),
    text = JSON.stringify(saved)
  assert.ok(!text.includes('do-not-retain'))
  assert.ok(!text.includes('file-contents'))
  assert.ok(!text.includes('irrelevant-run-question'))
  assert.equal(saved.steps[0].request.binaryAttachmentRequired, true)
})
test('missing bound values fail the target instead of sending a stale static input', async () => {
  const blueprint = draft('source', 'target')
  blueprint.steps[1].inputs = [responseInput('source', 'id', '/missing')]
  const plan = prepared(blueprint)
  plan[1].session.fields['query:id'] = 'old-id'
  const calls = []
  const result = await executeBlueprint(plan, {
    signal: new AbortController().signal,
    execute: async (operation) => {
      calls.push(operation.key)
      return success({ id: 42 })
    },
  })
  assert.equal(result.status, 'failed')
  assert.deepEqual(calls, ['source'])
  assert.equal(plan[1].status, 'failed')
})
test('runtime generation runs afresh for each execution; no generated values enter the definition', async () => {
  const blueprint = draft('generated')
  blueprint.steps[0].inputs = [
    { source: 'generate', location: 'query', name: 'reference', generator: 'uuid' },
  ]
  let count = 0
  const values = []
  for (let run = 0; run < 2; run++)
    assert.equal(
      (
        await executeBlueprint(prepared(blueprint), {
          signal: new AbortController().signal,
          generate: async () => `generated-${++count}`,
          execute: async (operation, session) => {
            values.push(session.fields['query:reference'])
            return success({})
          },
        })
      ).status,
      'completed'
    )
  assert.deepEqual(values, ['generated-1', 'generated-2'])
  assert.ok(!JSON.stringify(savedBlueprint(blueprint)).includes('generated-1'))
})
test('header target conflicts are case-insensitive and human numeric whitespace is rejected', () => {
  const blueprint = draft('a')
  blueprint.steps[0].inputs = ['X-Correlation', 'x-correlation'].map((name) => ({
    location: 'header',
    name,
    source: 'generate',
    generator: 'uuid',
  }))
  assert.throws(() => validateBlueprint(blueprint), /Overlapping/)
  assert.throws(() => parseHuman('  ', 'number'))
})
test('auth invalidation cancels a waiting human prompt and removes previous API responses', async (t) => {
  const previous = globalThis.localStorage
  globalThis.localStorage = storage(t)
  t.after(() => {
    globalThis.localStorage = previous
  })
  const scope = effectScope()
  let builder
  scope.run(() => {
    builder = useBuilder(ref({ openApiUrl: 'https://one.test/openapi.json' }))
  })
  t.after(() => scope.stop())
  const op = {
    ...operation('approval'),
    parameters: [{ in: 'query', name: 'code', required: true, schema: { type: 'string' } }],
  }
  builder.draft.value = {
    ...newBlueprint(),
    steps: [
      {
        ...newStep(op, { fields: {}, body: '' }),
        inputs: [
          { source: 'human', location: 'query', name: 'code', prompt: 'Code', valueType: 'text' },
        ],
      },
    ],
  }
  const running = builder.run(context([op]), () => assert.fail('Must not send'), true)
  await tick()
  assert.equal(builder.questions.size, 1)
  builder.invalidate(['different'])
  assert.equal(builder.questions.size, 1)
  builder.invalidate(['local'])
  await running
  assert.equal(builder.questions.size, 0)
  assert.equal(builder.execution.steps.length, 0)
  assert.equal(builder.execution.status, 'idle')
  assert.equal(builder.pending.value, false)
})

test('response pointer suggestions combine schema and previous JSON paths within a fixed budget', async () => {
  const { pointerHints } = await import('./pointerHints.js')
  const operation = {
    resolve: (schema) => schema,
    responses: {
      200: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: { type: 'object', properties: { id: { type: 'integer' } } },
                },
              },
            },
          },
        },
      },
    },
  }
  const hints = pointerHints(operation, { 'a/b': { '~key': 1 } })
  assert.ok(hints.includes('/items/0/id'))
  assert.ok(hints.includes('/a~1b/~0key'))
  const huge = Object.fromEntries(
    Array.from({ length: 10000 }, (_, index) => ['field' + index, index])
  )
  assert.ok(pointerHints(operation, huge).length <= 150)
})

test('human waiting does not consume a network slot, even with parallelism set to one', async () => {
  const blueprint = draft('ask', 'independent')
  blueprint.steps[0].inputs = [
    { source: 'human', location: 'query', name: 'code', prompt: 'Code', valueType: 'text' },
  ]
  const answer = deferred(),
    calls = [],
    plan = prepared(blueprint)
  const run = executeBlueprint(plan, {
    concurrency: 1,
    signal: new AbortController().signal,
    ask: () => answer.promise,
    execute: async (operation) => {
      calls.push(operation.key)
      return success({})
    },
  })
  await tick()
  assert.deepEqual(calls, ['independent'])
  assert.equal(plan[0].status, 'needs-input')
  answer.resolve(['code'])
  assert.equal((await run).status, 'completed')
  assert.deepEqual(calls, ['independent', 'ask'])
})

test('resume includes queued requests cancelled before dispatch and keeps completed writes', async () => {
  const plan = [
    ['write', []], ['queued', []], ['child', ['write']],
  ].map(([id, dependencies]) => ({
    id, label: id, dependencies, operation: { id, method: 'POST' },
    session: { fields: {} }, inputs: [], status: 'waiting',
  }))
  const calls = []
  const options = {
    concurrency: 1, signal: new AbortController().signal,
    execute: async (operation, session, values, signal, onRequest) => {
      calls.push(operation.id)
      onRequest({ url: 'https://api.example.test', options: { method: 'POST', headers: {} } })
      return calls.length === 1 ? { ok: false, status: 503 } : { ok: true, status: 200 }
    },
  }
  assert.equal((await executeBlueprint(plan, options)).status, 'failed')
  assert.equal(plan[1].status, 'cancelled')
  assert.equal(plan[1].request, undefined)
  assert.equal((await executeBlueprint(plan, { ...options, retryStepId: 'write' })).status, 'incomplete')
  assert.equal((await executeBlueprint(plan, { ...options, resume: true })).status, 'completed')
  assert.deepEqual(calls, ['write', 'write', 'queued', 'child'])
})
