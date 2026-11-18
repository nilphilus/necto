import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRequest } from '../request-runner/request.js'
import { prepareScenario } from './scenario.js'
import { scenarioTargets } from './scenarioTargets.js'

test('preview and preflight agree on external server and preset-covered response inputs', () => {
  const parameter = { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
  const producer = {
    key: 'GET /list',
    apiId: 'local',
    method: 'GET',
    path: '/list',
    tags: [],
    parameters: [],
  }
  const target = {
    key: 'partner:GET /detail/{id}',
    apiId: 'partner',
    apiName: 'Partner',
    method: 'GET',
    path: '/detail/{id}',
    tags: [],
    parameters: [parameter],
    configuration: { openApiUrl: 'https://partner.test/openapi.json' },
    resolve: (schema) => schema,
  }
  const step = (op, bindings = []) => ({
    operationKey: op.key,
    apiId: op.apiId,
    method: op.method,
    path: op.path,
    name: op.path,
    body: '',
    fields: {},
    bindings,
  })
  const binding = { sourceStep: 0, path: ['id'], location: 'path', name: 'id' }
  const scenario = {
    version: 1,
    id: 's',
    name: 's',
    steps: [step(producer), step(target, [binding])],
  }
  const context = {
    operations: [producer, target],
    configuration: {
      openApiUrl: 'https://local.test/openapi.json',
      serverProfiles: { partner: { url: 'https://sandbox.partner.test/v2' } },
    },
    links: [
      {
        from: producer,
        to: target,
        location: 'path',
        name: 'id',
        source: { property: 'id', eachItem: false },
      },
    ],
    createSession: () => ({}),
    valuesFor: (op) => new Map(op === target ? [['path:id', '17']] : []),
  }
  const preview = scenarioTargets(scenario, context)[1]
  const plan = prepareScenario(scenario, context)
  const request = buildRequest(target, context.configuration, plan[1].session, plan[1].values)
  assert.equal(preview.target, 'sandbox.partner.test/v2')
  assert.equal(request.url.href, 'https://sandbox.partner.test/v2/detail/17')
  assert.equal(preview.responseInputs, plan[1].bindings.length)
  assert.equal(preview.responseInputs, 0)
  const withoutPreset = { ...context, valuesFor: () => new Map() }
  assert.equal(scenarioTargets(scenario, withoutPreset)[1].responseInputs, 1)
  assert.equal(prepareScenario(scenario, withoutPreset)[1].bindings.length, 1)
})
