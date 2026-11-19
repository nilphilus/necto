import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareBlueprint, executeBlueprint } from './runner.js'
import { newBlueprint, newStep } from './model.js'
import { normalizeBodyFieldNames } from './bodyFieldNames.js'

const expression = pointer => ({ location: 'body', source: 'expression', expression: 'return 7;', bindings: [], pointer })
const operation = properties => ({
  resolve: value => value,
  requestBody: { content: { 'application/json': { schema: { type: 'object', properties } } } },
})
const integer = { type: 'integer' }

test('saved JSON and dynamic targets follow the exact request schema spelling', () => {
  const op = operation({ Lines: { type: 'array', items: { type: 'object', properties: { Type: integer } } } })
  const request = { body: '{"lines":[{"type":1,"other":3}]}' }
  const inputs = [expression('/lines/0/type')]
  const result = normalizeBodyFieldNames(op, request, inputs)

  assert.deepEqual(JSON.parse(result.body), { Lines: [{ Type: 1, other: 3 }] })
  assert.deepEqual(result.inputs, [expression('/Lines/0/Type')])
  assert.equal(inputs[0].pointer, '/lines/0/type')
  assert.deepEqual(normalizeBodyFieldNames(op, { body: result.body }, result.inputs), result)
})

test('case-sensitive fields stay distinct when the schema declares both', () => {
  const request = { body: '{"Type":1,"type":2}' }
  const inputs = [expression('/Type'), expression('/type')]
  assert.deepEqual(normalizeBodyFieldNames(operation({ Type: integer, type: integer }), request, inputs), {
    body: request.body, inputs,
  })
})

test('collisions leave drafts intact and report conflicting values or sources', () => {
  const op = operation({ Type: integer })
  const request = { body: '{"Type":1,"type":2}' }
  const result = normalizeBodyFieldNames(op, request, [expression('/type')])
  assert.match(result.conflict, /Keep one spelling/)
  assert.equal(result.body, request.body)
  assert.match(normalizeBodyFieldNames(op, { body: '{}' }, [expression('/Type'), expression('/type')]).conflict,
    /Conflicting sources/)
})

test('running an existing scenario without opening the editor uses the contract spelling', async () => {
  const op = {
    ...operation({ Type: integer }), key: 'POST /test', method: 'POST', path: '/test',
    name: 'Test', apiId: 'local', parameters: [], servers: [],
  }
  const step = newStep(op, { body: '{"type":1}', fields: {} })
  step.inputs = [expression('/type')]
  const blueprint = { ...newBlueprint(), steps: [step] }
  const plan = prepareBlueprint(blueprint, {
    operations: [op], configuration: { apiBaseUrl: 'https://test.invalid' },
    createSession: () => ({}), valuesFor: () => new Map(), protectBodyExpressions: true,
  })
  let sent
  const result = await executeBlueprint(plan, {
    signal: new AbortController().signal,
    execute: async (_, session) => {
      sent = JSON.parse(session.body)
      return { ok: true, status: 200 }
    },
  })
  assert.equal(result.status, 'completed')
  assert.deepEqual(sent, { Type: 7 })
  assert.deepEqual(step.inputs, [expression('/type')])
})
