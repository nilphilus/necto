import test from 'node:test'
import assert from 'node:assert/strict'
import { selectionLabel } from './selection.js'

const schemas = {
  Invoice: { type: 'object', properties: { id: { type: 'integer' } } },
  Line: { title: 'Invoice line', type: 'object' },
}
const resolve = schema => schema?.$ref ? schemas[schema.$ref.split('/').at(-1)] : schema
const operation = schema => ({ resolve, responses: { 200: { content: { 'application/json': { schema } } } } })

test('selected array item uses the OpenAPI type and actual identifier', () => {
  const result = { json: [{ id: 42 }], selectedPath: [0], status: 200 }
  assert.equal(selectionLabel(operation({ type: 'array', items: { $ref: '#/components/schemas/Invoice' } }), result), 'Selected Invoice · id: 42')
  assert.deepEqual(result.selectedPath, [0])
})
test('nested and composed schemas retain named entities and scoped identifiers', () => {
  const op = operation({ allOf: [{ properties: { lines: { items: { $ref: '#/components/schemas/Line' } } } }] })
  assert.equal(selectionLabel(op, { json: { lines: [{ lineId: 17, invoiceId: 42 }] }, selectedPath: ['lines', 0] }), 'Selected Invoice line · lineId: 17 · invoiceId: 42')
})
test('missing or ambiguous schemas use an honest object fallback', () => {
  const result = { json: { name: 'Customer A' }, selectedPath: [] }
  assert.equal(selectionLabel(undefined, result), 'Selected object · name: Customer A')
  const op = operation({ oneOf: [{ $ref: '#/components/schemas/Invoice' }, { $ref: '#/components/schemas/Line' }] })
  assert.equal(selectionLabel(op, result), 'Selected object · name: Customer A')
  assert.equal(selectionLabel(undefined, { json: {} }), '')
})
test('actual HTTP status and media type select the right response schema', () => {
  const op = { responses: { 200: { content: { 'application/json': { schema: { title: 'Wrong' } } } }, '2XX': { content: { 'application/problem+json': { schema: { title: 'Created invoice' } } } } } }
  assert.equal(selectionLabel(op, { status: 201, contentType: 'application/problem+json; charset=utf-8', json: { id: 0 }, selectedPath: [] }), 'Selected Created invoice · id: 0')
})
test('summaries are bounded and omit arbitrary properties and nested values', () => {
  assert.equal(selectionLabel(undefined, { json: { id: { nested: 42 }, token: 'secret', name: 'A'.repeat(200) }, selectedPath: [] }), 'Selected object · name: ' + 'A'.repeat(80) + '…')
  const cyclic = {}; cyclic.allOf = [cyclic]
  assert.equal(selectionLabel(operation(cyclic), { json: {}, selectedPath: [] }), 'Selected object')
})
