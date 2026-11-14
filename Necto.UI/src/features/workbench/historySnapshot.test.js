import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  historySnapshot,
  requestFromHistory,
  restoreHistoryDraft
} from './historySnapshot.js';
const request = {
  url: new URL('https://api.test/x?api_key=secret'),
  options: {
    method: 'POST',
    headers: new Headers({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json'
    }),
    body: '{"id":42,"password":"secret"}'
  }
};
test('history snapshots reproduce sent requests without credentials and restore without sending', () => {
  const snap = historySnapshot(request, {
    fields: { 'query:id': '42', 'header:Authorization': 'secret' },
    body: request.options.body
  });
  assert.equal(JSON.stringify(snap).includes('secret'), false);
  const session = { result: { status: 200 }, fields: {}, body: '' };
  restoreHistoryDraft(session, snap);
  assert.equal(session.fields['query:id'], '42');
  assert.equal(session.fields['header:Authorization'], undefined);
  assert.equal(session.resultStale, true);
  assert.equal(JSON.parse(session.body).password, undefined);
  assert.equal(
    requestFromHistory(snap).options.headers.get('authorization'),
    '[redacted]'
  );
});
test('form snapshots preserve repeated values but never retain upload bytes', () => {
  const form = new FormData();
  form.append('tag', 'a');
  form.append('tag', 'b');
  form.append('file', new Blob(['sensitive upload']), 'invoice.txt');
  const snap = historySnapshot(
    { ...request, options: { ...request.options, body: form } },
    { fields: {}, body: '' }
  );
  assert.equal(JSON.stringify(snap).includes('sensitive upload'), false);
  const restored = requestFromHistory(snap).options.body;
  assert.deepEqual(restored.getAll('tag'), ['a', 'b']);
  assert.equal(restored.get('file').size, 0);
});
