import test from 'node:test'
import assert from 'node:assert/strict'
import { availablePreviewHeight } from './usePreviewHeight.js'

test('a tall workspace exposes more than the old 512px preview limit', () => {
  assert.equal(availablePreviewHeight({ top: 220, panelTop: 60, panelBottom: 1060, viewportHeight: 1080 }), 828)
})
test('preview respects the bottom of its own workspace', () => {
  assert.equal(availablePreviewHeight({ top: 240, panelBottom: 740, viewportHeight: 1080 }), 488)
})
test('content below the fold is sized for its panel rather than a negative remainder', () => {
  assert.equal(availablePreviewHeight({ top: 1200, panelTop: 100, panelBottom: 750, viewportHeight: 768, toolbarHeight: 80 }), 558)
})
test('phone and short keyboard viewports retain an accessible minimum', () => {
  assert.equal(availablePreviewHeight({ top: 297, viewportHeight: 844 }), 535)
  assert.equal(availablePreviewHeight({ top: 280, viewportHeight: 300 }), 80)
})
