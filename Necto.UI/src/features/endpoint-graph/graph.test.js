import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEndpointGraph, layoutEndpoints, responseSelector } from './graph.js'
const operation = (id, extra = {}) => ({ id, key: `GET /${id}`, method: 'GET', path: `/${id}`, name: id, tags: [], parameters: [], ...extra })
const mapping = (from, to, property = 'id', name = 'invoiceId') => ({ source: { operationId: from, eachItem: true, property },
  target: { operationId: to, location: 'parameter', name }, match: 'name' })

test('directed endpoint edges bundle fields and preserve isolated nodes', () => {
  const operations = [operation('Invoices'), operation('Lines', { parameters: [{ name: 'invoiceId', in: 'path' }, { name: 'tenantId', in: 'query' }] }), operation('Weather')]
  const result = buildEndpointGraph(operations, [mapping('Invoices', 'Lines'), mapping('Invoices', 'Lines'), mapping('Invoices', 'Lines', 'tenantId', 'tenantId')])
  assert.equal(result.nodes.length, 3)
  assert.equal(result.edges.length, 1)
  assert.equal(result.edges[0].values.length, 2)
  assert.equal(result.edges[0].values[0].location, 'path')
  assert.equal(result.nodes[0].outgoing, 1)
  assert.equal(result.nodes[1].incoming, 1)
  assert.equal(result.nodes[2].incoming + result.nodes[2].outgoing, 0)
})
test('missing, ambiguous and invalid targets do not create edges', () => {
  const operations = [operation('A'), operation('A', { key: 'POST /A' }), operation('B')]
  assert.equal(buildEndpointGraph(operations, [mapping('A', 'B'), mapping('unknown', 'B'), mapping('B', 'A')]).edges.length, 0)
  assert.equal(buildEndpointGraph([operation('A'), operation('B')], [mapping('A', 'B')]).edges.length, 0)
})
test('body targets, header parameters and cyclic flows retain the correct direction', () => {
  const operations = [operation('A', { requestBody: {} }), operation('B', { parameters: [{ name: 'X-Id', in: 'header' }] })]
  const body = { source: { operationId: 'B', property: null }, target: { operationId: 'A', location: 'body', name: null } }
  const result = buildEndpointGraph(operations, [mapping('A', 'B', 'id', 'X-Id'), body])
  assert.equal(result.edges.length, 2)
  assert.equal(result.edges[1].from, 'GET /B')
  assert.equal(result.edges[1].values[0].selector, '$')
  assert.equal(result.edges[1].values[0].match, 'explicit')
  assert.ok(result.nodes.every(node => node.incoming === 1 && node.outgoing === 1))
})
test('selectors preserve nested arrays and exact property names', () => {
  assert.equal(responseSelector({ eachItem: true, property: 'id' }), '$[*]["id"]')
  assert.equal(responseSelector({ objectPath: ['invoice.lines', null], property: 'line/id' }), '$["invoice.lines"][*]["line/id"]')
  assert.equal(responseSelector({ eachItem: true, property: null }), '$[*]')
  assert.deepEqual(buildEndpointGraph([], []), { nodes: [], edges: [] })
  const positions = layoutEndpoints([operation('A'), operation('B')])
  assert.notEqual(positions[0].x, positions[1].x)
})

test('operation IDs are scoped by API and cross-service arrows retain their direction', () => {
  const local = { ...operation('Invoices'), apiId: 'local' }
  const external = { ...operation('Invoices', { parameters: [{ name: 'invoiceId', in: 'path' }] }),
    apiId: 'billing', key: 'billing:GET /Invoices' }
  const result = buildEndpointGraph([local, external], [{
    source: { apiId: 'local', operationId: 'Invoices', property: 'id' },
    target: { apiId: 'billing', operationId: 'Invoices', location: 'path', name: 'invoiceId' },
  }])
  assert.equal(result.edges.length, 1)
  assert.equal(result.edges[0].from, local.key)
  assert.equal(result.edges[0].to, external.key)
  assert.equal(result.nodes[1].incoming, 1)
})
