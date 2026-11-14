import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCiBundle, ciCommand, ciSetup } from './ciBundle.js';
import { junitReport } from '../../../../tools/junit.mjs';
const scenario = {
  version: 1,
  id: 'ci',
  name: 'CI',
  steps: [
    {
      operationKey: 'GET /x',
      apiId: 'local',
      name: 'x',
      method: 'GET',
      path: '/x',
      fields: { 'header:Authorization': 'secret' },
      body: '{"id":42}',
      bindings: []
    }
  ]
};
test('CI bundle contains one masked scenario and retains its bundled schemas', () => {
  const doc = {
    openapi: '3.1.0',
    paths: {},
    'x-necto-references': { 1: { A: { type: 'string' } } }
  };
  const bundle = createCiBundle(scenario, doc);
  assert.equal(bundle.scenario.steps[0].body, '');
  assert.equal(
    bundle.scenario.steps[0].fields['header:Authorization'],
    undefined
  );
  assert.ok(bundle.document['x-necto-references'][1]);
  assert.match(
    ciCommand('https://api.test/v2', { bearer: true, writes: true }),
    /--bearer-env.*--allow-writes.*--junit/
  );
  assert.throws(
    () => ciCommand('https://user:password@api.test'),
    /credentials/
  );
});
test('JUnit report escapes metadata and reports failed/skipped steps', () => {
  const xml = junitReport({
    scenario: 'A & B',
    steps: [
      { operation: 'GET /<x>', status: 'failed', elapsed: 30, checks: [] },
      { operation: 'GET /next', status: 'skipped', checks: [] }
    ]
  });
  assert.match(xml, /failures="1" skipped="1"/);
  assert.match(xml, /A &amp; B/);
  assert.match(xml, /GET \/&lt;x&gt;/);
  assert.match(xml, /<skipped\/>/);
});
test('downloaded-style bundle runs through the CLI and writes JSON and JUnit', async () => {
  const { createServer } = await import('node:http');
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const directory = await mkdtemp(tmpdir() + '/necto-ci-');
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end('{"id":42,"password":"not-in-report"}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const doc = {
      openapi: '3.1.0',
      paths: {
        '/x': {
          get: { operationId: 'x', responses: { 200: { description: 'ok' } } }
        }
      }
    };
    const bundle = createCiBundle(scenario, doc);
    await writeFile(directory + '/bundle.json', JSON.stringify(bundle));
    await promisify(execFile)(process.execPath, [
      'tools/necto-run.mjs',
      '--bundle',
      directory + '/bundle.json',
      '--base-url',
      `http://127.0.0.1:${server.address().port}`,
      '--report',
      directory + '/report.json',
      '--junit',
      directory + '/report.xml'
    ]);
    assert.equal(
      JSON.parse(await readFile(directory + '/report.json', 'utf8')).status,
      'completed'
    );
    assert.match(
      await readFile(directory + '/report.xml', 'utf8'),
      /failures="0"/
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('CI onboarding pins the UI version and commands quote targets for the chosen shell', () => {
  assert.match(ciSetup('0.3.0'), /checkout --detach v0.3.0/)
  assert.match(ciSetup('0.3.0'), /--frozen-lockfile/)
  assert.throws(() => ciSetup('main; exit'), /version/)
  assert.match(ciCommand("https://api.test/O'Neil", {shell:'powershell'}), /'https:\/\/api.test\/O''Neil'/)
  assert.match(ciCommand("https://api.test/O'Neil"), /'\\''/)
})
