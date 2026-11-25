import test from 'node:test'
import assert from 'node:assert/strict'
import { findOperationPath, referenceTarget } from './references.js'

test('reference targets use escaped pointers and already loaded documents', () => {
  const current = { url: 'https://api.example/openapi.json', document: { 'a/b': { '~key': true } } }
  const external = { url: 'https://api.example/schema.json', document: { schema: {} } }
  assert.deepEqual(referenceTarget(current, '#/a~1b/~0key'), { source: current, path: ['a/b', '~key'] })
  assert.deepEqual(referenceTarget(current, 'schema.json#/schema', [external]), { source: external, path: ['schema'] })
  assert.equal(referenceTarget(current, 'schema.json#/schema'), null)
  assert.equal(referenceTarget(current, '#/%ZZ'), null)
})

test('operation lookup follows path item references and stops at cycles', () => {
  const source = { document: { paths: { '/a': { $ref: '#/extra/a' }, '/cycle': { $ref: '#/paths/~1cycle' } },
    extra: { a: { $ref: '#/extra/b' }, b: { get: {} } } } }
  assert.deepEqual(findOperationPath(source, '/a', 'get'), ['extra', 'b', 'get'])
  assert.equal(findOperationPath(source, '/cycle', 'get'), null)
})
