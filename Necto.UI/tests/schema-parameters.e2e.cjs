const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')

const query = (name, schema, required = false) => ({ name, in: 'query', schema, required })
const string = (format) => ({ type: 'string', format })
const dist = path.resolve(__dirname, '../dist')
const document = {
  openapi: '3.1.0',
  info: { title: 'Schema parameters', version: '1' },
  components: { schemas: { Flag: { type: ['boolean', 'null'] } } },
  paths: {
    '/check': {
      post: {
        parameters: [
          query('active', { $ref: '#/components/schemas/Flag' }),
          query('verified', { type: 'boolean' }, true),
          query('from', string('date-time')),
          query('day', string('date')),
          query('clock', string('time')),
        ],
        responses: { 200: { description: 'Echo' } },
      },
    },
  },
}

async function main() {
  let browser
  let base
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base)
    const json = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(value))
    }
    if (url.pathname === '/configuration') return json({
      openApiUrl: base + '/openapi.json',
      endpointMappingsUrl: base + '/mappings',
      apiBaseUrl: base,
    })
    if (url.pathname === '/openapi.json') return json(document)
    if (url.pathname === '/mappings') return json([])
    if (url.pathname === '/check') return json(Object.fromEntries(url.searchParams))
    const file = url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html'
    res.setHeader('content-type', file.endsWith('.js') ? 'application/javascript'
      : file.endsWith('.css') ? 'text/css' : 'text/html')
    res.end(await fs.readFile(path.join(dist, file)))
  })
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    const page = await browser.newPage()
    page.setDefaultTimeout(6000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const flag = (name) => page.getByRole('radiogroup', { name, exact: true })
    const set = (name, value) => flag(name).getByText(value, { exact: true }).click()
    const send = page.getByRole('button', { name: 'Send request', exact: true })
    const submit = async () => {
      const [response] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/check'),
        send.click(),
      ])
      return response.json()
    }

    assert.equal(await flag('active').getByRole('radio', { name: 'Unset' }).isChecked(), true)
    await send.click()
    assert.equal(await page.locator('form.request-pane').evaluate((form) => form.checkValidity()), false)
    await set('verified', 'False')
    assert.deepEqual(await submit(), { verified: 'false' })
    await set('active', 'True')
    assert.deepEqual(await submit(), { active: 'true', verified: 'false' })
    await set('active', 'False')
    assert.deepEqual(await submit(), { active: 'false', verified: 'false' })
    await set('active', 'Unset')

    const from = page.getByRole('textbox', { name: 'from query' })
    await page.getByRole('button', { name: 'Date & time', exact: true }).click()
    await page.getByLabel('Date', { exact: true }).fill('2026-11-18')
    const apply = page.getByRole('button', { name: 'Apply', exact: true })
    assert.equal(await apply.isDisabled(), true)
    await page.getByLabel('Time (UTC)', { exact: true }).fill('09:30')
    await apply.click()
    assert.deepEqual(await submit(), { verified: 'false', from: '2026-11-18T09:30:00Z' })

    await from.fill('2026-11-18T22:47:03.123456+02:00')
    await page.getByRole('button', { name: 'Date & time', exact: true }).click()
    await page.getByLabel('Date', { exact: true }).fill('2026-11-19')
    await apply.click()
    await page.getByRole('button', { name: 'Date', exact: true }).click()
    await page.getByLabel('Date', { exact: true }).fill('2026-11-20')
    await apply.click()
    await page.getByRole('button', { name: 'Time', exact: true }).click()
    await page.getByLabel('Time (UTC)', { exact: true }).fill('18:15')
    await apply.click()
    assert.deepEqual(await submit(), {
      verified: 'false', from: '2026-11-19T22:47:03.123456+02:00',
      day: '2026-11-20', clock: '18:15:00Z',
    })
    await from.clear()
    assert.equal(Object.hasOwn(await submit(), 'from'), false)
    assert.deepEqual(errors, [])
    console.log('PASS: schema parameter controls and serialized request values')
  } finally {
    await browser?.close()
    server.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
