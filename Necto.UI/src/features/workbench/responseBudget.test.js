import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBoundedText } from './response.js'
test('budget counts UTF-8 bytes without Content-Length and cancels before parsing', async () => {
  let canceled = false
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('€€')); }, cancel() { canceled = true } }))
  await assert.rejects(readBoundedText(response, { responseLimitBytes: 5 }), /budget/)
  assert.equal(canceled, true)
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
