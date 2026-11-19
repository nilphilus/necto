const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls, review, shot }) => {
  const origin = new URL(p.url()).origin
  await p.route('**/configuration', async (route) => {
    const response = await route.fetch()
    const configuration = await response.json()
    configuration.openApiUrl = origin + '/workflow-openapi.json'
    await route.fulfill({ response, json: configuration })
  })
  await p.route('**/workflow-openapi.json', async (route) => {
    const response = await p.request.get(origin + '/openapi.json')
    const document = await response.json()
    const lines = document.paths['/invoices'].post.requestBody.content['application/json'].schema.properties.lines
    lines.type = ['string', 'array']
    lines.items.properties = { Quantity: { type: 'integer' } }
    await route.fulfill({ response, json: document })
  })
  await p.evaluate(() => localStorage.setItem(
    'necto:environments:' + location.origin + '/workflow-openapi.json',
    JSON.stringify({ version: 2, active: ['Limits'], presets: [[
      'Limits', [['min', { value: '0' }], ['name', { value: 'Preset name' }]],
    ]] })
  ))
  await p.reload()
  await p.getByRole('button', { name: 'Scenarios', exact: true }).click()
  const scenario = {
    format: 'necto-scenario-builder', version: 7, id: 'range-example', name: 'Calculated limit',
    concurrency: 1, variables: [], connections: [],
    steps: [{
      id: 'target', label: 'Send payload', apiId: 'local', operationKey: 'POST /invoices',
      method: 'POST', path: '/invoices', dependsOn: [],
      request: { fields: {}, body: '{"customerId":7,"name":"Draft","lines":[{"quantity":1}]}' },
      inputs: [{
        location: 'body', pointer: '/limits/min', source: 'expression',
        expression: 'return -1;', bindings: [],
      }, {
        location: 'body', pointer: '/lines/0/quantity', source: 'expression',
        expression: 'return 2;', bindings: [],
      }],
    }],
  }
  await p.locator('.library-actions input[type=file]').setInputFiles({
    name: 'calculated-limit.necto.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'necto-shared-scenario', version: 1, kind: 'builder', scenario })),
  })
  await p.getByRole('button', { name: 'Open Builder scenario Calculated limit' }).click()
  await p.locator('.map-node').filter({ hasText: 'Send payload' }).click()
  const body = p.getByRole('region', { name: 'Request body schema' })
  const min = body.locator('[data-body-path="/limits/min"]')
  const fieldPanel = body.getByRole('region', { name: 'Configure body field' })
  await min.getByRole('button', { name: 'Edit source for min: Expression' }).click()
  assert.equal(await fieldPanel.getByLabel('Expression code').inputValue(), 'return -1;')
  await fieldPanel.getByText('Preview result').click()
  await fieldPanel.getByRole('button', { name: 'Evaluate expression' }).click()
  await fieldPanel.getByText('Result · integer').waitFor()
  assert.equal(calls.length, 0)
  await fieldPanel.getByRole('button', { name: 'Back to body' }).click()
  const quantity = body.locator('[data-body-path="/lines/0/Quantity"]')
  await quantity.getByRole('button', { name: 'Edit source for Quantity: Expression' }).waitFor()
  await body.getByRole('button', { name: 'Configured fields (2)' }).click()
  await body.locator('li').filter({ hasText: '/lines/0/Quantity' }).getByRole('button', { name: 'Expression' }).click()
  assert.equal(await fieldPanel.getByLabel('Expression code').inputValue(), 'return 2;')
  await p.setViewportSize({ width: 390, height: 844 })
  assert.equal(await body.locator('.body-tree').isVisible(), false)
  await fieldPanel.getByRole('button', { name: 'Back to body' }).click()
  assert.equal(await body.locator('.body-tree').isVisible(), true)
  await p.setViewportSize({ width: 1440, height: 900 })
  await body.getByRole('button', { name: 'Configured fields (2)' }).click()
  await body.getByRole('button', { name: 'Raw JSON', exact: true }).click()
  assert.deepEqual(JSON.parse(await body.getByLabel('Raw request body').inputValue()), { customerId: 7, name: 'Draft', lines: [{ Quantity: 1 }] })
  await body.getByRole('button', { name: 'JSON builder', exact: true }).click()
  await shot('expression-target')

  const protectedReview = await review()
  await protectedReview.getByText('/lines/0/Quantity · Expression evaluated before send').waitFor()
  await protectedReview.getByRole('button', { name: 'Run scenario', exact: true }).click()
  await p.locator('.builder-run-status').filter({ hasText: '1 / 1 completed' }).waitFor()
  assert.deepEqual(calls[0].body, { customerId: 7, name: 'Preset name', lines: [{ Quantity: 2 }], limits: { min: -1 } })

  await p.locator('.map-node').filter({hasText:'Send payload'}).click()
  const stepEditor = p.getByRole('dialog', {name:'Edit step', exact:true})
  await stepEditor.getByText('Request settings', {exact:true}).click()
  await stepEditor.getByRole('checkbox', {name:'Do not apply presets to this step'}).check()
  const overrideReview = await review()
  await overrideReview.getByRole('button', { name: 'Run scenario', exact: true }).click()
  await p.locator('.builder-run-status').filter({ hasText: '1 / 1 completed' }).waitFor()
  assert.deepEqual(calls[1].body, { customerId: 7, name: 'Draft', lines: [{ Quantity: 2 }], limits: { min: -1 } })
})
