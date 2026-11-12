import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, ref } from 'vue'
import { useScenarios } from './useScenarios.js'

function setup(t) {
  const data = new Map()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
  } })
  const scopes = []
  t.after(() => { scopes.forEach(scope => scope.stop()); if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage })
  const create = url => { const scope = effectScope(); scopes.push(scope); return scope.run(() => useScenarios(ref({ openApiUrl: url }))) }
  return { data, create }
}
const chain = [{ operation: { key: 'GET /invoices', apiId: 'local', method: 'GET', path: '/invoices', name: 'Invoices' },
  session: { fields: {}, body: '', bindings: [], result: { json: { private: 'never-store-this' } } } }]

test('saved scenarios restore by API document without executing requests', t => {
  const { data, create } = setup(t)
  const store = create('https://host.test/openapi.json')
  const saved = store.save(chain, 'Invoices')
  assert.ok(![...data.values()][0].includes('never-store-this'))
  assert.equal(create('https://host.test/openapi.json').scenarios.value[0].id, saved.id)
  assert.equal(create('https://other.test/openapi.json').scenarios.value.length, 0)
  assert.equal(store.state.status, 'saved')
  store.save(chain, 'Invoices', saved.id)
  assert.equal(store.scenarios.value.length, 1)
  assert.throws(() => store.save(chain, 'Invoices'), /already exists/)
  store.remove(saved.id)
  assert.equal(create('https://host.test/openapi.json').scenarios.value.length, 0)
})

test('corrupt storage and storage write failures are reported', t => {
  const { data, create } = setup(t)
  data.set('necto:scenarios:https://host.test/openapi.json', '{invalid')
  const store = create('https://host.test/openapi.json')
  assert.match(store.error.value, /Could not load/)
  globalThis.localStorage.setItem = () => { throw new Error('quota') }
  assert.throws(() => store.save(chain, 'Invoices'), /Could not save/)
  assert.equal(store.scenarios.value.length, 0)
})

test('opening a scenario with an unavailable operation exposes a named failure', t => {
  const { create } = setup(t)
  const store = create('https://host.test/openapi.json')
  const scenario = store.save(chain, 'Invoices')
  assert.equal(store.open(scenario, { operations: [], createSession: () => ({}), valuesFor: () => new Map() }), null)
  assert.equal(store.state.id, scenario.id)
  assert.equal(store.state.status, 'failed')
  assert.match(store.state.error, /unavailable/)
})
