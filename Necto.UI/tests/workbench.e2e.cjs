const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../dist')
let server, browser, base
const requests = [],
  errors = []
const output = process.env.NECTO_WORKBENCH_SCREENSHOTS
const response = {
  description: 'Successful response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer', format: 'int64' },
          reference: { type: 'string', enum: ['INV-42', 'INV-99'] }
        }
      }
    }
  }
}
const op = (name, extra = {}) => ({
  operationId: name,
  summary: name,
  tags: ['Workbench'],
  responses: { 200: response },
  ...extra
})
;(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    const json = (value) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(value))
    }
    if (url.pathname === '/configuration')
      return json({
        openApiUrl: base + '/openapi.yaml',
        endpointMappingsUrl: base + '/mappings',
        apiBaseUrl: base
      })
    if (url.pathname === '/mappings') return json([])
    if (url.pathname === '/openapi.yaml') {
      const document = JSON.parse(
        await fs.readFile(
          path.join(__dirname, 'workbench.openapi.json'),
          'utf8'
        )
      )
      document.servers = [
        { url: base, description: 'Local fixture' },
        {
          url: base + '/{version}',
          description: 'Versioned API',
          variables: { version: { default: 'v2', enum: ['v1', 'v2'] } }
        }
      ]
      res.setHeader('Content-Type', 'application/yaml')
      return res.end(JSON.stringify(document))
    }
    if (['/upload', '/form', '/raw'].includes(url.pathname)) {
      let body = Buffer.alloc(0)
      for await (const chunk of req) body = Buffer.concat([body, chunk])
      requests.push({
        path: url.pathname,
        type: req.headers['content-type'],
        body
      })
      res.setHeader('ETag', 'invoice-v1')
      return json({ id: 42, reference: 'INV-42', receivedBytes: body.length })
    }
    if (url.pathname === '/invoices')
      return json([
        { id: 42, reference: 'INV-42' },
        { id: 99, reference: 'INV-99' }
      ])
    if (url.pathname === '/binary') {
      res.setHeader('Content-Type', 'application/pdf')
      return res.end(Buffer.from([0, 255, 128, 1]))
    }
    if (url.pathname === '/stream') {
      res.setHeader('Content-Type', 'application/x-ndjson')
      res.write('{"id":42}\n')
      return setTimeout(() => res.end('{"id":99}\n'), 300)
    }
    if (url.pathname === '/slow') return setTimeout(() => json({ id: 1 }), 1500)
    try {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      if (file.includes('..')) throw Error('Invalid')
      const bytes = await fs.readFile(path.join(root, file))
      res.setHeader(
        'Content-Type',
        file.endsWith('.js')
          ? 'application/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'text/html'
      )
      res.end(bytes)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  p.on('pageerror', (error) => errors.push(error.message))
  await p.goto(base)
  const endpoint = async (name) => {
    await p.getByRole('searchbox', { name: 'Find an endpoint' }).fill(name)
    await p
      .locator('.catalog-operation')
      .filter({
        has: p.locator('strong', { hasText: new RegExp('^' + name + '$') })
      })
      .click()
  }
  const send = () =>
    p.getByRole('button', { name: 'Send request', exact: true }).click()
  const done = () => p.locator('.status').filter({ hasText: '200' }).waitFor()
  const tools = async () => {
    await p.getByRole('button', { name: 'Tools', exact: true }).click()
    await p.locator('.tools-menu').getByRole('button', { name: 'Contract', exact: true }).click()
  }
  const close = () =>
    p.getByRole('button', { name: 'Close request tools' }).click()
  if (output) await fs.mkdir(output, { recursive: true })
  await endpoint('Upload invoice')
  await p.locator('.body-editor input[type=file]').setInputFiles({
    name: 'invoice.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Invoice attachment')
  })
  await send()
  await done()
  assert.match(requests[0].type, /multipart\/form-data; boundary=/)
  assert.ok(requests[0].body.includes(Buffer.from('Invoice attachment')))
  assert.ok(requests[0].body.includes(Buffer.from('INV-42')))
  if (output) await p.screenshot({ path: path.join(output, 'upload.png') })
  await p.getByText('Details', { exact: true }).click()
  assert.ok(
    (await p.locator('.response-details-content').textContent()).includes(
      'invoice-v1'
    )
  )
  await p.getByText('Details', { exact: true }).click()
  await tools()
  await p.getByRole('tab', { name: 'Code', exact: true }).click()
  assert.match(await p.locator('dialog[open] pre').textContent(), /--form/)
  if (output) await p.screenshot({ path: path.join(output, 'code.png') })
  await p.getByRole('tab', { name: 'Checks', exact: true }).click()
  await p.getByRole('button', { name: 'Add check' }).click()
  await p.getByRole('textbox', { name: 'Expected value' }).fill('200')
  await close()
  await send()
  await done()
  await p.getByText('✓ HTTP status · 200', { exact: true }).waitFor()
  await tools()
  await p.getByRole('tab', { name: 'History', exact: true }).click()
  await p.getByText('Compare responses', { exact: true }).waitFor()
  await close()
  await endpoint('Form invoice')
  await send()
  await done()
  assert.equal(requests.at(-1).type, 'application/x-www-form-urlencoded')
  assert.equal(requests.at(-1).body.toString(), 'reference=INV-42')
  await endpoint('Raw invoice')
  await p
    .getByRole('combobox', { name: 'Example', exact: true })
    .selectOption('other')
  assert.match(await p.locator('textarea').inputValue(), /INV-99/)
  await p.getByRole('combobox', { name: 'Schema variant' }).selectOption('1')
  assert.match(await p.locator('textarea').inputValue(), /number/)
  await p
    .getByRole('combobox', { name: 'Body format' })
    .selectOption('application/xml')
  await send()
  await done()
  assert.equal(requests.at(-1).body.toString(), '<invoice id="42"/>')
  await p
    .getByRole('combobox', { name: 'Body format' })
    .selectOption('application/octet-stream')
  await p.locator('.body-editor input[type=file]').setInputFiles({
    name: 'data.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0, 255, 1])
  })
  await send()
  await done()
  assert.deepEqual([...requests.at(-1).body], [0, 255, 1])
  await endpoint('Download invoice')
  await send()
  await done()
  await p.getByText('Details', { exact: true }).click()
  const download = p.waitForEvent('download')
  await p.getByRole('button', { name: 'Download response' }).click()
  const file = await download
  assert.deepEqual(
    [...(await fs.readFile(await file.path()))],
    [0, 255, 128, 1]
  )
  await endpoint('Stream invoices')
  await send()
  await p.getByText('2 events · Finished', { exact: true }).waitFor()
  if (output) await p.screenshot({ path: path.join(output, 'stream.png') })
  await endpoint('Slow request')
  await send()
  await p.getByRole('button', { name: 'Cancel', exact: true }).click()
  await p.getByRole('alert').filter({ hasText: 'Request canceled.' }).waitFor()
  await tools()
  await p.getByRole('tab', { name: 'Options', exact: true }).click()
  await p.getByRole('spinbutton', { name: 'Timeout (milliseconds)' }).fill('50')
  await close()
  await send()
  await p.getByRole('alert').filter({ hasText: 'timed out' }).waitFor()
  await endpoint('Invoices')
  await send()
  await done()
  await tools()
  await p.getByRole('tab', { name: 'Contract', exact: true }).click()
  assert.equal(await p.evaluate(() => window.injected), undefined)
  assert.equal(await p.locator('dialog[open] [onerror]').count(), 0)
  if (output) await p.screenshot({ path: path.join(output, 'contract.png') })
  await p.getByRole('tab', { name: 'Server', exact: true }).click()
  await p.getByRole('combobox', { name: 'API server' }).selectOption('1')
  await p
    .getByRole('combobox', { name: 'version', exact: true })
    .selectOption('v1')
  await p.getByRole('button', { name: 'Use for this API' }).click()
  await p.getByRole('button', { name: 'Restore API default' }).click()
  await close()
  await p.getByRole('button', { name: 'Settings', exact: true }).click()
  await p.getByRole('button', { name: 'Workspace', exact: true }).click()
  await p.getByRole('heading', { name: 'Workspace', exact: true }).waitFor()
  const exportedFile = p.waitForEvent('download')
  await p.getByRole('button', { name: 'Export workspace' }).click()
  const exported = JSON.parse(
    await fs.readFile(await (await exportedFile).path(), 'utf8')
  )
  assert.equal(exported.format, 'necto-workspace')
  await p.getByLabel('Import workspace JSON').setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'necto-workspace',
        version: 1,
        entries: [
          {
            key: 'necto:servers:import-test',
            value: { local: { url: base } }
          }
        ]
      })
    )
  })
  await p.getByRole('button', { name: 'Import selected items' }).click()
  await p
    .getByRole('status')
    .filter({ hasText: 'Imported 1 items' })
    .waitFor()
  if (output) await p.screenshot({ path: path.join(output, 'workspace.png') })
  await p.getByRole('button', { name: 'Close settings' }).click()
  await p.locator('#settings-panel').waitFor({ state: 'detached' })
  await p.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true
  )
  await tools()
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true
  )
  await p.getByRole('combobox', { name: 'Request tool section' }).selectOption('Contract')

  if (output) await p.screenshot({ path: path.join(output, 'mobile.png') })
  await close()
  await p.getByRole('button', { name: 'Settings', exact: true }).click()
  await p.getByRole('button', { name: 'Workspace', exact: true }).click()
  await p.getByLabel('Local API document').setInputFiles({
    name: 'import.yaml',
    mimeType: 'application/yaml',
    buffer: Buffer.from(
      'openapi: 3.1.0\ninfo: {title: Imported API, version: "1"}\npaths:\n  /imported:\n    get:\n      operationId: Imported\n      summary: Imported\n      responses: {}\n'
    )
  })
  await p
    .getByRole('status')
    .filter({ hasText: 'API document loaded' })
    .waitFor()
  await p.getByRole('button', { name: 'Close settings' }).click()
  await p.locator('#settings-panel').waitFor({ state: 'detached' })
  assert.ok((await p.locator('body').textContent()).includes('Imported API'))
  assert.deepEqual(errors, [])
  console.log(
    'PASS: multipart boundary/files, urlencoded, named examples/variants, XML/binary upload, original download, response headers, snippets, checks/history, live stream, cancel/timeout, safe Markdown, server variables, workspace and mobile layout'
  )
})()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (browser) await browser.close()
    if (server) {
      server.closeAllConnections()
      await new Promise((r) => server.close(r))
    }
  })
