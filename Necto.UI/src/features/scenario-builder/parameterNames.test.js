import assert from 'node:assert/strict'
import test from 'node:test'
import { newBlueprint, newStep } from './model.js'
import { normalizeParameterNames } from './parameterNames.js'
import { executeBlueprint } from './runner.js'
import { prepareBlueprint } from './prepareBlueprint.js'

const parameters = [
  { in: 'query', name: 'Type', required: true, schema: { type: 'string' } },
  { in: 'header', name: 'X-Region', required: true, schema: { type: 'string' } },
]
const operation = { parameters, resolve: value => value, key: 'GET /example', method: 'GET',
  path: '/example', name: 'Example', apiId: 'local', servers: [] }

test('fills a required parameter from an earlier case variant and keeps the OpenAPI spelling', async () => {
  const step = newStep(operation, { fields: { 'query:Type': '', 'query:type': 'integer' }, body: '' })
  step.inputs = [{ location: 'header', name: 'x-region', source: 'expression', expression: 'return "EU";', bindings: [] }]
  const configuration = { apiBaseUrl: 'https://api.test' }
  const plan = prepareBlueprint({ ...newBlueprint(), steps: [step] }, {
    operations: [operation], configuration, createSession: () => ({}), valuesFor: () => new Map(),
  })
  assert.equal(new URL(plan[0].target.url).searchParams.get('Type'), 'integer')
  assert.equal(new URL(plan[0].target.url).searchParams.has('type'), false)
  const result = await executeBlueprint(plan, {
    signal: new AbortController().signal,
    execute: async (_, session) => {
      assert.deepEqual(session.fields, { 'query:Type': 'integer', 'header:X-Region': 'EU' })
      return { ok: true, status: 200 }
    },
  })
  assert.equal(result.status, 'completed')
  assert.equal(step.request.fields['query:type'], 'integer')
})

test('keeps distinct exact parameters and reports values or sources that would collide', () => {
  const fields = { 'query:Type': 'a', 'query:type': 'b' }
  const caseDistinct = { parameters: [...parameters, { in: 'query', name: 'type' }] }
  assert.deepEqual(normalizeParameterNames(caseDistinct, fields, []).fields, fields)
  assert.match(normalizeParameterNames(operation, fields, []).conflict, /Conflicting saved values/)
  const inputs = ['Type', 'type'].map(name => ({ location: 'query', name }))
  assert.match(normalizeParameterNames(operation, {}, inputs).conflict, /Conflicting sources/)
})
