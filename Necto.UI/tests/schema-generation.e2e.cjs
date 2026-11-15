const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
let server, browser, base
const errors = [], calls = [], schemas = { Leaf: { type: 'string' } }
for (let index = 14; index >= 0; index--) { const ref = { $ref: '#/components/schemas/' + (index === 14 ? 'Leaf' : `Level${index + 1}`) }; schemas[`Level${index}`] = { type: 'object', properties: { left: ref, right: ref } } }
const post = (name, schema) => ({ operationId: name, summary: name, requestBody: { required: true, content: { 'application/json': { schema } } }, responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } } })
const document = { openapi: '3.1.0', info: { title: 'Schema generation safety', version: '1' }, components: { schemas }, paths: {
 '/input': { post: post('LargeSchema', { $ref: '#/components/schemas/Level0' }) },
 '/variants': { post: post('Variants', { oneOf: [{ type: 'object', title: 'Small', properties: { value: { type: 'string' } } }, { $ref: '#/components/schemas/Level0' }] }) }
} }
;(async () => {
 server = http.createServer(async (req, res) => {
  const url = new URL(req.url, base), json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)) }
  if (url.pathname === '/configuration') return json({ openApiUrl: base + '/openapi.json', apiBaseUrl: base })
  if (url.pathname === '/openapi.json') return json(document)
  if (req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; calls.push(body); return json({ accepted: true }) }
  try { const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1); res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await fs.readFile(path.join(__dirname, '../dist', file))) } catch { res.writeHead(404); res.end() }
 })
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`
 browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message))
 await page.goto(base)
 const open = async name => { await page.getByRole('searchbox', { name: 'Find an endpoint' }).fill(name); await page.locator('.catalog-operation').filter({ has: page.locator('strong', { hasText: new RegExp('^' + name + '$') }) }).click() }
 await open('LargeSchema')
 await page.getByText('Automatic example skipped because the schema exceeds the generation budget.', { exact: false }).waitFor()
 const body = page.locator('.body-editor textarea')
 assert.equal(await body.inputValue(), ''); assert.deepEqual(calls, [])
 await body.fill('{"manual":true}')
 await page.getByRole('button', { name: 'Send request', exact: true }).click()
 await page.getByText('200 OK', { exact: true }).waitFor()
 assert.deepEqual(calls, ['{"manual":true}'])
 await open('Variants')
 await page.getByRole('combobox', { name: 'Schema variant' }).selectOption('1')
 await page.getByText('Automatic example skipped because the schema exceeds the generation budget.', { exact: false }).waitFor()
 assert.equal(await body.inputValue(), '')
 await page.getByRole('combobox', { name: 'Schema variant' }).selectOption('0')
 assert.match(await body.inputValue(), /value/)
 assert.deepEqual(errors, []); assert.equal(calls.length, 1)
 console.log('PASS: oversized schema and variant fall back visibly; manual body sends unchanged; small variant remains usable; no automatic requests.')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()) })
