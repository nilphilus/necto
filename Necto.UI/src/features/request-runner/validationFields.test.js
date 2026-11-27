import test from 'node:test'
import assert from 'node:assert/strict'
import { validationFields } from './validationFields.js'

test('CLR-style validation paths fall back to unique JSON key casing', () => {
  const body = '{"lines":[{"quantity":1},{"quantity":0}]}'
  const [field] = validationFields({ 'Lines[1].Quantity': ['Required'] }, body)
  assert.equal(body.slice(field.start, field.end), '"quantity":0')
})

test('exact keys win, ambiguous casing is skipped, and JSON pointers stay exact', () => {
  const body = '{"quantity":1,"QUANTITY":2}'
  const errors = { QUANTITY: ['Exact match'], Quantity: ['Ambiguous'], '/Quantity': ['Pointer'] }
  const fields = validationFields(errors, body)
  assert.deepEqual(fields.map(field => field.key), ['QUANTITY'])
  assert.equal(body.slice(fields[0].start, fields[0].end), '"QUANTITY":2')
})
