import test from 'node:test'
import assert from 'node:assert/strict'
import { searchPayload, valueAtPath, selectableOwner, pathLabel } from './search.js'
const search = (document, options) => searchPayload(document, { yieldControl: async () => {}, ...options })

test('search includes all pages and nested fields with exact JSON paths', async () => {
  const document = { 'invoice.lines': Array.from({ length: 100003 }, (_, index) => ({ id: index, details: { description: index === 100002 ? 'Needle [invoice]' : 'other' } })) }
  const result = await search(document, { query: 'needle [invoice]' })
  assert.equal(result.total, 1)
  assert.deepEqual(result.matches[0].path, ['invoice.lines', 100002, 'details', 'description'])
  assert.equal(valueAtPath(document, result.matches[0].path), 'Needle [invoice]')
})
test('keys and values at the same location count once; arrays indices are not field-name matches', async () => {
  const document = { invoice: 'invoice', rows: ['invoice', 'other'] }
  const result = await search(document, { query: 'invoice' })
  assert.equal(result.total, 2)
  assert.equal(result.matches[0].kind, 'key and value')
  assert.equal((await search(document, { query: 'invoice', scope: 'keys' })).total, 1)
  assert.equal((await search(document, { query: '0', scope: 'keys' })).total, 0)
})
test('case and exact modes, falsy scalars, root scalars and literal regex characters', async () => {
  const document = { a: 'Invoice', b: 'invoice', c: 'invoice item', zero: 0, bool: false, empty: null, special: '.* [x] (test) $' }
  assert.equal((await search(document, { query: 'invoice', scope: 'values', exact: true })).total, 2)
  assert.equal((await search(document, { query: 'invoice', scope: 'values', exact: true, caseSensitive: true })).total, 1)
  assert.equal((await search(document, { query: '.* [x] (test) $' })).total, 1)
  for (const value of [0, false, null]) {
    const result = await search(value, { query: String(value) })
    assert.equal(result.total, 1); assert.deepEqual(result.matches[0].path, [])
  }
})
test('every result page is accessible without retaining all matched paths', async () => {
  const document = Array.from({ length: 100003 }, (_, id) => ({ id }))
  const first = await search(document, { query: 'id', scope: 'keys' })
  assert.equal(first.total, 100003); assert.equal(first.matches.length, 25); assert.equal(first.pages, 4001)
  const last = await search(document, { query: 'id', scope: 'keys', page: 4001, knownTotal: first.total })
  assert.equal(last.matches.length, 3); assert.deepEqual(last.matches[2].path, [100002, 'id'])
  const second = await search(document, { query: 'id', scope: 'keys', page: 2, knownTotal: first.total })
  assert.deepEqual(second.matches[0].path, [25, 'id']); assert.ok(second.scanned < 200)
  const clamped = await search(document, { query: 'id', scope: 'keys', page: 999999, knownTotal: first.total })
  assert.equal(clamped.page, 4001)
})
test('cancel is checked between chunks and stale searches can stop early', async () => {
  let cancelled = false, yields = 0
  const result = await searchPayload(Array.from({ length: 100000 }, (_, id) => ({ id })), { query: 'missing',
    shouldCancel: () => cancelled, yieldControl: async () => { yields++; cancelled = true } })
  assert.equal(result.cancelled, true); assert.equal(yields, 1)
})
test('deep documents are walked iteratively; Unicode offsets and snippets use original text', async () => {
  const document = {}; let node = document
  for (let index = 0; index < 10000; index++) { node.next = {}; node = node.next }
  node.value = 'İ emoji 😀 NEEDLE'
  const result = await search(document, { query: 'needle' })
  assert.equal(result.matches[0].path.length, 10001)
  assert.equal(result.matches[0].offset, 'İ emoji 😀 '.length)
  assert.equal(valueAtPath(document, result.matches[0].path), node.value)
  assert.ok(pathLabel(result.matches[0].path).length < 250)
})
test('selection resolves the nearest mapped object and preserves original array indices', () => {
  const document = { rows: [{ id: 1, detail: { id: 2 } }] }
  assert.deepEqual(selectableOwner(document, ['rows', 0, 'detail', 'id'], [['rows', null], ['rows', null, 'detail']]), ['rows', 0, 'detail'])
  assert.deepEqual(selectableOwner(document, ['rows', 0, 'id'], [['rows', null]]), ['rows', 0])
  assert.deepEqual(selectableOwner(document, ['rows', 0, 'id'], [[]]), [])
  assert.equal(selectableOwner(document, ['rows', 0, 'id'], []), null)
  assert.equal(selectableOwner(document, ['rows'], [['rows']]), null)
  assert.equal(valueAtPath({}, ['toString']), undefined)
})
test('empty queries, no matches and excessive query lengths are handled', async () => {
  assert.equal((await search({ id: 1 }, { query: '   ' })).total, 0)
  const result = await search({ id: 1 }, { query: 'missing' })
  assert.equal(result.total, 0); assert.equal(result.page, 1); assert.deepEqual(result.matches, [])
  await assert.rejects(search({}, { query: 'x'.repeat(201) }), /at most 200/)
})

test('exact matches do not ignore trailing line breaks', async () => {
  const result = await search(['invoice', 'invoice\n', 'invoice\r\n'], { query: 'invoice', exact: true })
  assert.equal(result.total, 1)
})

test('related-field search does not select an unrelated value at the same number', async () => {
 const data=[{id:574,total:1042},{id:1042,total:1510}]
 const result=await search(data,{query:'1042',scope:'values',field:'id'})
 assert.equal(result.total,1);assert.deepEqual(result.matches[0].path,[1,'id'])
 const last=await search(data,{query:'1042',scope:'values',field:'id',page:999,knownTotal:1})
 assert.deepEqual(last.matches[0].path,[1,'id'])
 assert.equal((await search(data,{query:'1042',scope:'values'})).total,2)
})
