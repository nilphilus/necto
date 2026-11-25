const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http = require('node:http'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../dist'),
  output = process.env.NECTO_OPENAPI_SCREENSHOTS
let server, browser, base
const errors = [],
  calls = []
const ok = {
  description: 'Successful response',
  content: {
    'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } },
  },
}
const parameter = {
  in: 'query',
  name: 'reference',
  description: 'Use the **invoice reference** from your system.',
  examples: { known: { summary: 'Known reference', value: 'INV-42' } },
}
const operation = (operationId, summary, extra = {}) => ({
  operationId,
  summary,
  tags: ['Billing'],
  responses: { 200: ok },
  ...extra,
})
const document = {
  openapi: '3.1.0',
  info: {
    title: 'Billing API',
    version: '1',
    summary: 'Understand billing workflows',
    description:
      '## Start with an invoice\n\n- Find the customer\n- Follow its invoices\n\n`invoiceId` connects the steps. <img src="/tracking" onerror="window.injected=true"><script>window.injected=true</script>',
  },
  tags: [{ name: 'Billing', description: 'Read **billing records** and their relationships.' }],
  components: {
    examples: {
      Business: {
        summary: 'Business customer',
        description: 'Use this for a **company**.',
        value: { customer: 'Company', taxId: 'PL123' },
      },
    },
  },
  paths: {
    '/invoices': {
      get: operation('List', 'List invoices', {
        parameters: [parameter],
        description: 'Find invoices, then **open their details**.',
        responses: {
          200: {
            description: 'Invoice collection',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { type: 'object', properties: { id: { type: 'integer' } } },
                },
                examples: {
                  one: { summary: 'One invoice', value: [{ id: 42 }] },
                  two: { summary: 'Two invoices', value: [{ id: 42 }, { id: 43 }] },
                },
              },
            },
            links: {
              detail: {
                operationId: 'Detail',
                description: 'Read the **details** of the first invoice.',
                parameters: { id: '$response.body#/0/id' },
              },
            },
          },
        },
      }),
      post: operation('Create', 'Create invoice', {
        description: '## Before creating\n\nChoose a customer and review the payload.',
        parameters: [parameter],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object' },
              examples: {
                personal: {
                  summary: 'Personal customer',
                  description: 'Example for an **individual**.',
                  value: { customer: 'Alice' },
                },
                business: { $ref: '#/components/examples/Business' },
                external: {
                  summary: 'External example',
                  externalValue: 'https://example.invalid/example.json',
                },
              },
            },
            'application/xml': { example: '<invoice customer="Alice"/>' },
          },
        },
      }),
    },
    '/fallback/{id}': {
      get: operation('Fallback', 'Related payment', {
        deprecated: true,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
      }),
    },
    '/detail/{id}': {
      get: operation('Detail', 'Invoice details', {
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'query', name: 'assetId', required: true, schema: { type: 'integer' } },
        ],
      }),
    },
  },
}
;(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    const json = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(value))
    }
    if (url.pathname === '/configuration')
      return json({
        openApiUrl: base + '/openapi.json',
        endpointMappingsUrl: base + '/mappings',
        apiBaseUrl: base,
      })
    if (url.pathname === '/openapi.json') return json(document)
    if (url.pathname === '/mappings')
      return json(
        [
          ...['Fallback', 'Detail'].map((operationId) => ({
            source: { operationId: 'List', eachItem: true, property: 'id' },
            target: { operationId, location: 'path', name: 'id' },
          })),
          {
            source: { operationId: 'Fallback', property: 'id' },
            target: { operationId: 'Detail', location: 'query', name: 'assetId' },
          },
        ]
      )
    if (url.pathname === '/invoices') {
      let body = ''
      for await (const chunk of req) body += chunk
      calls.push({ method: req.method, body })
      return json(req.method === 'GET' ? [{ id: 42 }, { id: 43 }] : { id: 44 })
    }
    if (url.pathname === '/tracking') {
      calls.push({ tracking: true })
      return res.end()
    }
    try {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      res.setHeader(
        'content-type',
        file.endsWith('.js')
          ? 'application/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'text/html'
      )
      res.end(await fs.readFile(path.join(root, file)))
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  p.setDefaultTimeout(10000)
  p.on('pageerror', (error) => errors.push(error.message))
  if (output) await fs.mkdir(output, { recursive: true })
  const shot = async (name) => {
    if (output) await p.screenshot({ path: path.join(output, name + '.png') })
  }
  await p.addInitScript(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          samples: [
            {
              name: 'Saved payload',
              fields: {},
              body: '{"saved":true}',
              mediaType: 'application/json',
            },
          ],
          defaultName: '',
        })
      ),
    { key: 'necto:request-samples:' + JSON.stringify([base + '/openapi.json', 'POST /invoices']) }
  )
  await p.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 2,
          active: [],
          presets: ['First', 'Second', 'Third'].map((name) => [
            name,
            [['reference', { value: name }]],
          ]),
        })
      ),
    'necto:environments:' + base + '/openapi.json'
  )
  await p.addInitScript(() => localStorage.setItem('necto:catalog-width', '250'))
  await p.goto(base)
  assert.ok(
    await p.locator('.hero').evaluate((el) => el.getBoundingClientRect().height <= 76),
    'desktop header should stay compact'
  )
  const endpoint = async (name) => {
    await p.getByRole('searchbox', { name: 'Find an endpoint' }).fill(name)
    await p
      .locator('.catalog-operation')
      .filter({ has: p.locator('strong', { hasText: new RegExp('^' + name + '$') }) })
      .click()
  }
  const catalogSearch = p.getByRole('searchbox', { name: 'Find an endpoint' })
  await catalogSearch.fill('invoice')
  await catalogSearch.press('ArrowDown')
  assert.ok(await p.locator('.catalog-operation:focus').count())
  await p.keyboard.press('Escape')
  assert.ok(await catalogSearch.evaluate(input => input === document.activeElement))
  await catalogSearch.fill('Related payment')
  await catalogSearch.press('Enter')
  await p.getByRole('heading', { name: 'Related payment', exact: false }).waitFor()
  const deprecated = p.locator('.catalog-operation.deprecated')
  await deprecated.getByText('Deprecated', { exact: true }).waitFor()
  await p.getByRole('switch', { name: 'Hide deprecated' }).check()
  assert.equal(await deprecated.count(), 0)
  await p.getByRole('switch', { name: 'Hide deprecated' }).uncheck()
  await deprecated.waitFor()
  const closeDescription = async () => {
    await p.keyboard.press('Escape')
    await p.locator('.description-dialog[open]').waitFor({ state: 'detached' })
  }
  const send = () => p.getByRole('button', { name: 'Send request', exact: true }).click()
  await p.getByRole('button', { name: 'About API', exact: true }).click()
  const info = p.locator('.description-dialog[open]')
  await info.getByRole('heading', { name: 'Start with an invoice', exact: true }).waitFor()
  assert.equal(await info.locator('li').count(), 2)
  assert.equal(await info.locator('img,script').count(), 0)
  assert.equal(await p.evaluate(() => Boolean(window.injected)), false)
  assert.equal(
    calls.some((x) => x.tracking),
    false
  )
  await shot('api-description')
  await closeDescription()
  assert.equal(
    await p
      .getByRole('button', { name: 'About API', exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  )
  await p.getByRole('button', { name: 'About group Billing', exact: true }).click()
  await p
    .locator('.description-dialog[open] strong')
    .filter({ hasText: 'billing records' })
    .waitFor()
  await closeDescription()
  await endpoint('Create invoice')
  assert.equal(await p.getByRole('heading', { name: 'Before creating', exact: true }).count(), 0)
  const presetBar = p.getByRole('region', { name: 'Presets', exact: true })
  const presetOrder = () => presetBar.getByRole('button').allTextContents()
  const secondPreset = presetBar.getByRole('button', { name: 'Second', exact: true })
  const reference = p.locator('.request-pane .field input').first()
  await secondPreset.hover()
  const { x, y, width, height } = await secondPreset.boundingBox()
  const clickPreset = () => p.mouse.click(x + width / 2, y + height / 2)
  await clickPreset()
  assert.equal(await secondPreset.getAttribute('aria-pressed'), 'true')
  assert.equal(await reference.inputValue(), 'Second')
  assert.deepEqual(await presetOrder(), ['First', 'Second', 'Third'])
  await clickPreset()
  assert.equal(await secondPreset.getAttribute('aria-pressed'), 'false')
  assert.deepEqual(await presetOrder(), ['First', 'Second', 'Third'])
  await clickPreset()
  await p.mouse.move(0, 0)
  assert.deepEqual(await presetOrder(), ['Second', 'First', 'Third'])
  await secondPreset.click()
  assert.equal(await secondPreset.getAttribute('aria-pressed'), 'false')
  assert.deepEqual(await presetOrder(), ['Second', 'First', 'Third'])
  await p.mouse.move(0, 0)
  assert.deepEqual(await presetOrder(), ['First', 'Second', 'Third'])
  await p.getByRole('button', { name: 'About endpoint', exact: true }).click()
  await p.getByRole('heading', { name: 'Before creating', exact: true }).waitFor()
  await closeDescription()
  await p.getByRole('button', { name: 'About parameter reference', exact: true }).click()
  await p
    .locator('.description-dialog[open] strong')
    .filter({ hasText: 'invoice reference' })
    .waitFor()
  await closeDescription()
  const body = p.locator('.body-editor textarea')
  await body.fill('{"unsaved":true}')
  const savedRequests = p.getByRole('region', { name: 'Saved requests', exact: true })
  const examplesButton = p.getByRole('button', { name: 'OpenAPI examples', exact: true })
  const examples = p.getByRole('dialog', { name: 'OpenAPI examples' })
  const searchExamples = examples.getByRole('searchbox', { name: 'Search examples' })
  const useExample = examples.getByRole('button', { name: 'Use as draft' })
  const findExample = async name => {
    await examplesButton.click()
    await searchExamples.fill(name)
  }

  assert.equal(await examples.count(), 0)
  await findExample('Personal customer')
  await examples.locator('pre').filter({ hasText: 'Alice' }).waitFor()
  assert.equal(await body.inputValue(), '{"unsaved":true}')
  await useExample.click()
  assert.equal(JSON.parse(await body.inputValue()).customer, 'Alice')
  await findExample('Business customer')
  await shot('request-examples')
  await useExample.click()
  assert.equal(JSON.parse(await body.inputValue()).taxId, 'PL123')
  await examplesButton.click()
  await examples.getByRole('button', { name: 'Return to draft', exact: true }).click()
  assert.equal(await body.inputValue(), '{"unsaved":true}')
  assert.equal(calls.length, 0)
  await savedRequests.getByRole('button', { name: 'Saved payload', exact: true }).click()
  assert.equal(await body.inputValue(), '{"saved":true}')
  await findExample('Personal customer')
  await useExample.click()
  await send()
  await p.locator('.json-preview').filter({ hasText: '44' }).waitFor()
  assert.equal(calls.filter((x) => x.method === 'POST').length, 1)
  assert.equal(JSON.parse(calls.at(-1).body).customer, 'Alice')
  await findExample('External example')
  await examples.getByText('External example files are not fetched.').waitFor()
  assert.equal(await useExample.isDisabled(), true)
  await searchExamples.fill('Known reference')
  await useExample.click()
  assert.equal(await p.locator('.request-pane .field input').first().inputValue(), 'INV-42')
  await findExample('application/xml')
  await useExample.click()
  assert.equal(await body.inputValue(), '<invoice customer="Alice"/>')
  assert.equal(calls.filter((x) => x.method === 'POST').length, 1)
  await endpoint('List invoices')
  await send()
  await p.locator('.json-preview').filter({ hasText: '42' }).waitFor()
  const next = p.locator('.pinned-tools-host').getByRole('complementary', { name: 'Next request' }),
    targets = next.locator('.related-targets > ul > li')
  assert.match(await targets.first().innerText(), /Invoice details/)
  assert.equal(await targets.first().getByText('OpenAPI Link', { exact: true }).count(), 1)
  assert.match(await targets.nth(1).innerText(), /Related payment/)
  await targets.nth(1).getByText('Deprecated', { exact: true }).waitFor()
  assert.equal(await targets.first().getByRole('combobox', { name: 'id path' }).inputValue(), '42')
  await shot('preferred-links')
  await next.getByRole('button', { name: 'About link to Invoice details', exact: true }).click()
  await p.locator('.description-dialog[open] strong').filter({ hasText: 'details' }).waitFor()
  await closeDescription()
  await p.getByRole('button', { name: 'Tools', exact: true }).click()
  await p.locator('.tools-menu').getByRole('button', { name: 'Contract', exact: true }).click()
  await p.locator('.contract-panel').getByText('Example', { exact: true }).click()
  await p.getByRole('button', { name: 'Two invoices', exact: true }).click()
  assert.match(await p.locator('.contract-panel pre').first().innerText(), /43/)
  assert.equal(calls.filter((x) => x.method === 'GET').length, 1)
  await shot('response-examples')
  await p.getByRole('button', { name: 'Close request tools', exact: true }).click()
  await p.setViewportSize({ width: 390, height: 844 })
  await next.waitFor()
  await p.getByRole('button', { name: 'About API', exact: true }).click()
  assert.ok(
    await p
      .locator('.description-dialog[open]')
      .evaluate((el) => el.getBoundingClientRect().width <= window.innerWidth)
  )
  await shot('mobile-description')
  await closeDescription()
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  assert.ok(
    await p.locator('.hero').evaluate((el) => el.getBoundingClientRect().height <= 80),
    'mobile header should stay compact'
  )
  const help = p.getByRole('dialog', { name: 'Where to get assetId' })
  await targets.first().getByRole('button', { name: 'Where to get assetId' }).click()
  await help.getByText('GET /fallback/{id}', { exact: true }).waitFor()
  await help.getByText('$.id', { exact: true }).waitFor()
  await help.getByRole('button', { name: 'Close', exact: true }).click()
  const asset = targets.first().getByRole('combobox', { name: 'assetId query' })
  await asset.fill('719')
  await targets.first().getByRole('button', { name: 'Where to get assetId' }).click()
  await help.getByRole('button', { name: 'Open source Related payment' }).click()
  await p.getByRole('heading', { name: 'Related payment', exact: false }).waitFor()
  await p.goBack()
  await asset.waitFor()
  assert.equal(await asset.inputValue(), '719')
  await targets.first().getByRole('button', { name: 'Open request Invoice details' }).click()
  await p.getByRole('button', { name: 'Where to get id', exact: true }).click()
  const idHelp = p.getByRole('dialog', { name: 'Where to get id', exact: true })
  await idHelp.getByText('$[0].id', { exact: true }).waitFor()
  await idHelp.getByRole('button', { name: 'Open source List invoices' }).first().click()
  await p.getByRole('heading', { name: 'List invoices', exact: false }).waitFor()
  assert.equal(calls.filter((x) => x.method === 'GET').length, 1)
  await p.setViewportSize({ width: 1440, height: 900 })
  await p.getByRole('button', { name: 'Settings', exact: true }).click()
  await p.getByRole('button', { name: 'Appearance', exact: true }).click()
  await p.getByLabel('Color theme').selectOption('dark')
  await p.locator('html[data-necto-theme="dark"]').waitFor()
  await p.getByLabel('Compact endpoint list').check()
  await p.getByLabel('Default response view').selectOption('raw')
  const catalogWidth = p.getByRole('slider', { name: /Endpoint catalog/ })
  const relatedWidth = p.getByRole('slider', { name: /Pinned Next request/ })
  assert.equal(await catalogWidth.inputValue(), '250')
  await catalogWidth.press('Home')
  await relatedWidth.press('End')
  await p.getByRole('button', { name: 'Close settings', exact: true }).click()
  assert.equal(await p.getByRole('button', { name: 'Raw', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await next.locator('..').evaluate(panel => panel.getBoundingClientRect().width), 384)
  assert.match(await p.locator('.navigation-layout').evaluate(panel => getComputedStyle(panel).gridTemplateColumns), /^180px /)
  await p.locator('.catalog.compact').waitFor()
  await p.getByRole('button', { name: 'Preview', exact: true }).click()
  assert.equal(await p.getByRole('button', { name: 'Preview', exact: true }).getAttribute('aria-pressed'), 'true')
  await p.getByRole('button', { name: 'Settings', exact: true }).click()
  await p.getByRole('button', { name: 'Appearance', exact: true }).click()
  await p.getByLabel('Pin Next request by default').uncheck()
  await p.getByLabel('Hide deprecated endpoints').check()
  await p.getByLabel('Show endpoint paths instead of names').check()
  await p.getByRole('button', { name: 'Close settings', exact: true }).click()
  await next.waitFor({ state: 'hidden' })
  await p.getByRole('button', { name: 'Next request', exact: true }).waitFor()
  await p.goto(base)
  await p.locator('html[data-necto-theme="dark"]').waitFor()
  assert.equal(await p.getByRole('switch', { name: 'Hide deprecated', exact: true }).isChecked(), true)
  assert.equal(await p.getByRole('switch', { name: 'Show paths instead of names' }).isChecked(), true)
  await p.getByRole('button', { name: 'Settings', exact: true }).click()
  await p.getByRole('button', { name: 'Appearance', exact: true }).click()
  assert.equal(await p.getByLabel('Pin Next request by default').isChecked(), false)
  assert.equal(await p.getByLabel('Default response view').inputValue(), 'raw')
  assert.equal(await p.getByLabel('Compact endpoint list').isChecked(), true)
  assert.equal(await catalogWidth.inputValue(), '180')
  assert.equal(await relatedWidth.inputValue(), '384')
  await p.getByLabel('Color theme').selectOption('system')
  await p.locator('html[data-necto-theme="system"]').waitFor()
  const background = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await p.emulateMedia({ colorScheme: 'dark' })
  const darkBackground = await background()
  await p.emulateMedia({ colorScheme: 'light' })
  assert.notEqual(await background(), darkBackground)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: on-demand sanitized descriptions; saved and OpenAPI payload navigation, draft restoration, references and external examples; Links priority; response examples; mobile layout; appearance settings and persistence. No unintended API calls.'
  )
})()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (browser) await browser.close()
    if (server) server.close()
  })
