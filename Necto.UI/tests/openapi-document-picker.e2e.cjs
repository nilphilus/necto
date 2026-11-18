const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert }) => {
  await p.route('**/configuration', async (route) => {
    const response = await route.fetch()
    const configuration = await response.json()
    configuration.openApiDocuments = [
      { name: 'v1', url: '/openapi.json' },
      { name: 'v2', url: '/openapi/v2.json' },
      { name: 'Restricted', url: '/openapi/restricted.json' },
    ]
    await route.fulfill({ response, json: configuration })
  })
  await p.route('**/openapi/v2.json', (route) => route.fulfill({
    json: {
      openapi: '3.1.0', info: { title: 'Version two', version: '2' },
      paths: { '/v2-only': { get: { summary: 'Only in v2', responses: { 200: { description: 'OK' } } } } },
    },
  }))
  await p.route('**/openapi/restricted.json', (route) => route.fulfill({ status: 403, json: {} }))
  await p.evaluate(() => {
    const url = location.origin + '/openapi.json'
    const definition = {
      operationKey: 'GET /customer', apiId: 'local', method: 'GET', path: '/customer',
    }
    localStorage.setItem('necto:scenarios:' + url, JSON.stringify({
      version: 1, scenarios: [{
        version: 1, id: 'chain', name: 'Saved quick chain', steps: [{
          ...definition, name: 'Customer', fields: {}, body: '', bindings: [],
        }],
      }],
    }))
    localStorage.setItem('necto:scenario-builder:' + url, JSON.stringify({
      version: 1, blueprints: [{
        format: 'necto-scenario-builder', version: 7, id: 'builder', name: 'Saved Builder scenario',
        concurrency: 4, variables: [], connections: [], steps: [{
          ...definition, id: 'first', label: 'Customer', inputs: [], dependsOn: [], request: { fields: {}, body: '' },
        }],
      }],
    }))
  })

  await p.reload()
  const picker = p.getByRole('combobox', { name: 'OpenAPI document' })
  assert.match(await picker.inputValue(), /\/openapi\.json$/)
  await picker.selectOption({ label: 'Restricted' })
  await p.getByRole('alert').filter({ hasText: 'Could not switch OpenAPI document. HTTP 403' }).waitFor()
  assert.match(await picker.inputValue(), /\/openapi\.json$/)

  const scenarios = p.getByRole('button', { name: 'Scenarios', exact: true })
  await scenarios.click()
  await p.getByRole('heading', { name: 'Saved quick chain' }).waitFor()
  await p.getByRole('heading', { name: 'Saved Builder scenario' }).waitFor()
  const api = p.getByRole('button', { name: 'API', exact: true })
  await api.click()
  await picker.selectOption({ label: 'v2' })
  await p.getByRole('heading', { name: 'Version two', exact: true }).waitFor()
  await p.reload()
  await p.getByRole('heading', { name: 'Version two', exact: true }).waitFor()
  await scenarios.click()
  await p.getByText(/No scenarios saved for this OpenAPI workspace/).waitFor()
  await api.click()
  await picker.selectOption({ label: 'v1' })
  await p.getByRole('heading', { name: 'Necto QA workflow', exact: true }).waitFor()
  await scenarios.click()
  await p.getByRole('heading', { name: 'Saved quick chain' }).waitFor()
  await p.getByRole('heading', { name: 'Saved Builder scenario' }).waitFor()
})
