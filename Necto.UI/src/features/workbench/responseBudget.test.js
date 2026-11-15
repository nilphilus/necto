import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBoundedText, readBoundedBinary, sendRequest } from './response.js'
test('budget counts UTF-8 bytes without Content-Length and cancels before parsing', async () => {
  let canceled = false
  const updates = []
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('€€')); }, cancel() { canceled = true } }))
  await assert.rejects(readBoundedText(response, { responseLimitBytes: 5, onProgress: update => updates.push(update) }), /budget/)
  assert.equal(canceled, true)
  assert.equal(updates.at(-1).bytes, 6)
})
test('chunk boundaries preserve multibyte text and report actual byte count', async () => {
  const bytes = new TextEncoder().encode('a€b'), updates = []
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 2)); c.enqueue(bytes.slice(2)); c.close() } }), { headers: { 'content-length': '999' } })
  assert.deepEqual(await readBoundedText(response, { responseLimitBytes: 5, onProgress: x => updates.push(x) }), { text: 'a€b', bytes: 5 })
  assert.equal(updates.at(-1).bytes, 5)
})
test('cancel interrupts reception even while waiting for another chunk', async () => {
  let canceled = false
  const controller = new AbortController()
  const promise = readBoundedText(new Response(new ReadableStream({ cancel() { canceled = true } })), { signal: controller.signal })
  controller.abort(new Error('user canceled'))
  await assert.rejects(promise, /user canceled/)
  assert.equal(canceled, true)
})

test('binary byte budget cancels oversized responses regardless of Content-Length', async () => {
  for (const declared of [undefined, '1', '999999']) {
    let canceled = false
    const updates = []
    const headers = { 'Content-Type': 'application/octet-stream', ...(declared ? { 'Content-Length': declared } : {}) }
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.enqueue(new Uint8Array([4, 5, 6])) }, cancel() { canceled = true } }), { headers })
    await assert.rejects(readBoundedBinary(response, { responseLimitBytes: 5, onProgress: update => updates.push(update) }), error => error.code === 'RESPONSE_LIMIT_EXCEEDED')
    assert.equal(canceled, true)
    assert.equal(updates.at(-1).bytes, 6)
  }
})
test('binary files preserve bytes and MIME type at the exact budget boundary', async () => {
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0, 255])); c.enqueue(new Uint8Array([128, 10])); c.close() } }), { headers: { 'Content-Type': 'application/pdf' } })
  const result = await readBoundedBinary(response, { responseLimitBytes: 4 })
  assert.equal(result.bytes, 4); assert.equal(result.binary.type, 'application/pdf')
  assert.deepEqual([...new Uint8Array(await result.binary.arrayBuffer())], [0, 255, 128, 10])
})
test('cancelling a waiting binary response cancels the reader and returns no partial Blob', async () => {
  let canceled = false
  const controller = new AbortController()
  const pending = readBoundedBinary(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])) }, cancel() { canceled = true } })), { signal: controller.signal })
  controller.abort(new Error('binary cancelled'))
  await assert.rejects(pending, /binary cancelled/); assert.equal(canceled, true)
})
test('the shared HTTP transport applies the requested budget to binary responses', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => new Response(new Uint8Array(32), { headers: { 'Content-Type': 'application/octet-stream' } })
  await assert.rejects(sendRequest({ url: 'https://review.invalid/file', options: {} }, { responseLimitBytes: 1 }), error => error.code === 'RESPONSE_LIMIT_EXCEEDED')
})
