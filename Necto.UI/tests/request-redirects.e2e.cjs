const http = require('node:http'), fs = require('node:fs/promises'), assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
let source, receiver, browser
const received = []
;(async () => {
 receiver = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method !== 'OPTIONS') received.push(req.headers['x-api-key'] ?? null)
  res.end('review receiver')
 })
 await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve))
 const destination = `http://127.0.0.1:${receiver.address().port}/capture`
 source = http.createServer(async (req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { Location: destination }); return res.end() }
  if (req.url === '/response.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(await fs.readFile(require('node:path').resolve(__dirname, '../src/features/workbench/response.js'))) }
  if (req.url === '/authentication.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(await fs.readFile(require('node:path').resolve(__dirname, '../src/features/authentication/authentication.js'))) }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Necto local security proof</title>')
 })
 await new Promise(resolve => source.listen(0, '127.0.0.1', resolve))
 const origin = `http://127.0.0.1:${source.address().port}`
 browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
 const page = await browser.newPage(); await page.goto(origin)
 const results = await page.evaluate(async () => {
  const { authorizeRequest } = await import('/authentication.js')
  const request = () => ({ url: new URL('/redirect', location.href), options: { method: 'GET', headers: new Headers({ 'X-API-Key': 'FAKE-REVIEW-KEY' }) } })
  const manual = authorizeRequest(request(), { security: null }, {})
  let manualBlocked = false
  try { await fetch(manual.url, manual.options) } catch { manualBlocked = true }
  const { sendRequest } = await import('/response.js')
  let transportBlocked = false
  try { const direct = request(); direct.options.redirect = 'follow'; await sendRequest(direct) } catch { transportBlocked = true }
  const api = { schemes: { key: { type: 'apiKey', in: 'header', name: 'X-API-Key' } }, credentials: { key: { token: 'FAKE-REVIEW-KEY', origins: [location.origin], scopes: [] } } }
  const managed = authorizeRequest(request(), { security: [{ key: [] }] }, api)
  let managedBlocked = false
  try { await fetch(managed.url, managed.options) } catch { managedBlocked = true }
  return { manualBlocked, managedBlocked, transportBlocked }
 })
 assert.deepEqual(received, []); assert.deepEqual(results, { manualBlocked: true, managedBlocked: true, transportBlocked: true })
 console.log('PASS: Chromium blocked manual, managed and direct-transport redirects; receiver got no requests.')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { await browser?.close(); for (const server of [source, receiver]) if (server) await new Promise(resolve => server.close(resolve)) })
