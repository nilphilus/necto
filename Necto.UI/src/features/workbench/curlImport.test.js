import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurl, curlMatches, curlDraft, shellWords } from './curlImport.js';
import { buildRequest } from '../request-runner/request.js';
import { payloadSnapshot, validatePayloadSnapshot } from './body.js';
const operation = {
  key: 'GET /invoices/{id}',
  apiId: 'local',
  name: 'Invoice',
  method: 'GET',
  path: '/invoices/{id}',
  server: { url: 'https://api.test/v2' },
  servers: [{ url: 'https://api.test/v2' }],
  parameters: [
    { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
    {
      in: 'query',
      name: 'tag',
      schema: { type: 'array', items: { type: 'string' } }
    }
  ],
  resolve: (value) => value
};
const configuration = { openApiUrl: 'https://api.test/openapi.json' };
test('POSIX quoting and line continuations preserve literal body values', () => {
  assert.deepEqual(
    shellWords(
      'curl \\\n \'https://api.test/x\' --data-raw \'{"text":"a; $literal"}\''
    ),
    ['curl', 'https://api.test/x', '--data-raw', '{"text":"a; $literal"}']
  );
  assert.equal(
    parseCurl('curl --json \'{"id":42}\' https://api.test/x').method,
    'POST'
  );
});
test('shell operators, expansions, file reads and unsupported flags fail without execution', () => {
  for (const value of [
    'curl https://api.test; echo bad',
    'curl "$URL"',
    'curl https://api.test -d @secret',
    'curl https://api.test -k',
    'curl https://api.test -F file=@x'
  ])
    assert.throws(() => parseCurl(value));
  assert.equal(
    parseCurl("curl https://api.test --data-raw '@literal'").body,
    '@literal'
  );
});
test('credential values and browser headers are removed before preview and import', () => {
  const request = parseCurl(
    "curl 'https://api.test/x?api_key=secret&q=ok' -H 'Authorization: Bearer secret' -H 'Host: api.test' -H 'X-Tenant: demo'"
  );
  assert.equal(request.url.searchParams.get('api_key'), null);
  assert.equal(request.headers.get('authorization'), null);
  assert.equal(request.headers.get('host'), null);
  assert.equal(request.headers.get('x-tenant'), 'demo');
  assert.ok(request.warnings.length);
});
test('matched drafts preserve path/query/undeclared headers and survive saved payload snapshots', () => {
  const parsed = parseCurl(
    "curl 'https://api.test/v2/invoices/42?tag=a&tag=b&trace=one' -H 'X-Tenant: demo'"
  );
  const match = curlMatches(parsed, [operation], configuration);
  assert.equal(match.length, 1);
  const draft = curlDraft(parsed, match[0]);
  assert.equal(draft.fields['path:id'], '42');
  assert.deepEqual(JSON.parse(draft.fields['query:tag']), ['a', 'b']);
  const request = buildRequest(operation, configuration, draft);
  assert.equal(request.options.headers.get('x-tenant'), 'demo');
  assert.equal(request.url.searchParams.get('trace'), 'one');
  const saved = payloadSnapshot(draft);
  validatePayloadSnapshot(saved);
  assert.equal(saved.extraHeaders['x-tenant'], 'demo');
  assert.equal(
    curlMatches(
      { ...parsed, url: new URL('https://other.test/v2/invoices/42') },
      [operation],
      configuration
    ).length,
    0
  );
});
test('GET data is encoded into query and JSON content types match case-insensitively', () => {
  const query = parseCurl("curl -G https://api.test/x -d 'q=a+b'");
  assert.equal(query.body, undefined);
  assert.equal(query.url.searchParams.get('q'), 'a b');
  const request = parseCurl(
    "curl https://api.test/x -H 'Content-Type: Application/JSON; charset=utf-8' -d '{\"id\":42}'"
  );
  const draft = curlDraft(request, {
    operation: {
      ...operation,
      requestBody: { content: { 'application/json': {} } }
    },
    fields: {},
    serverIndex: -1
  });
  assert.equal(draft.mediaType, 'application/json');
  assert.throws(
    () => parseCurl('curl -X GET https://api.test/x -d x'),
    /method\/body/
  );
});
