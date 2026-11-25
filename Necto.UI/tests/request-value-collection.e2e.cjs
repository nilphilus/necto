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
  await send.click()
  await wizard.getByLabel('Use response value for query assetId', { exact: true }).selectOption('0')
  await wizard.getByRole('button', { name: /Invoice rows/ }).click()
  await send.click()
  await wizard.getByLabel('Use response value for header tenant', { exact: true }).selectOption('7')
  await wizard.getByRole('status').filter({ hasText: '2 of 2 selected fields collected' }).waitFor()
  assert.equal(p.url(), route)
  assert.equal(await field('assetId').inputValue(), '')
  assert.equal(await field('tenant').inputValue(), '')
  await wizard.getByRole('button', { name: 'Apply 2 values' }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.equal(await field('assetId').inputValue(), '42')
  assert.equal(await field('tenant').inputValue(), '7')
  assert.equal(await reference.inputValue(), 'Keep this draft')
  assert.deepEqual(calls.map(call => call.path), ['/customer', '/rows'])

  await trigger.click()
  await wizard.getByRole('checkbox', { name: /tenant header/ }).check()
  await send.click()
  await wizard.getByLabel('Use response value for header tenant', { exact: true }).selectOption('3')
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.equal(await field('tenant').inputValue(), '7')
  assert.equal(p.url(), route)
  assert.ok(await trigger.evaluate(el => el === document.activeElement))
})
