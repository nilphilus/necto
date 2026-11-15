import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { sendRequest } from './response.js'

test('API transport rejects redirects before another origin receives manual credentials', async () => {
  let destinationRequests = 0
  const destination = http.createServer((req, res) => { destinationRequests++; res.end('unexpected') })
  const source = http.createServer((req, res) => { res.writeHead(307, { location: `http://127.0.0.1:${destination.address().port}/capture` }); res.end() })
  try {
    await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve))
    await new Promise(resolve => source.listen(0, '127.0.0.1', resolve))
    await assert.rejects(sendRequest({ url: `http://127.0.0.1:${source.address().port}/redirect`, options: {
      method: 'POST', headers: new Headers({ 'X-API-Key': 'review-marker' }), body: 'private body', redirect: 'follow'
    } }))
    assert.equal(destinationRequests, 0)
  } finally { await Promise.all([source, destination].map(server => new Promise(resolve => server.close(resolve)))) }
})
