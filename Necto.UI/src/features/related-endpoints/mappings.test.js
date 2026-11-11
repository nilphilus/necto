import test from 'node:test'
import assert from 'node:assert/strict'
import { readValues, matchesPath, applyChoice } from './mappings.js'

test('selection uses only the chosen invoice line and preserves legacy mappings', () => {
  const response = [{ lineId: 17 }, { lineId: 18 }]
  const source = { eachItem: true, property: 'lineId' }
  assert.deepEqual(readValues(response, source), [17, 18])
  assert.deepEqual(readValues(response, source, [1]), [18])
  assert.deepEqual(readValues(response, source, []), [17, 18])
  assert.deepEqual(readValues(response, source, [2]), [])
})

test('nested arrays, renamed JSON keys, null objects and absent properties', () => {
  const response = { 'invoice.lines': [{ lines: [{ id: 0 }, null, {}] }, { lines: [{ id: 18 }] }] }
  const source = { property: 'id', objectPath: ['invoice.lines', null, 'lines', null] }
  assert.deepEqual(readValues(response, source), [0, 18])
  assert.deepEqual(readValues(response, source, ['invoice.lines', 1, 'lines', 0]), [18])
  assert.deepEqual(readValues(response, source, ['invoice.lines', 0]), [0])
  assert.equal(matchesPath(source.objectPath, ['invoice.lines', 0, 'lines', 2]), true)
  assert.equal(matchesPath(source.objectPath, ['invoice.lines', '0', 'lines', 2]), false)
})

test('whole typed identifiers and false values remain usable in request bodies', () => {
  const source = { eachItem: true, property: null }
  const value = readValues([{ value: 7 }], source, [0])[0]
  const session = { fields: {}, body: '{}' }
  applyChoice(session, 'body', { name: 'selectedCustomer', value })
  assert.deepEqual(JSON.parse(session.body), { selectedCustomer: { value: 7 } })
  assert.deepEqual(readValues({ enabled: false }, { property: 'enabled' }, []), [false])
})

test('bounded suggestions and late-page selections do not enumerate the response', () => {
  let reads = 0
  const array = new Proxy(new Array(200000), { get(target, key) {
    if (/^\d+$/.test(String(key))) { reads++; return { lineId: Number(key) } }
    return Reflect.get(target, key)
  } })
  const source = { eachItem: true, property: 'lineId' }
  assert.equal(readValues(array, source, undefined, 200).length, 200)
  assert.equal(reads, 200)
  reads = 0
  assert.deepEqual(readValues(array, source, [199999], 200), [199999])
  assert.equal(reads, 1)
})
