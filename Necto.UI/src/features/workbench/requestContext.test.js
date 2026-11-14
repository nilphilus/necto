import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestIdentity, captureSentRequest } from './requestContext.js';
const request = (value) => ({
  url: new URL(`https://api.test/v1?reference=${value}`),
  options: {
    method: 'POST',
    headers: new Headers({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json'
    }),
    body: '{"password":"secret","id":42}'
  }
});
test('request identity follows effective inputs while safe sent snapshot remains unchanged', () => {
  const original = request('INV-42'),
    snapshot = captureSentRequest(original);
  assert.notEqual(
    requestIdentity(original),
    requestIdentity(request('INV-43'))
  );
  original.url.searchParams.set('reference', 'INV-99');
  original.options.headers.set('Authorization', 'other');
  assert.equal(snapshot.url.searchParams.get('reference'), 'INV-42');
  assert.equal(snapshot.options.headers.get('authorization'), '[redacted]');
  assert.equal(snapshot.options.body.includes('secret'), false);
});
test('replacement upload with same metadata changes identity', () => {
  const first = new Blob(['a']),
    second = new Blob(['b']),
    req = request('42');
  assert.notEqual(
    requestIdentity(req, { binaryFile: first }),
    requestIdentity(req, { binaryFile: second })
  );
});

test('non-BMP body edits invalidate the previous request identity', () => {
  const a = request('42'),
    b = request('42');
  a.options.body = '{"note":"😀"}';
  b.options.body = '{"note":"😃"}';
  assert.notEqual(requestIdentity(a), requestIdentity(b));
});
