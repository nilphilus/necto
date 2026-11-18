import { newBlueprint } from '../scenario-builder/model.js';
import { exportWorkspace } from './workspace.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTransfer, applyTransfer } from './transfers.js';
import { exportScenario } from '../scenarios/export.js';
const scenario = (id, name) => ({
  version: 1,
  id,
  name,
  steps: [
    {
      operationKey: 'GET /x',
      apiId: 'local',
      name: 'x',
      method: 'GET',
      path: '/x',
      fields: {},
      body: '{"id":42}',
      bindings: []
    }
  ]
});
function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i],
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}
const key = 'necto:scenarios:https://api.test/openapi.json';
const workspace = (scenarios) => ({
  format: 'necto-workspace',
  version: 1,
  entries: [{ key, value: { version: 1, scenarios } }]
});
test('keep/replace/copy decisions preserve unrelated scenarios and copy identities', () => {
  const store = storage({
    [key]: JSON.stringify({
      version: 1,
      scenarios: [scenario('a', 'A'), scenario('b', 'B')]
    })
  });
  const plan = planTransfer(
    workspace([scenario('a', 'Incoming'), scenario('c', 'C')]),
    store
  );
  assert.equal(plan[0].action, 'keep');
  applyTransfer(plan, store);
  assert.deepEqual(
    JSON.parse(store.getItem(key)).scenarios.map((s) => s.name),
    ['A', 'B', 'C']
  );
  const copy = planTransfer(workspace([scenario('a', 'A')]), store);
  copy[0].action = 'copy';
  applyTransfer(copy, store);
  const saved = JSON.parse(store.getItem(key)).scenarios;
  assert.notEqual(saved[3].id, 'a');
  assert.match(saved[3].name, /imported/);
});
test('single-scenario export excludes other scenarios and omits bodies by default', () => {
  const store = storage({
    [key]: JSON.stringify({
      version: 1,
      scenarios: [scenario('a', 'A'), scenario('b', 'B')]
    })
  });
  const exported = exportScenario(store, 'a', 'https://api.test/openapi.json');
  assert.equal(exported.entries[0].value.scenarios.length, 1);
  assert.equal(exported.entries[0].value.scenarios[0].steps[0].body, '');
});
test('scenario export uses the logical workspace and ignores unrelated invalid storage', () => {
  const workspace = 'https://api.test/openapi.json#necto-workspace=QA';
  const workspaceKey = 'necto:scenarios:' + workspace;
  const store = storage({
    [key]: '{',
    [workspaceKey]: JSON.stringify({ version: 1, scenarios: [scenario('a', 'A')] })
  });
  const exported = exportScenario(store, 'a', workspace, true);
  assert.equal(exported.entries[0].key, workspaceKey);
  assert.equal(exported.entries[0].value.scenarios[0].steps[0].body, '{"id":42}');
  assert.throws(() => exportScenario(store, 'missing', workspace), /no longer saved/);
});

test('merging does not erase credentials from unrelated existing local items', () => {
  const env = 'necto:environments:api',
    store = storage({
      [env]: JSON.stringify({
        version: 2,
        presets: [['Existing', [['token', { value: 'local-secret' }]]]],
        active: ['Existing'],
        colors: {}
      })
    });
  const plan = planTransfer(
    {
      format: 'necto-workspace',
      version: 1,
      entries: [
        {
          key: env,
          value: {
            version: 2,
            presets: [['New', [['tenant', { value: 'demo' }]]]],
            active: [],
            colors: {}
          }
        }
      ]
    },
    store
  );
  applyTransfer(plan, store);
  assert.equal(
    JSON.parse(store.getItem(env)).presets[0][1][0][1].value,
    'local-secret'
  );
});
test('item transfer rolls back earlier collections when a later write fails', () => {
  const store = storage();
  const set = store.setItem;
  store.setItem = (key, value) => {
    if (key.endsWith(':fail')) throw new Error('Quota');
    set(key, value);
  };
  const plan = planTransfer(
    {
      format: 'necto-workspace',
      version: 1,
      entries: [
        {
          key: 'necto:servers:ok',
          value: { local: { url: 'https://api.test' } }
        },
        {
          key: 'necto:servers:fail',
          value: { local: { url: 'https://api.test' } }
        }
      ]
    },
    store
  );
  assert.throws(() => applyTransfer(plan, store), /Quota/);
  assert.equal(store.length, 0);
});

test('actual request-samples storage keys export and merge as named requests', () => {
  const sampleKey =
    'necto:request-samples:["https://api.test/openapi.json","GET /x"]';
  const saved = {
    samples: [{ name: 'Existing', fields: { 'query:id': '42' } }],
    defaultName: 'Existing'
  };
  const store = storage({ [sampleKey]: JSON.stringify(saved) });
  const plan = planTransfer(
    {
      format: 'necto-workspace',
      version: 1,
      entries: [
        {
          key: sampleKey,
          value: {
            samples: [{ name: 'New', fields: { 'query:id': '43' } }],
            defaultName: ''
          }
        }
      ]
    },
    store
  );
  assert.equal(plan[0].kind, 'samples');
  applyTransfer(plan, store);
  assert.deepEqual(
    JSON.parse(store.getItem(sampleKey)).samples.map((item) => item.name),
    ['Existing', 'New']
  );
  assert.equal(JSON.parse(store.getItem(sampleKey)).defaultName, 'Existing');
});

test('saved-request export preserves the structured API/operation scope key', () => {
  const sampleKey =
    'necto:request-samples:["https://api.test/openapi.json","GET /x"]';
  const store = storage({
    [sampleKey]: JSON.stringify({
      samples: [{ name: 'Request', fields: {} }],
      defaultName: ''
    })
  });
  assert.equal(exportWorkspace(store).entries[0].key, sampleKey);
});

test('workspace transfer imports Builder definitions by ID and preserves unrelated definitions', () => {
  const builderKey = 'necto:scenario-builder:https://api.test/openapi.json';
  const first = { ...newBlueprint(), name: 'First' };
  const second = { ...newBlueprint(), name: 'Second' };
  const source = storage({
    [builderKey]: JSON.stringify({ version: 1, blueprints: [first, second] })
  });
  const destination = storage();
  const plan = planTransfer(exportWorkspace(source, true), destination);
  assert.deepEqual(plan.map(({ id, label }) => [id, label]), [
    [first.id, 'First'], [second.id, 'Second']
  ]);
  applyTransfer(plan, destination);

  source.setItem(builderKey, JSON.stringify({
    version: 1, blueprints: [{ ...first, name: 'First updated' }]
  }));
  const replacement = planTransfer(exportWorkspace(source, true), destination);
  assert.equal(replacement[0].action, 'keep');
  replacement[0].action = 'replace';
  applyTransfer(replacement, destination);
  assert.deepEqual(JSON.parse(destination.getItem(builderKey)).blueprints, [
    { ...first, name: 'First updated' }, second
  ]);
});
