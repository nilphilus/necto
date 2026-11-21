import test from 'node:test'
import assert from 'node:assert/strict'
import { trimRouteHistory } from './routeHistory.js'

test('route history keeps recent entries within the response budget and counts shared sessions once', () => {
  const large = { result: { text: 'x'.repeat(10), json: {} } }
  const recent = { result: { text: 'kept' } }
  const entries = new Map([
    ['large', { steps: [{ session: large }] }],
    ['before', { steps: [{ session: recent }] }],
    ['after', { steps: [{ session: recent }] }],
  ])
  trimRouteHistory(entries, { maxBytes: 10, maxEntries: 3 })
  assert.deepEqual([...entries.keys()], ['before', 'after'])
  trimRouteHistory(entries, { maxBytes: 10, maxEntries: 1 })
  assert.deepEqual([...entries.keys()], ['after'])
})
