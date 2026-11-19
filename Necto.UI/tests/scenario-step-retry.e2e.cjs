const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, review, calls }) => {
  const step = (id, label, method, path, body = '') => ({
    id, label, method, path, apiId: 'local', operationKey: method + ' ' + path,
    dependsOn: [], inputs: [], request: { fields: {}, body },
  })
  const scenario = {
    format: 'necto-scenario-builder', version: 7, id: 'retry-test', name: 'Retry one step',
    concurrency: 1, variables: [],
    connections: [{ from: 'producer', to: 'target' }, { from: 'target', to: 'consumer' }],
    steps: [
      step('producer', 'Read customer', 'GET', '/customer'),
      step('target', 'Write invoice', 'POST', '/invoices', '{"name":"Draft","customerId":0}'),
      step('consumer', 'Read rows', 'GET', '/rows'),
    ],
  }
  scenario.steps[1].inputs = [{
    location: 'body', pointer: '/customerId', source: 'response',
    stepId: 'producer', responsePointer: '/id',
  }]
  await p.evaluate(value => localStorage.setItem('necto:scenario-builder:' + location.origin + '/openapi.json',
    JSON.stringify({ version: 1, blueprints: [value] })), scenario)
  await p.goto(new URL('/builder', p.url()).href)
  await p.getByLabel('Saved builder scenarios', { exact: true }).selectOption({ label: scenario.name })
  const writes = []
  await p.route('**/invoices', route => {
    writes.push(route.request().postDataJSON())
    return writes.length === 1 ? route.fulfill({ status: 503, json: { message: 'Unavailable' } }) : route.continue()
  })
  const dialog = await review()
  await dialog.getByRole('button', { name: 'Run scenario', exact: true }).click()
  const target = p.locator('.map-node[data-step-id="target"]')
  await target.and(p.locator('[data-status="failed"]')).waitFor()
  assert.equal(await p.getByRole('button', { name: 'Retry step Read customer' }).count(), 0)
  await p.getByRole('button', { name: 'Retry step Write invoice' }).click()
  await target.and(p.locator('[data-status="completed"]')).waitFor()
  assert.deepEqual(writes, Array.from({ length: 2 }, () => ({ name: 'Draft', customerId: 42 })))
  assert.deepEqual(calls.map(call => call.path), ['/customer', '/invoices'])
  assert.deepEqual(calls.at(-1).body, { name: 'Draft', customerId: 42 })
  await p.getByRole('button', { name: 'View response for Write invoice' }).click()
  await p.getByText('Attempt history (2)', { exact: true }).waitFor()
})
