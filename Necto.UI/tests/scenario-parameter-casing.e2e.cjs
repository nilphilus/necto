const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, builder, execute }) => {
  await p.route('**/openapi.json', async route => {
    const response = await route.fetch()
    const spec = await response.json()
    spec.paths['/customer'].get.parameters = [
      { in: 'query', name: 'Type', required: true, schema: { type: 'string' } },
    ]
    await route.fulfill({ response, json: spec })
  })
  await p.reload()
  await builder()
  const scenario = {
    format: 'necto-scenario-builder', version: 7, id: 'parameter-casing', name: 'Parameter casing',
    concurrency: 1, variables: [], connections: [],
    steps: [{
      id: 'customer', label: 'Find customer', apiId: 'local', operationKey: 'GET /customer',
      method: 'GET', path: '/customer', dependsOn: [],
      request: { fields: { 'query:type': 'integer' }, body: '' }, inputs: [],
    }],
  }
  await p.evaluate(value => localStorage.setItem('necto:scenario-builder:' + location.origin + '/openapi.json',
    JSON.stringify({ version: 1, blueprints: [value] })), scenario)
  await p.reload()
  await p.getByLabel('Saved builder scenarios', { exact: true }).selectOption({ label: scenario.name })
  await p.locator('.map-node').filter({ hasText: 'Find customer' }).click()
  const field = p.locator('[data-parameter="query:Type"] input')
  assert.equal(await field.inputValue(), 'integer')
  const dispatched = p.waitForRequest(request => new URL(request.url()).pathname === '/customer')
  await execute()
  assert.equal(new URL((await dispatched).url()).search, '?Type=integer')
})
