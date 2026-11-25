const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls }) => {
  await p.route('**/openapi.json', async route => {
    const response = await route.fetch()
    const document = await response.json()
    document.paths['/invoices'].post.parameters = [
      { in: 'query', name: 'assetId', required: true, schema: { type: 'integer' } },
      { in: 'header', name: 'tenant', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'reference', schema: { type: 'string' } },
    ]
    await route.fulfill({ response, json: document })
  })
  await p.route('**/mappings', route => route.fulfill({ json: [
    { source: { operationId: 'Customer', property: 'id' },
      target: { operationId: 'Create', location: 'query', name: 'assetId' } },
    { source: { operationId: 'Customer', property: 'id' },
      target: { operationId: 'Create', location: 'body', name: 'customerId' } },
    ...Array.from({ length: 12 }, (_, index) => ({
      source: { operationId: 'Entity' + index, property: 'id' },
      target: { operationId: 'Create', location: 'query', name: 'assetId' },
    })),
    { source: { operationId: 'Rows', eachItem: true, property: 'id' },
      target: { operationId: 'Create', location: 'header', name: 'tenant' } },
  ] }))
  await p.reload()
  await p.getByRole('button', { name: /POST Create invoice/ }).click()
  const reference = p.getByRole('textbox', { name: /reference query/ })
  await reference.fill('Keep this draft')
  const route = p.url()
  const field = name => p.locator('.field').filter({
    has: p.getByRole('button', { name: 'Where to get ' + name, exact: true }),
  }).locator('input')
  const trigger = p.getByRole('button', { name: 'Find request values', exact: true })
  await trigger.click()
  const wizard = p.getByRole('dialog', { name: 'Find request values' })
  const send = wizard.getByRole('button', { name: 'Send request', exact: true })
  assert.equal(calls.length, 0)
  const sources = wizard.getByRole('region', { name: 'Suggested source endpoints' })
  assert.equal(await sources.getByRole('button', { name: /Entity endpoint/ }).count(), 0)
  await sources.getByRole('button', { name: /More sources/ }).click()
  assert.equal(await sources.getByRole('button', { name: /Entity endpoint/ }).count(), 12)
  await wizard.getByRole('button', { name: 'Sources for query assetId' }).click()
  assert.equal(await sources.getByRole('button', { name: /Invoice rows/ }).count(), 0)
  await sources.getByRole('button', { name: 'Show sources for all fields' }).click()
  await sources.getByRole('button', { name: /Invoice rows.*Can fill: tenant/ }).waitFor()
  await wizard.getByRole('checkbox', { name: /customerId body/ }).check()
  await send.click()
  await wizard.getByRole('button', { name: 'Select object at []', exact: true }).click()
  await wizard.getByRole('button', { name: /Invoice rows/ }).click()
  await send.click()
  await wizard.getByRole('button', { name: 'Select object at [7]', exact: true }).click()
  await wizard.getByRole('status').filter({ hasText: '3 of 3 selected fields collected' }).waitFor()
  await wizard.getByText('Collected · 7 · Invoice rows', { exact: true }).waitFor()
  await wizard.getByRole('button', { name: 'Change header tenant' }).click()
  await wizard.getByText('Collected · 7 · Invoice rows', { exact: true }).waitFor()
  await wizard.getByRole('button', { name: 'Select object at [3]', exact: true }).click()
  await wizard.getByText('Collected · 3 · Invoice rows', { exact: true }).waitFor()
  await wizard.getByRole('button', { name: 'Remove header tenant' }).click()
  await wizard.getByRole('status').filter({ hasText: '2 of 3 selected fields collected' }).waitFor()
  await wizard.getByRole('button', { name: 'Select object at [7]', exact: true }).click()
  await wizard.getByText('Collected · 7 · Invoice rows', { exact: true }).waitFor()
  assert.equal(p.url(), route)
  assert.equal(await field('assetId').inputValue(), '')
  assert.equal(await field('tenant').inputValue(), '')
  await wizard.getByRole('button', { name: 'Apply 3 values' }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.equal(await field('assetId').inputValue(), '42')
  assert.equal(await field('tenant').inputValue(), '7')
  assert.equal(await reference.inputValue(), 'Keep this draft')
  assert.equal(JSON.parse(await p.locator('.request-pane textarea').first().inputValue()).customerId, 42)
  assert.deepEqual(calls.map(call => call.path), ['/customer', '/rows'])

  await trigger.click()
  await wizard.getByRole('checkbox', { name: /tenant header/ }).check()
  await send.click()
  await wizard.getByRole('button', { name: 'Select object at [3]', exact: true }).click()
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.equal(await field('tenant').inputValue(), '7')
  assert.equal(p.url(), route)
  assert.ok(await trigger.evaluate(el => el === document.activeElement))
})
