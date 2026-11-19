import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAssertions } from '../workbench/assertions.js'
import { readOperations } from '../api-catalog/catalog.js'
import { executeBlueprint, prepareBlueprint } from './runner.js'
import { importArazzoWorkflow, readArazzo } from './arazzoImport.js'

const localUrl = 'https://api.example.test/openapi.json'
const operations = readOperations({
  paths: {
    '/invoices': { post: { operationId: 'createInvoice', requestBody: {
      content: { 'application/json': { schema: { type: 'object' } } },
    } } },
    '/invoices/{id}': { get: { operationId: 'getInvoice', parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
    ] } },
  },
})
const definition = `
arazzo: 1.0.1
info: { title: Invoices, version: "1" }
sourceDescriptions:
  - { name: invoices, url: ./openapi.json, type: openapi }
workflows:
  - workflowId: create-and-read
    summary: Create and read invoice
    inputs:
      type: object
      properties:
        currency: { type: string, default: PLN }
    steps:
      - stepId: create
        operationId: $sourceDescriptions.invoices.createInvoice
        requestBody:
          contentType: application/json
          payload:
            currency: $inputs.currency
            lines: [{ amount: 42 }]
        outputs:
          id: $response.body#/id
        successCriteria:
          - condition: $statusCode == 201
      - stepId: read
        operationPath: '{$sourceDescriptions.invoices.url}#/paths/~1invoices~1{id}/get'
        parameters:
          - { in: path, name: id, value: $steps.create.outputs.id }
        successCriteria:
          - condition: '$response.body#/currency == "PLN"'
`

test('imports YAML, maps inputs and output bindings, and builds the actual sequential scenario', async () => {
  const parsed = readArazzo(definition)
  const scenario = importArazzoWorkflow(parsed, 'create-and-read', operations, localUrl)
  assert.equal(scenario.name, 'Create and read invoice')
  assert.deepEqual(scenario.connections, [{ from: 'create', to: 'read' }])
  assert.deepEqual(scenario.steps.map(step => step.request.assertions), [
    [{ kind: 'status', expected: '201' }], [{ kind: 'equals', path: '/currency', expected: '"PLN"', comparison: 'arazzo-simple' }],
  ])
  const plan = prepareBlueprint(scenario, {
    operations, configuration: { apiBaseUrl: 'https://api.example.test' },
    createSession: () => ({}), valuesFor: () => new Map(),
  })
  const sent = []
  const result = await executeBlueprint(plan, {
    signal: new AbortController().signal,
    execute: async (operation, session) => {
      sent.push(operation.method === 'POST' ? JSON.parse(session.body) : session.fields['path:id'])
      const response = { ok: true, status: operation.method === 'POST' ? 201 : 200, json: { id: 17, currency: 'pln' } }
      return { ...response, assertions: evaluateAssertions(session.assertions, response) }
    },
  })
  assert.equal(result.status, 'completed')
  assert.deepEqual(sent, [{ currency: 'PLN', lines: [{ amount: 42 }] }, '17'])
})

test('reports unsupported actions and unresolved operations without producing a scenario', () => {
  const document = readArazzo(definition)
  const [create] = document.workflows[0].steps
  create.onFailure = [{ name: 'retry', type: 'retry', retryLimit: 3 }]
  assert.throws(() => importArazzoWorkflow(document, 'create-and-read', operations, localUrl),
    /Arazzo step 1 \(create\): Conditional actions, retries/)
  delete create.onFailure
  create.operationId = 'unknown'
  assert.throws(() => importArazzoWorkflow(document, 'create-and-read', operations, localUrl),
    /Arazzo step 1 \(create\): The operation is missing/)
})
