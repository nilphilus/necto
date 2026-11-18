import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestInputs } from './inputSuggestions.js'

test('offers separate sources for a join without overwriting bindings or creating cycles', () => {
  const target = { id: 'target', operationKey: 'order', inputs: [], request: {} }
  const customer = { id: 'customer', apiId: 'local', operationKey: 'customer', inputs: [], request: {} }
  const downstream = { id: 'downstream', apiId: 'local', operationKey: 'receipt', inputs: [], request: {} }
  const blueprint = { version: 7, steps: [target, customer, downstream], connections: [{ from: 'target', to: 'downstream' }] }
  const operation = { key: 'order' }
  const link = (key, name, source = {}) => ({
    from: { key, method: 'GET' }, to: operation, name, location: 'query', source: { property: 'id', ...source }
  })
  const links = [link('customer', 'customerId'), link('product', 'productId'),
    link('receipt', 'receiptId'), link('list', 'arrayId', { eachItem: true })]
  const result = suggestInputs(blueprint, target, operation, links)
  assert.deepEqual(result.map(group => group.field), ['query · customerId', 'query · productId'])
  assert.equal(result[0].options[0].stepId, 'customer')
  assert.equal(result[1].options[0].stepId, undefined)
  target.inputs.push({ ...result[0].options[0].input, stepId: 'customer' })
  assert.deepEqual(suggestInputs(blueprint, target, operation, links).map(group => group.field), ['query · productId'])
})
