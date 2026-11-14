import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveTarget } from './target.js';
const op = {
  apiId: 'local',
  apiName: 'Invoices',
  method: 'GET',
  path: '/invoices',
  parameters: [],
  resolve: (v) => v,
  servers: [
    { url: 'https://api.test/v1' },
    { url: 'https://api.test/v2', description: 'Staging' }
  ]
};
test('same-host versions remain distinguishable and full URL follows selection', () => {
  const config = { openApiUrl: 'https://api.test/openapi.json' };
  const a = effectiveTarget(op, config, { fields: {}, serverIndex: 0 });
  const b = effectiveTarget(op, config, { fields: {}, serverIndex: 1 });
  assert.notEqual(a.label, b.label);
  assert.match(b.label, /Staging.*v2/);
  assert.equal(b.url, 'https://api.test/v2/invoices');
});
