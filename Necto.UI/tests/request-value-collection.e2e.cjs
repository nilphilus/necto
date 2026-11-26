const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls }) => {
  await p.route('**/openapi.json', async route => {
    const response = await route.fetch()
    const document = await response.json()
    document.paths['/invoices'].post.parameters = [
      { in: 'query', name: 'assetId', required: true, schema: { type: 'integer' } },
      { in: 'header', name: 'tenant', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'reference', schema: { type: 'string' } },
      { in: 'query', name: 'tag', schema: { type: 'string' } },
    ]
    document.paths['/rows'].get.parameters = [
      { in: 'query', name: 'cursor', schema: { type: 'string' } },
      { in: 'query', name: 'customerId', required: true, schema: { type: 'integer' } },
    ]
    await route.fulfill({ response, json: document })
  })
  await p.route('**/mappings', route => route.fulfill({ json: [
    { source: { operationId: 'Customer', property: 'id' },
      target: { operationId: 'Create', location: 'query', name: 'assetId' } },
    { source: { operationId: 'Customer', property: 'legacyId' },
      target: { operationId: 'Create', location: 'query', name: 'assetId' } },
    { source: { operationId: 'Customer', property: 'id' },
      target: { operationId: 'Create', location: 'body', name: 'customerId' } },
    ...Array.from({ length: 12 }, (_, index) => ({
      source: { operationId: 'Entity' + index, property: 'id' },
      target: { operationId: 'Create', location: 'query', name: 'assetId' },
    })),
    { source: { operationId: 'Rows', eachItem: true, property: 'id' },
      target: { operationId: 'Create', location: 'header', name: 'tenant' } },
    { source: { operationId: 'Rows', eachItem: true, property: 'name' },
      target: { operationId: 'Create', location: 'query', name: 'tag' } },
  ] }))
  await p.route('**/customer', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), legacyId: 'cust-A9' } })
  })
  await p.reload()
  await p.getByRole('button', { name: /POST Create invoice/ }).click()
  const reference = p.getByRole('textbox', { name: /reference query/ })
  await reference.fill('Keep this draft')
  const route = p.url()
  const field = name => p.locator('.field').filter({
    has: p.getByRole('button', { name: 'Where to get ' + name, exact: true }),
  }).locator('input')
  const trigger = p.getByRole('button', { name: 'Find request values', exact: true })
  const wizard = p.getByRole('dialog', { name: 'Find request values' })
  const sourceHelp = p.getByRole('button', { name: 'Where to get tag', exact: true })
  await sourceHelp.click()
  await p.getByRole('button', { name: 'Find value here', exact: true }).click()
  await wizard.waitFor()
  assert.equal(await wizard.getByRole('checkbox', { name: /assetId query/ }).isChecked(), false)
  assert.equal(await wizard.getByRole('checkbox', { name: /tenant header/ }).isChecked(), false)
  assert.equal(await wizard.getByRole('checkbox', { name: /tag query.*optional/ }).isChecked(), true)
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.ok(await sourceHelp.evaluate(el => el === document.activeElement))
  await trigger.click()
  assert.equal(await wizard.getByRole('checkbox', { name: /tag query.*optional/ }).isChecked(), false)
  assert.equal(await wizard.getByRole('checkbox', { name: /tenant header.*required/ }).isChecked(), true)
  const send = wizard.getByRole('button', { name: 'Send request', exact: true })
  assert.equal(calls.length, 0)
  const sources = wizard.getByRole('region', { name: 'Suggested source endpoints' })
  assert.equal(await sources.getByRole('button', { name: /Entity endpoint/ }).count(), 0)
  await sources.getByRole('button', { name: /More sources/ }).click()
  assert.equal(await sources.getByRole('button', { name: /Entity endpoint/ }).count(), 12)
  await sources.getByRole('searchbox', { name: 'Filter source endpoints' }).fill('GET /entity-10')
  assert.equal(await sources.getByRole('button', { name: /Entity endpoint/ }).count(), 1)
  await sources.getByRole('button', { name: /Entity endpoint 10/ }).waitFor()
  await wizard.getByRole('button', { name: 'Sources for query assetId' }).click()
  assert.equal(await sources.getByRole('button', { name: /Invoice rows/ }).count(), 0)
  await sources.getByRole('button', { name: 'Show sources for all fields' }).click()
  await sources.getByRole('button', { name: /Invoice rows.*Can fill: tenant/ }).waitFor()
  await wizard.getByRole('checkbox', { name: /customerId body/ }).check()
  const active = wizard.locator('.active-source')
  await active.getByText('GET /customer', { exact: true }).waitFor()
  await active.getByRole('status').filter({ hasText: 'Can fill: assetId, customerId' }).waitFor()
  await send.click()
  await active.getByRole('status').filter({ hasText: 'Values found: assetId, customerId' }).waitFor()
  await wizard.getByText(/cust-A9.*must be a finite integer/).waitFor()
  await wizard.getByRole('button', { name: 'Select object at []', exact: true }).press('Enter')
  await wizard.getByText('Collected: assetId, customerId', { exact: true }).first().waitFor()
  const missingTenant = wizard.getByRole('button', { name: 'Missing: tenant', exact: true })
  assert.ok(await missingTenant.evaluate(el => el === document.activeElement))
  const customerId = wizard.getByRole('checkbox', { name: /customerId body/ })
  await customerId.uncheck()
  await wizard.getByText('Excluded · 42 · Find customer', { exact: true }).waitFor()
  await customerId.check()
  assert.equal(await wizard.getByText('Excluded · 42 · Find customer', { exact: true }).count(), 0)
  await missingTenant.click()
  await active.getByText('GET /rows', { exact: true }).waitFor()
  assert.ok(await send.evaluate(el => el === document.activeElement))
  await wizard.getByRole('button', { name: /Invoice rows/ }).click()
  await active.getByText('GET /rows', { exact: true }).waitFor()
  await active.getByRole('status').filter({ hasText: 'Can fill: tenant' }).waitFor()
  const customerQuery = wizard.getByRole('textbox', { name: /customerId query/ })
  assert.equal(await customerQuery.inputValue(), '')
  const requestsBeforeReuse = calls.length
  await wizard.getByRole('button', { name: 'Use collected value · 42', exact: true }).click()
  assert.equal(await customerQuery.inputValue(), '42')
  assert.equal(calls.length, requestsBeforeReuse)
  await send.click()
  await active.getByRole('status').filter({ hasText: 'Values found: tenant' }).waitFor()
  await wizard.getByRole('button', { name: 'Edit request', exact: true }).click()
  await wizard.getByRole('textbox', { name: /cursor query/ }).fill('fresh-page')
  await active.getByRole('status').filter({ hasText: 'Send the updated request to collect values.' }).waitFor()
  assert.equal(await wizard.getByRole('button', { name: 'Select object at [7]', exact: true }).count(), 0)
  await send.click()
  await active.getByRole('status').filter({ hasText: 'Values found: tenant' }).waitFor()
  await wizard.getByRole('button', { name: 'Select object at [7]', exact: true }).press('Enter')
  assert.ok(await wizard.getByRole('button', { name: 'Apply 3 values' }).evaluate(el => el === document.activeElement))
  await wizard.getByRole('status').filter({ hasText: '3 of 3 selected fields collected' }).waitFor()
  await wizard.getByText('Collected · 7 · Invoice rows', { exact: true }).waitFor()
  assert.equal(await wizard.getByRole('button', { name: 'Select object at [4]', exact: true }).count(), 0)
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
  assert.deepEqual(calls.map(call => call.path), ['/customer', '/rows', '/rows'])

  await p.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  assert.equal(await wizard.evaluate(el => el.scrollWidth > el.clientWidth), false)
  assert.equal(await wizard.locator('.collect-workspace').evaluate(el => el.scrollWidth > el.clientWidth), false)
  await wizard.getByText('All mapped required fields are filled', { exact: true }).waitFor()
  assert.equal(await wizard.getByText('0 of 0 selected fields collected').count(), 0)
  assert.equal(await wizard.getByRole('button', { name: /^Apply/ }).count(), 0)
  const optional = wizard.getByRole('checkbox', { name: /tag query.*optional/ })
  await optional.check()
  await wizard.getByRole('status').filter({ hasText: '0 of 1 selected fields collected' }).waitFor()
  await wizard.getByRole('button', { name: /Invoice rows/ }).waitFor()
  await optional.uncheck()
  await wizard.getByRole('checkbox', { name: /tenant header/ }).check()
  await customerQuery.fill('42')
  await send.click()
  await wizard.getByRole('button', { name: 'Select object at [3]', exact: true }).click()
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.equal(await field('tenant').inputValue(), '7')
  assert.equal(p.url(), route)
  assert.ok(await trigger.evaluate(el => el === document.activeElement))
})
