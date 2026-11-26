const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls }) => {
  let withPrerequisites = false
  await p.route('**/openapi.json', async route => {
    const response = await route.fetch()
    const document = await response.json()
    document.paths['/invoices'].post.parameters = [
      { in: 'query', name: 'assetId', required: true, schema: { type: 'integer' } },
      { in: 'query', name: 'reference', schema: { type: 'string' } },
      { in: 'query', name: 'tag', schema: { type: 'string' } },
      { in: 'header', name: 'tenant', required: true, schema: { type: 'string' } },
    ]
    document.paths['/rows'].get.parameters = [
      { in: 'query', name: 'cursor', schema: { type: 'string' } },
      { in: 'query', name: 'customerId', required: true, schema: { type: 'integer' } },
    ]
    document.paths['/invoices'].post.requestBody.content['application/json'].schema.properties.lines.items.properties.assetId = { type: 'integer' }
    if (withPrerequisites) {
      document.paths['/customer'].get.parameters = [
        { in: 'query', name: 'organizationId', required: true, schema: { type: 'integer' } },
      ]
      document.paths['/rows'].get.parameters.push(
        { in: 'query', name: 'accountId', required: true, schema: { type: 'integer' } },
      )
    }
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
    { source: { operationId: 'Rows', eachItem: true, property: 'id' },
      target: { operationId: 'Create', location: 'body', name: 'assetId', objectPath: ['lines', null] } },
    ...(withPrerequisites ? [
      { source: { operationId: 'Customer', property: 'id' },
        target: { operationId: 'Rows', location: 'query', name: 'customerId' } },
      { source: { operationId: 'Customer', property: 'accountId' },
        target: { operationId: 'Rows', location: 'query', name: 'accountId' } },
      { source: { operationId: 'Create', property: 'id' },
        target: { operationId: 'Rows', location: 'query', name: 'customerId' } },
      { source: { operationId: 'Entity0', property: 'id' },
        target: { operationId: 'Customer', location: 'query', name: 'organizationId' } },
    ] : []),
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
  const assetField = wizard.getByRole('checkbox', { name: /assetId query.*required/ })
  const tenantField = wizard.getByRole('checkbox', { name: /tenant header.*required/ })
  assert.equal(await tenantField.isChecked(), true)
  await assetField.uncheck()
  await tenantField.uncheck()
  await wizard.getByText('Select a field under “Fields to fill” to see its sources.', { exact: true }).waitFor()
  assert.equal(await wizard.getByText('Select an optional field or a value you want to replace.').count(), 0)
  await assetField.check()
  await tenantField.check()
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
  const tools = wizard.getByRole('button', { name: 'Tools', exact: true })
  await tools.click()
  await wizard.getByRole('button', { name: 'Configure request', exact: true }).click()
  const settings = p.getByRole('dialog', { name: 'Request tools: GET /customer' })
  await settings.waitFor()
  await settings.press('Escape')
  await settings.waitFor({ state: 'hidden' })
  await tools.and(wizard.locator('button:focus')).waitFor()
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
  const optionalTag = wizard.getByRole('checkbox', { name: /tag query.*optional/ })
  await optionalTag.check()
  const missing = wizard.getByRole('button', { name: '2 missing', exact: true })
  await missing.click()
  await wizard.getByRole('heading', { name: 'Sources for tenant', exact: true }).waitFor()
  await active.getByText('GET /rows', { exact: true }).waitFor()
  const customerQuery = wizard.getByRole('textbox', { name: /customerId query/ })
  assert.ok(await customerQuery.evaluate(el => el === document.activeElement))
  await customerQuery.press('Tab')
  assert.ok(await wizard.getByRole('button', { name: 'Use collected value · 42', exact: true })
    .evaluate(el => el === document.activeElement))
  await optionalTag.uncheck()
  await wizard.getByRole('button', { name: /Invoice rows/ }).click()
  await active.getByText('GET /rows', { exact: true }).waitFor()
  await active.getByRole('status').filter({ hasText: 'Can fill: tenant' }).waitFor()
  assert.equal(await customerQuery.inputValue(), '')
  const reuse = wizard.getByRole('button', { name: 'Use collected value · 42', exact: true })
  await customerId.uncheck()
  await reuse.waitFor({ state: 'hidden' })
  await customerId.check()
  await reuse.waitFor()
  const requestsBeforeReuse = calls.length
  await reuse.click()
  assert.equal(await customerQuery.inputValue(), '42')
  assert.equal(calls.length, requestsBeforeReuse)
  await missingTenant.click()
  assert.ok(await send.evaluate(el => el === document.activeElement))
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
  const requestsBeforeDraftReuse = calls.length
  await wizard.getByRole('button', { name: 'Use request value · 42', exact: true }).click()
  assert.equal(await customerQuery.inputValue(), '42')
  assert.equal(calls.length, requestsBeforeDraftReuse)
  await send.click()
  await wizard.getByRole('button', { name: 'Select object at [3]', exact: true }).click()
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.equal(await field('tenant').inputValue(), '7')
  assert.equal(p.url(), route)
  assert.ok(await trigger.evaluate(el => el === document.activeElement))
  await p.route('**/invoices?*', route => route.fulfill({
    status: 422, json: { errors: {
      'lines[1].quantity': ['Quantity must be positive.'],
      'lines[1].assetId': ['Asset is required.'],
      missing: ['No matching field.'],
    } },
  }))
  const editor = p.locator('.request-pane textarea').first()
  await editor.fill(JSON.stringify({ customerId: 42, lines: [{ quantity: 1, assetId: 12 }, { quantity: 0 }] }, null, 2))
  await trigger.click()
  const firstLine = wizard.getByRole('checkbox', { name: /lines\[0\]\.assetId/ })
  const secondLine = wizard.getByRole('checkbox', { name: /lines\[1\]\.assetId/ })
  assert.equal(await firstLine.isChecked(), false)
  await firstLine.check()
  await secondLine.check()
  await customerQuery.fill('42')
  await send.click()
  await wizard.getByRole('button', { name: 'Select object at [7]', exact: true }).click()
  await wizard.getByRole('status').filter({ hasText: '1 of 2 selected fields collected' }).waitFor()
  await wizard.getByRole('status').filter({ hasText: 'Next array position · lines[1].assetId' }).waitFor()
  const callsBeforeSecondSelection = calls.length
  await wizard.getByRole('button', { name: 'Select object at [3]', exact: true }).click()
  assert.equal(calls.length, callsBeforeSecondSelection)
  await wizard.getByRole('button', { name: 'Apply 2 values', exact: true }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.deepEqual(JSON.parse(await editor.inputValue()).lines, [{ quantity: 1, assetId: 7 }, { quantity: 0, assetId: 3 }])
  await p.getByRole('button', { name: 'Send request', exact: true }).click()
  await p.getByText('Request fields with validation errors (2)', { exact: true }).click()
  await p.getByRole('button', { name: 'Go to field lines[1].quantity', exact: true }).click()
  assert.deepEqual(await editor.evaluate(el => ({
    focused: el === document.activeElement,
    selection: el.value.slice(el.selectionStart, el.selectionEnd),
  })), { focused: true, selection: '"quantity": 0' })
  await editor.fill(JSON.stringify({ lines: [{ quantity: 1 }, { quantity: 2 }] }, null, 2))
  await p.getByRole('button', { name: 'Go to field lines[1].quantity' }).waitFor({ state: 'hidden' })
  await p.getByRole('button', { name: 'Send request', exact: true }).click()
  await p.getByText('Request fields with validation errors (2)', { exact: true }).click()
  await p.getByRole('button', { name: 'Go to parent object for lines[1].assetId', exact: true }).click()
  assert.deepEqual(await editor.evaluate(el => ({
    focused: el === document.activeElement,
    offset: el.selectionStart,
    selection: el.value.slice(el.selectionStart, el.selectionEnd),
  })), { focused: true, offset: (await editor.inputValue()).lastIndexOf('{'), selection: '{' })

  await p.setViewportSize({ width: 1440, height: 1000 })
  withPrerequisites = true
  const requests = []
  await p.route('**/entity-0', async route => {
    requests.push('/entity-0')
    await route.fulfill({ json: { id: 5 } })
  })
  await p.route('**/customer?*', async route => {
    requests.push(route.request().url().split('/customer')[1])
    await route.fulfill({ json: { id: 42, accountId: 84 } })
  })
  await p.reload()
  await p.getByRole('button', { name: /POST Create invoice/ }).click()
  await reference.fill('Keep the original draft')
  await p.getByRole('button', { name: 'Where to get tenant', exact: true }).click()
  await p.getByRole('button', { name: 'Find value here', exact: true }).click()
  const cursor = wizard.getByRole('textbox', { name: /cursor query/ })
  await cursor.fill('Keep the source draft')
  const findInputs = wizard.getByRole('button', { name: 'Find source inputs', exact: true })
  await findInputs.click()
  const prerequisites = p.getByRole('dialog', { name: 'Find source inputs', exact: true }).last()
  await prerequisites.getByRole('checkbox', { name: /customerId query/ }).waitFor()
  assert.equal(await prerequisites.getByRole('button', { name: /POST Create invoice/ }).count(), 0)
  await prerequisites.getByRole('button', { name: 'Back to source request', exact: true }).click()
  assert.equal(await cursor.inputValue(), 'Keep the source draft')
  assert.equal(await customerQuery.inputValue(), '')
  await findInputs.click()
  await prerequisites.getByRole('button', { name: 'Find source inputs', exact: true }).click()
  await prerequisites.getByRole('button', { name: 'Send request', exact: true }).click()
  await prerequisites.getByRole('button', { name: 'Select object at []', exact: true }).click()
  await prerequisites.getByRole('button', { name: 'Apply 1 value', exact: true }).click()
  assert.equal(await prerequisites.getByRole('textbox', { name: /organizationId query/ }).inputValue(), '5')
  assert.deepEqual(requests, ['/entity-0'])
  await prerequisites.getByRole('button', { name: 'Send request', exact: true }).click()
  await prerequisites.getByRole('button', { name: 'Select object at []', exact: true }).click()
  await prerequisites.getByRole('button', { name: 'Apply 2 values', exact: true }).click()
  assert.equal(await customerQuery.inputValue(), '42')
  assert.equal(await wizard.getByRole('textbox', { name: /accountId query/ }).inputValue(), '84')
  assert.equal(await cursor.inputValue(), 'Keep the source draft')
  assert.deepEqual(requests, ['/entity-0', '?organizationId=5'])
  const countBeforeSource = calls.length
  await send.click()
  await wizard.getByRole('button', { name: 'Select object at [7]', exact: true }).click()
  assert.equal(calls.length, countBeforeSource + 1)
  await wizard.getByRole('button', { name: 'Apply 1 value', exact: true }).click()
  await wizard.waitFor({ state: 'hidden' })
  assert.equal(await field('tenant').inputValue(), '7')
  assert.equal(await reference.inputValue(), 'Keep the original draft')

})
