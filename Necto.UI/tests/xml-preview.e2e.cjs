const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../dist'), output = process.env.NECTO_XML_SCREENSHOTS
let server, browser, base
const errors = [], calls = []
const invoice = '<inv:invoice xmlns:inv="urn:necto:invoice" id="42"><customer>A &amp; B</customer><total currency="PLN">125.00</total><notes><![CDATA[<img src="/tracking" onerror="window.injected=true">]]></notes></inv:invoice>'
const collection = '<?xml version="1.0" encoding="UTF-8"?><invoices>' + Array.from({ length: 1200 }, (_, id) => invoice.replace('id="42"', `id="${id + 1}"`)).join('') + '</invoices>'
const operation = (operationId, type) => ({ operationId, summary: operationId, tags: ['Invoices'], responses: { 200: { description: 'Invoice response', content: { [type]: { schema: type === 'application/json' ? { type: 'object' } : { type: 'string' } } } } } })
const document = { openapi: '3.1.0', info: { title: 'Invoice documents API', version: '1' }, paths: {
  '/xml': { get: operation('InvoiceXml', 'application/xml') },
  '/embedded': { get: operation('EmbeddedXml', 'application/json') },
  '/attributes': { get: operation('AttributeXml', 'application/xml') },
  '/deep': { get: operation('DeepXml', 'application/xml') },
  '/long': { get: operation('LongXml', 'application/json') },
  '/invalid': { get: operation('InvalidXml', 'text/xml') },
  '/doctype': { get: operation('DoctypeXml', 'application/soap+xml') }
} }
;(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    const send = (type, value) => { res.setHeader('Content-Type', type); res.end(value) }
    const json = value => send('application/json', JSON.stringify(value))
    if (url.pathname === '/configuration') return json({ openApiUrl: base + '/openapi.json', apiBaseUrl: base })
    if (url.pathname === '/openapi.json') return json(document)
    if (url.pathname === '/xml') return send('application/xml', collection)
    if (url.pathname === '/embedded') return json({ id: 42, reference: 'INV-2026-0042', document: invoice })
    if (url.pathname === '/attributes') return send('application/xml', '<invoice ' + Array.from({ length: 60 }, (_, id) => `field${id}="value${id}"`).join(' ') + '/>')
    if (url.pathname === '/deep') return send('application/xml', '<level>'.repeat(30) + 'Deep value' + '</level>'.repeat(30))
    if (url.pathname === '/long') return json({ document: '<document note="' + 'a'.repeat(4500) + '"><text>' + 'b'.repeat(4500) + '</text></document>' })
    if (url.pathname === '/invalid') return send('text/xml', '<invoices><invoice></invoices>')
    if (url.pathname === '/doctype') return send('application/soap+xml', '<!DOCTYPE invoice SYSTEM "' + base + '/tracking"><invoice/>')
    if (url.pathname === '/tracking') { calls.push('tracking'); return res.end() }
    try { const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1); res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await fs.readFile(path.join(root, file))) }
    catch { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }); page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  if (output) await fs.mkdir(output, { recursive: true })
  const screenshot = async name => { if (output) await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }) }
  const open = async name => {
    await page.getByRole('searchbox', { name: 'Find an endpoint' }).fill(name)
    await page.locator('.catalog-operation').filter({ has: page.locator('strong', { hasText: new RegExp('^' + name + '$') }) }).click()
    await page.getByRole('button', { name: 'Send request', exact: true }).click()
  }
  await page.goto(base)
  await open('InvoiceXml')
  const xml = page.locator('.response-preview > .xml-preview')
  await xml.getByRole('button', { name: 'Expand inv:invoice', exact: true }).first().waitFor()
  assert.equal(await xml.getByRole('button', { name: 'Expand inv:invoice', exact: true }).count(), 25)
  await xml.getByRole('button', { name: 'Expand inv:invoice', exact: true }).first().click()
  assert.match(await xml.textContent(), /A &amp; B/)
  assert.match(await xml.textContent(), /<total currency="PLN">125.00<\/total>/)
  const pager = xml.getByRole('group', { name: 'XML nodes pages' }).first()
  await pager.getByLabel('Page', { exact: true }).fill('48'); await pager.getByLabel('Page', { exact: true }).press('Tab')
  assert.match(await xml.textContent(), /1176/)
  assert.equal(await xml.locator('.xml-node').count() < 80, true, 'rendering stays bounded on a later XML page')
  await page.getByRole('button', { name: 'Raw', exact: true }).click()
  assert.match(await page.locator('.raw-preview').textContent(), /<invoices>/)
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.response-details summary').click().then(() => page.getByRole('button', { name: 'Download response', exact: true }).click())])
  assert.equal(download.suggestedFilename(), 'response.xml')
  assert.equal(await fs.readFile(await download.path(), 'utf8'), collection)
  await page.locator('.response-details summary').click()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await xml.locator('.xml-tree').waitFor()
  await screenshot('xml-response-desktop')
  await open('EmbeddedXml')
  assert.equal(await page.locator('.xml-preview').count(), 0, 'embedded XML stays opt-in')
  await page.getByRole('button', { name: 'Preview XML at ["document"]', exact: true }).click()
  await page.locator('.xml-tree').waitFor()
  await page.getByRole('button', { name: 'Expand notes', exact: true }).click()
  assert.match(await page.locator('.xml-preview').textContent(), /CDATA/)
  assert.equal(await page.locator('.xml-preview img').count(), 0)
  assert.equal(await page.evaluate(() => window.injected), undefined)
  assert.deepEqual(calls, [])
  await page.getByRole('button', { name: 'Collapse notes', exact: true }).click()
  await screenshot('xml-in-json-desktop')
  // Searching JSON reveals the original scalar and its match, even with XML open.
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  const search = page.getByRole('searchbox', { name: 'Search JSON', exact: true })
  await search.fill('CDATA')
  await page.locator('[data-search-match="true"]').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Close XML preview at ["document"]', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await open('LongXml')
  await page.getByRole('button', { name: 'Preview XML at ["document"]', exact: true }).click()
  const long = page.locator('.xml-preview')
  await long.getByRole('group', { name: 'XML characters pages' }).first().waitFor()
  assert.match(await long.textContent(), /4[,\s]?500/)
  assert.equal(await long.locator('.xml-value .xml-text').first().textContent(), 'a'.repeat(2000))
  await open('EmbeddedXml')
  await page.getByRole('button', { name: 'Preview XML at ["document"]', exact: true }).click()
  await page.locator('.xml-tree').waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot('xml-in-json-mobile')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  await page.getByRole('button', { name: 'Close XML preview at ["document"]', exact: true }).click()
  await page.getByRole('button', { name: 'Preview XML at ["document"]', exact: true }).click()
  await page.locator('.xml-tree').waitFor()
  await page.setViewportSize({ width: 1440, height: 1050 })
  await open('AttributeXml')
  await page.getByRole('button', { name: '60 attributes', exact: true }).click()
  const attributes = page.getByRole('group', { name: 'Attributes pages' })
  await attributes.getByLabel('Page', { exact: true }).fill('3'); await attributes.getByLabel('Page', { exact: true }).press('Tab')
  assert.equal(await page.locator('.xml-attribute-row').count(), 10)
  assert.match(await xml.textContent(), /field59/)
  await open('DeepXml')
  await xml.locator('.xml-tree').waitFor()
  for (let depth = 2; depth <= 24; depth++) await xml.getByRole('button', { name: 'Expand level', exact: true }).click()
  await xml.getByRole('button', { name: 'Inspect subtree', exact: true }).click()
  await xml.getByRole('button', { name: 'Back to full XML', exact: true }).waitFor()
  await xml.getByRole('button', { name: 'Back to full XML', exact: true }).click()
  assert.equal(await xml.getByRole('button', { name: 'Back to full XML', exact: true }).count(), 0)
  await open('InvalidXml')
  await page.locator('.xml-preview [role="status"]').waitFor()
  await page.getByRole('button', { name: 'Raw', exact: true }).click()
  assert.match(await page.locator('.raw-preview').textContent(), /<invoices><invoice>/)
  await open('DoctypeXml')
  await page.getByText('XML with a DOCTYPE is not previewed.', { exact: false }).waitFor()
  assert.deepEqual(calls, [])
  assert.deepEqual(errors, [])
  console.log('XML browser checks passed: paging, raw/download fidelity, embedded opt-in, safe text, search, long values, mobile, malformed XML and DTD fallback.')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()) })
