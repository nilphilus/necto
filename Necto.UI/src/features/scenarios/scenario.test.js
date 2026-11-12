import test from 'node:test'
import assert from 'node:assert/strict'
import { snapshotScenario, rememberBinding, prepareScenario, executeScenario, readResponseAt, validateScenario } from './scenario.js'
import { applyChoice } from '../related-endpoints/mappings.js'

const op = (name, path, parameters = [], extra = {}) => ({ key: `GET ${path}`, apiId: 'local', id: name, name,
  method: 'GET', path, tags: ['Invoices'], parameters, resolve: schema => schema, ...extra })
const list = op('Invoices', '/invoices')
const lines = op('Lines', '/invoices/{invoiceId}/lines', [{ in: 'path', name: 'invoiceId', schema: { type: 'integer' } }])
const detail = op('Detail', '/lines/{lineId}', [{ in: 'path', name: 'lineId', schema: { type: 'integer' } }])
const links = [
  { from: list, to: lines, location: 'path', name: 'invoiceId', source: { eachItem: true, property: 'id' } },
  { from: lines, to: detail, location: 'path', name: 'lineId', source: { eachItem: true, property: 'lineId' } },
]
const createSession = () => ({ fields: {}, body: '', bindings: [], result: null, pending: false, error: '' })
const context = (overrides = {}) => ({ operations: [list, lines, detail], links, configuration: { openApiUrl: 'https://api.test/openapi.json' },
  createSession, valuesFor: () => new Map(), ...overrides })
function captured() {
  const chain = [list, lines, detail].map(operation => ({ operation, session: createSession() }))
  chain[0].session.result = { ok: true, json: [{ id: 42, privateResponse: 'not-persisted' }] }
  const first = { location: 'path', name: 'invoiceId', value: 42, binding: { path: [0, 'id'] } }
  applyChoice(chain[1].session, first.location, first); rememberBinding(chain[1].session, first, 0)
  const second = { location: 'path', name: 'lineId', value: 18, binding: { path: [1, 'lineId'] } }
  applyChoice(chain[2].session, second.location, second); rememberBinding(chain[2].session, second, 1)
  return chain
}
const response = json => ({ ok: true, status: 200, statusText: 'OK', json })

test('snapshot stores selectors, not response bodies or derived IDs; manual changes become literals', () => {
  const chain = captured()
  const scenario = snapshotScenario(chain, 'Invoice flow', 'scenario-1')
  assert.deepEqual(scenario.steps[1].fields, {})
  assert.deepEqual(scenario.steps[2].bindings[0].path, [1, 'lineId'])
  assert.ok(!JSON.stringify(scenario).includes('not-persisted'))
  assert.ok(!JSON.stringify(scenario).includes('appliedValue'))
  chain[1].session.fields['path:invoiceId'] = '999'
  const edited = snapshotScenario(chain, 'Edited', 'scenario-2')
  assert.equal(edited.steps[1].fields['path:invoiceId'], '999')
  assert.equal(edited.steps[1].bindings.length, 0)
})

test('replay uses fresh IDs from each new response and retains the selected array index', async () => {
  const scenario = snapshotScenario(captured(), 'Invoice flow', 'scenario-1')
  for (const id of [142, 242]) {
    const plan = prepareScenario(scenario, context())
    const calls = []
    const result = await executeScenario(plan, { signal: new AbortController().signal,
      execute: async (operation, session) => {
        calls.push({ operation: operation.name, fields: { ...session.fields } })
        return operation === list ? response([{ id }]) : operation === lines ? response([{ lineId: 117 }, { lineId: id + 1 }]) : response({ done: true })
      } })
    assert.equal(result.status, 'completed')
    assert.equal(calls[1].fields['path:invoiceId'], String(id))
    assert.equal(calls[2].fields['path:lineId'], String(id + 1))
    assert.ok(plan.every(step => step.status === 'completed'))
  }
})

test('all steps are preflighted before execution; hidden APIs, changed mappings, and preset conflicts are rejected', () => {
  const scenario = snapshotScenario(captured(), 'Invoice flow', 'scenario-1')
  assert.throws(() => prepareScenario(scenario, context({ operations: [list, lines] })), /unavailable/)
  assert.throws(() => prepareScenario(scenario, context({ links: [] })), /no longer available/)
  assert.throws(() => prepareScenario(scenario, context({ valuesFor: () => new Map([['path:lineId', 'old']]) })), /replaces mapped field/)
  const broken = structuredClone(scenario); broken.steps[2].bindings = []
  assert.throws(() => prepareScenario(broken, context()), /lineId is required/)
})

