import test from 'node:test'
import assert from 'node:assert/strict'
import { childEntries, pageRange, PREVIEW_PAGE_SIZE } from './preview.js'

test('pages preserve absolute indices at the end of a large array', () => {
  const array = Array.from({ length: 100003 }, (_, id) => ({ id }))
  const range = pageRange(array.length, 4001, PREVIEW_PAGE_SIZE)
  assert.deepEqual(childEntries(array, range), [[100000, array[100000]], [100001, array[100001]], [100002, array[100002]]])
  assert.equal(range.pages, 4001)
  assert.equal(pageRange(array.length, 999999, 25).page, 4001)
})
test('page navigation clamps empty, invalid and negative inputs', () => {
  assert.deepEqual(pageRange(0, 0, 25), { page: 1, pages: 1, start: 0, end: 0, total: 0 })
  assert.equal(pageRange(500, 'abc', 25).page, 1)
  assert.equal(pageRange(500, -20, 25).page, 1)
})
test('pagination reads only visible array members', () => {
  let reads = 0
  const array = new Proxy(new Array(200000), { get(target, key) {
    if (/^\d+$/.test(String(key))) { reads++; return Number(key) }
    return Reflect.get(target, key)
  } })
  const entries = childEntries(array, pageRange(array.length, 8000, 25))
  assert.equal(reads, 25)
  assert.equal(entries[0][0], 199975)
})
test('objects use exact property names on subsequent pages', () => {
  const object = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`field.${index}`, index]))
  const entries = childEntries(object, pageRange(60, 2, 25), Object.keys(object))
  assert.deepEqual(entries[0], ['field.25', 25])
  assert.deepEqual(entries.at(-1), ['field.49', 49])
})
