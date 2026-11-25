const fs = require('node:fs/promises')
const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls, builder, add }) => {
  const button = (name) => p.getByRole('button', { name, exact: true })
  const inspector = p.getByRole('dialog', { name: 'OpenAPI Inspector' })
  await p.route('**/configuration', async route => {
    const response = await route.fetch()
    const configuration = await response.json()
    configuration.openApiDocuments = [
      { name: 'v1', url: '/openapi.json' },
      { name: 'v2', url: '/openapi-v2.json' },
    ]
    await route.fulfill({ response, json: configuration })
  })
  await p.route('**/openapi-v2.json', route => route.fulfill({
    json: { openapi: '3.1.0', info: { title: 'Customers v2', version: '2.0' }, paths: {
      '/customer': { get: { summary: 'Customer in v2', responses: { 200: { description: 'OK' } } } },
    } },
  }))
  await p.route('**/openapi.json', async route => {
    const response = await route.fetch()
    const document = await response.json()
    document.paths['/customer'].get['x-reference'] = { $ref: '#/components/schemas/Recursive' }
    const invoice = document.paths['/invoices'].post.requestBody.content['application/json']
    document.components.schemas.InvoiceInput = invoice.schema
    invoice.schema = { $ref: '#/components/schemas/InvoiceInput' }
    document.components.schemas.Recursive = { type: 'object', properties: {
      same: { $ref: '#/components/schemas/Recursive' },
      missing: { $ref: '#/components/schemas/Missing' },
    } }
    await route.fulfill({ response, json: document })
  })
  await p.reload()
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await button('Tools').click()
  await button('OpenAPI Inspector').click()
  await inspector.waitFor()
  await inspector.getByText('Necto QA workflow', { exact: true }).waitFor()
  await inspector.getByRole('button', { name: 'GET /customer', exact: true }).waitFor()
  await inspector.getByRole('button', { name: /summary "Find customer"/ }).click()
  await button('Copy JSON Pointer').click()
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), '/paths/~1customer/get/summary')
  await button('Copy fragment').click()
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), '"Find customer"')
  const search = inspector.getByRole('searchbox', { name: 'Search OpenAPI' })
  await search.fill('Find customer')
  await button('Next OpenAPI match').waitFor()
  await inspector.getByRole('status').filter({ hasText: /matches/ }).waitFor()
  await search.press('Enter')
  await inspector.getByText('/paths/~1customer/get/summary', { exact: true }).waitFor()
  await inspector.getByRole('combobox', { name: 'Inspector search scope' }).selectOption('document')
  await search.fill('Entity79')
  await inspector.getByRole('status').filter({ hasText: /matches/ }).waitFor()
  await search.press('Enter')
  await inspector.getByText('/components/schemas/Entity78/properties/next/$ref', { exact: true }).waitFor()
  await search.press('Enter')
  await inspector.getByText('/components/schemas/Entity79', { exact: true }).waitFor()
  await search.press('Shift+Enter')
  await inspector.getByText('/components/schemas/Entity78/properties/next/$ref', { exact: true }).waitFor()
  await search.fill('')
  await button('Back to operation').click()
  await button('Expand x-reference').click()
  await button('Follow reference').click()
  await inspector.getByText('/components/schemas/Recursive', { exact: true }).waitFor()
  await button('Expand properties').click()
  await button('Expand same').click()
  await button('Follow reference').click()
  await inspector.getByText(/already visited/).waitFor()
  await button('Collapse same').click()
  await button('Expand missing').click()
  await button('Follow reference').click()
  await inspector.getByText(/target is unavailable/).waitFor()
  await button('Back from reference').click()
  await button('Follow reference').waitFor()
  await button('Whole document').click()
  await button('Expand components').click()
  await button('Expand schemas').click()
  await inspector.getByText('1–40 of 82', { exact: true }).waitFor()
  await inspector.getByRole('button', { name: 'Next', exact: true }).click()
  await inspector.getByText('41–80 of 82', { exact: true }).waitFor()
  await p.keyboard.press('Escape')
  await inspector.waitFor({ state: 'hidden' })
  assert.ok(await button('Tools').evaluate(el => el === document.activeElement))
  await button('Tools').click()
  await button('Contract').click()
  await button('Inspect in OpenAPI').click()
  await inspector.getByText('/paths/~1customer/get', { exact: true }).waitFor()
  await p.keyboard.press('Escape')
  await button('Inspect in OpenAPI').waitFor()
  await button('Close request tools').click()

  await builder()
  await add('Create invoice')
  const editor = p.getByRole('dialog', { name: 'Edit step', exact: true })
  await editor.getByLabel('Source for customerId').selectOption('expression')
  await button('Inspect field in OpenAPI').click()
  await inspector.getByText('/components/schemas/InvoiceInput/properties/customerId', { exact: true }).waitFor()
  await p.keyboard.press('Escape')
  assert.ok(await button('Inspect field in OpenAPI').evaluate(el => el === document.activeElement))
  await editor.getByLabel('Expression code').fill('return 42;')
  await editor.getByRole('button', { name: 'Close step editor' }).click()
  await button('API').click()
  await p.getByRole('combobox', { name: 'OpenAPI document' }).selectOption({ label: 'v2' })
  await p.getByRole('heading', { name: 'Customer in v2', exact: true }).waitFor()
  await button('Tools').click()
  await button('OpenAPI Inspector').click()
  await inspector.getByText('Customers v2', { exact: true }).waitFor()
  await inspector.getByText('API 2.0', { exact: true }).waitFor()
  await inspector.getByRole('button', { name: /summary "Customer in v2"/ }).waitFor()
  await p.keyboard.press('Escape')
  await inspector.waitFor({ state: 'hidden' })

  const original = [
    '# Original Swagger contract',
    'swagger: "2.0"',
    'info: { title: Imported legacy API, version: "1.0" }',
    'paths:',
    '  /legacy:',
    '    get:',
    '      summary: Legacy operation',
    '      responses:',
    '        "200": { description: OK }',
    '',
  ].join('\n')
  await button('Settings').click()
  await button('Workspace').click()
  await p.getByLabel('Local API document').setInputFiles({
    name: 'legacy.yaml', mimeType: 'text/yaml', buffer: Buffer.from(original),
  })
  await p.getByRole('status').filter({ hasText: 'API document loaded for this session.' }).waitFor()
  await button('Close settings').click()
  await p.getByRole('heading', { name: 'Legacy operation', exact: true }).waitFor()
  await button('Tools').click()
  await button('OpenAPI Inspector').click()
  await inspector.getByText('Converted from Swagger 2.0').waitFor()
  await inspector.getByText('OpenAPI 3.0.3', { exact: true }).waitFor()
  await button('Original source').click()
  await inspector.locator('pre').getByText(/Original Swagger contract/).waitFor()
  await button('Copy source').click()
  await inspector.getByText('Original source copied.').waitFor()
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), original)
  const [download] = await Promise.all([p.waitForEvent('download'), button('Download source').click()])
  assert.equal(await fs.readFile(await download.path(), 'utf8'), original)
  assert.equal(calls.length, 0)
})