test('missing values and HTTP failures stop the chain without stale fallback IDs', async () => {
  const scenario = snapshotScenario(captured(), 'Invoice flow', 'scenario-1')
  const missing = prepareScenario(scenario, context()); let calls = 0
  const outcome = await executeScenario(missing, { signal: new AbortController().signal,
    execute: async () => { calls++; return response([{}]) } })
  assert.equal(calls, 1); assert.equal(outcome.status, 'failed'); assert.match(outcome.error, /no value/)
  assert.equal(missing[1].status, 'failed'); assert.equal(missing[2].status, 'skipped')
  const failed = prepareScenario(scenario, context()); calls = 0
  const failure = await executeScenario(failed, { signal: new AbortController().signal,
    execute: async () => { calls++; return { ok: false, status: 500, statusText: 'Failure' } } })
  assert.equal(calls, 1); assert.equal(failure.status, 'failed'); assert.equal(failed[1].status, 'skipped')
})

test('stop propagates the AbortSignal and skips later steps', async () => {
  const scenario = snapshotScenario(captured(), 'Invoice flow', 'scenario-1')
  const plan = prepareScenario(scenario, context()); const controller = new AbortController(); let calls = 0
  const result = await executeScenario(plan, { signal: controller.signal, execute: async (operation, session, values, signal) => {
    assert.equal(signal, controller.signal); calls++; controller.abort(); return response([{ id: 9 }])
  } })
  assert.equal(result.status, 'cancelled'); assert.equal(calls, 1); assert.equal(plan[1].status, 'skipped')
})

test('opening a scenario preserves unresolved bindings when editing another step', () => {
  const scenario = snapshotScenario(captured(), 'Invoice flow', 'scenario-1')
  const plan = prepareScenario(scenario, context({ validateRequests: false }))
  plan[0].session.fields['query:search'] = 'changed'
  const updated = snapshotScenario(plan, 'Invoice flow', 'scenario-1')
  assert.deepEqual(updated.steps[2].bindings, scenario.steps[2].bindings)
})

test('body bindings remove derived fields from storage and hydrate fresh values', async () => {
  const target = op('Create', '/create', [], { method: 'POST', key: 'POST /create', requestBody: { required: true, content: { 'application/json': {} } } })
  const chain = [{ operation: list, session: createSession() }, { operation: target, session: createSession() }]
  chain[1].session.body = '{"description":"keep"}'
  const choice = { location: 'body', name: 'invoice', value: { id: 42 }, binding: { path: [0] } }
  applyChoice(chain[1].session, 'body', choice); rememberBinding(chain[1].session, choice, 0)
  const scenario = snapshotScenario(chain, 'Create invoice', 'create')
  assert.deepEqual(JSON.parse(scenario.steps[1].body), { description: 'keep' })
  const plan = prepareScenario(scenario, context({ operations: [list, target], links: [{ from: list, to: target, location: 'body', name: 'invoice', source: { eachItem: true, property: null } }] }))
  const result = await executeScenario(plan, { signal: new AbortController().signal, execute: async operation => operation === list ? response([{ id: 142 }]) : response({ created: true }) })
  assert.equal(result.status, 'completed'); assert.deepEqual(JSON.parse(plan[1].session.body), { description: 'keep', invoice: { id: 142 } })
})

test('invalid, forward and overlapping bindings are rejected; path reading preserves falsy values', () => {
  const scenario = snapshotScenario(captured(), 'Invoice flow', 'scenario-1')
  scenario.steps[1].bindings[0].sourceStep = 2
  assert.throws(() => validateScenario(scenario), /Invalid response binding/)
  assert.equal(readResponseAt({ value: 0 }, ['value']), 0)
  assert.equal(readResponseAt({ value: false }, ['value']), false)
  assert.equal(readResponseAt(null, []), null)
  assert.throws(() => readResponseAt({}, ['toString']), /no value/)
})

test('inputs currently supplied by presets are omitted from snapshots and run values are frozen', () => {
  const chain = captured()
  chain[0].session.fields['header:Authorization'] = 'old-manual-token'
  const values = new Map([['header:authorization', 'preset-token']])
  const scenario = snapshotScenario(chain, 'Context', 'context', () => values)
  assert.ok(!JSON.stringify(scenario).includes('token'))
  const plan = prepareScenario(scenario, context({ valuesFor: () => values }))
  values.set('header:authorization', 'changed-after-start')
  assert.equal(plan[0].values.get('header:authorization'), 'preset-token')
})

test('a whole-body binding can hydrate a falsy JSON value', async () => {
  const target = op('Post', '/post', [], { method: 'POST', key: 'POST /post', requestBody: { required: true, content: { 'application/json': {} } } })
  const chain = [{ operation: list, session: createSession() }, { operation: target, session: createSession() }]
  const choice = { location: 'body', name: null, value: false, binding: { path: [] } }
  applyChoice(chain[1].session, 'body', choice); rememberBinding(chain[1].session, choice, 0)
  const scenario = snapshotScenario(chain, 'Post', 'post')
  assert.equal(scenario.steps[1].body, '')
  const plan = prepareScenario(scenario, context({ operations: [list, target], links: [{ from: list, to: target, location: 'body', name: null, source: { eachItem: false, property: null } }] }))
  const outcome = await executeScenario(plan, { signal: new AbortController().signal, execute: async operation => operation === list ? response(false) : response({ ok: true }) })
  assert.equal(outcome.status, 'completed'); assert.equal(plan[1].session.body, 'false')
})
