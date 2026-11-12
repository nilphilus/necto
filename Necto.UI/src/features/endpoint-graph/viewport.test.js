import test from 'node:test'
import assert from 'node:assert/strict'
import { fitGraphScale } from '../graph-viewport.js'
test('fit-to-view bounds both graph axes and never enlarges small graphs', () => {
  const viewport = { width: 900, height: 500 }, graph = { width: 1200, height: 1500 }
  const scale = fitGraphScale(viewport, graph)
  assert.ok(graph.width * scale < viewport.width)
  assert.ok(graph.height * scale < viewport.height)
  assert.equal(fitGraphScale(viewport, { width: 200, height: 200 }), 1)
  assert.equal(fitGraphScale({ width: 0, height: 0 }, graph), 1)
})
