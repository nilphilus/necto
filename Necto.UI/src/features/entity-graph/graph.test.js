import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEntityGraph, groupConnections, layoutGraph } from './graph.js'
const ref = name => ({ $ref: '#/components/schemas/' + name })
const response = schema => ({ 200: { content: { 'application/json': { schema } } } })
const operation = (id, schema, extra = {}) => ({ id, key: `GET /${id}`, path: `/${id}`, name: id,
  method: 'GET', parameters: [], resolve: x => x, responses: response(schema), ...extra })

test('layout keeps connected nodes in adjacent layers and honors a focus root', () => {
  const nodes = ['leaf', 'isolated', 'hub', 'middle', 'branch'].map(id => ({ id }))
  const edges = [
    { from: 'hub', to: 'middle' },
    { from: 'middle', to: 'leaf' },
    { from: 'branch', to: 'hub' },
  ]
  const positions = new Map(layoutGraph(nodes, edges, 'hub').map(node => [node.id, node]))
  assert.ok(positions.get('hub').x < positions.get('middle').x)
  assert.equal(positions.get('branch').x, positions.get('middle').x)
  assert.ok(positions.get('leaf').x > positions.get('middle').x)
  assert.ok(positions.get('isolated').y > Math.max(...nodes.filter(node => node.id !== 'isolated').map(node => positions.get(node.id).y)))
})

test('parallel links share a path per kind while keeping both directions and labels', () => {
  const edges = [
    { from: 'B', to: 'A', kind: 'schema', label: 'parent' },
    { from: 'A', to: 'B', kind: 'schema', label: 'child' },
    { from: 'A', to: 'B', kind: 'mapping', label: 'id' },
  ]
  const [schema, mapping] = groupConnections(edges)
  assert.deepEqual(schema.edges, edges.slice(0, 2))
  assert.ok(schema.forward && schema.reverse)
  assert.deepEqual(mapping.edges, edges.slice(2))
  assert.ok(mapping.forward && !mapping.reverse)
})

test('schema references are direct and endpoints include nested entities', () => {
  const spec = { components: { schemas: {
    Invoice: { type: 'object', properties: { lines: { type: 'array', items: ref('Line') } } },
    Line: { type: 'object', properties: { customer: ref('Customer') } },
    Customer: { type: 'object', properties: { id: { type: 'integer' } } },
  } } }
  const result = buildEntityGraph(spec, [operation('Invoices', { type: 'array', items: ref('Invoice') })])
  assert.equal(result.nodes.length, 3)
  assert.equal(result.edges.length, 2)
  assert.ok(result.edges.some(edge => edge.from === 'schema:Invoice' && edge.to === 'schema:Line'))
  assert.ok(!result.edges.some(edge => edge.from === 'schema:Invoice' && edge.to === 'schema:Customer'))
  assert.equal(result.nodes.find(node => node.name === 'Customer').endpoints[0].operation.id, 'Invoices')
})

test('schema titles are display names and references still use the original keys', () => {
  const invoiceKey = 'SampleApiFastEndpointsInvoicesInvoice'
  const spec = { components: { schemas: {
    [invoiceKey]: { title: ' Invoice ', properties: { line: ref('Line') } },
    Line: { title: ' ', type: 'object' },
  } } }
  const result = buildEntityGraph(spec, [operation('GetInvoice', ref(invoiceKey))])
  const invoice = result.nodes.find(node => node.id === `schema:${invoiceKey}`)
  assert.equal(invoice.name, 'Invoice')
  assert.equal(invoice.endpoints[0].operation.id, 'GetInvoice')
  assert.ok(result.edges.some(edge => edge.from === invoice.id && edge.to === 'schema:Line'))
  assert.equal(result.nodes.find(node => node.id === 'schema:Line').name, 'Line')
})

test('CLR names take precedence over schema titles and keys without changing references', () => {
  const key = 'BillingInvoiceResponse'
  const className = 'InvoiceWithAnUnusuallyLongClrName'
  const spec = { components: { schemas: {
    [key]: { title: 'Invoice response', 'x-necto-clr-name': className, properties: { line: ref('Line') } },
    Line: { type: 'object' },
  } } }
  const { nodes, edges } = buildEntityGraph(spec, [operation('GetInvoice', ref(key))])
  const invoice = nodes.find(node => node.id === `schema:${key}`)
  assert.equal(invoice.name, className)
  assert.equal(invoice.schemaKey, key)
  assert.equal(invoice.endpoints[0].operation.id, 'GetInvoice')
  assert.ok(edges.some(edge => edge.from === invoice.id && edge.to === 'schema:Line'))
})

test('qualified and flattened schema keys have short labels while references retain their identity', () => {
  const invoiceKey = 'Company.Product.Billing.Contracts.Invoice'
  const lineKey = 'CompanyProductBillingContractsInvoiceLine'
  const spec = { components: { schemas: {
    [invoiceKey]: { properties: { line: ref(lineKey) } },
    [lineKey]: { type: 'object' },
  } } }
  const result = buildEntityGraph(spec, [operation('GetInvoice', ref(invoiceKey))])
  const invoice = result.nodes.find(node => node.schemaKey === invoiceKey)
  const line = result.nodes.find(node => node.schemaKey === lineKey)
  assert.equal(invoice.name, 'Invoice')
  assert.equal(invoice.endpoints[0].operation.id, 'GetInvoice')
  assert.ok(line.name.startsWith('…') && line.name.endsWith('InvoiceLine'))
  assert.ok(result.edges.some(edge => edge.from === invoice.id && edge.to === line.id))
})

test('qualified and flattened titles are shortened while the original schema keys remain available', () => {
  const invoiceKey = 'Billing.InvoiceResponse'
  const lineKey = 'Billing.InvoiceLineResponse'
  const spec = { components: { schemas: {
    [invoiceKey]: { title: 'Company.Product.Billing.Contracts.Invoice', type: 'object' },
    [lineKey]: { title: 'CompanyProductBillingContractsInvoiceLine', type: 'object' },
  } } }
  const { nodes } = buildEntityGraph(spec, [operation('Invoice', ref(invoiceKey)), operation('InvoiceLine', ref(lineKey))])
  assert.equal(nodes.find(node => node.schemaKey === invoiceKey).name, 'Invoice')
  const line = nodes.find(node => node.schemaKey === lineKey)
  assert.equal(line.name, '…BillingContractsInvoiceLine')
})

test('Necto mappings connect entities and associate consumers without a response schema', () => {
  const spec = { components: { schemas: {
    Invoice: { properties: { id: { type: 'integer' } } },
    Line: { properties: { lineId: { type: 'integer' } } },
  } } }
  const producer = operation('Invoices', ref('Invoice'))
  const consumer = operation('Lines', ref('Line'), { parameters: [{ name: 'invoiceId', in: 'path' }] })
  const noResponse = operation('Delete', null, { responses: {}, parameters: [{ name: 'invoiceId', in: 'path' }] })
  const mapping = id => ({ source: { operationId: 'Invoices', property: 'id' }, target: { operationId: id, location: 'parameter', name: 'invoiceId' } })
  const result = buildEntityGraph(spec, [producer, consumer, noResponse], [mapping('Lines'), mapping('Delete'), mapping('Unknown')])
  assert.ok(result.edges.some(edge => edge.kind === 'mapping' && edge.label === 'id → invoiceId'))
  const invoice = result.nodes.find(node => node.name === 'Invoice')
  assert.ok(invoice.endpoints.some(entry => entry.operation.id === 'Delete' && entry.roles.includes('mapped input: invoiceId')))
})

test('recursive models, inheritance, nullable unions and primitive aliases terminate', () => {
  const spec = { components: { schemas: {
    Tree: { properties: { children: { type: 'array', items: ref('Tree') } } },
    Base: { properties: { id: ref('Id') } },
    Child: { allOf: [ref('Base'), { properties: { tree: { anyOf: [ref('Tree'), { type: 'null' }] } } }] },
    Id: { type: 'integer' },
  } } }
  const result = buildEntityGraph(spec, [operation('Get', ref('Child'))])
  assert.equal(result.nodes.length, 3)
  assert.ok(result.edges.some(edge => edge.from === 'schema:Tree' && edge.to === 'schema:Tree'))
  assert.ok(result.edges.some(edge => edge.from === 'schema:Child' && edge.to === 'schema:Base' && edge.label === 'allOf'))
})

test('inline objects, schema parameters, escaped names and empty catalogs', () => {
  const spec = { components: { schemas: { 'A/B': { properties: { name: { type: 'string' } } } } } }
  const result = buildEntityGraph(spec, [operation('Inline', { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
    { parameters: [{ in: 'query', name: 'entity', schema: ref('A~1B') }] })])
  assert.equal(result.nodes.length, 2)
  assert.ok(result.nodes.find(node => node.name === 'A/B').endpoints[0].roles.includes('query entity'))
  assert.ok(result.nodes.some(node => node.id.startsWith('inline:')))
  assert.deepEqual(buildEntityGraph({}, []), { nodes: [], edges: [] })
  const positioned = layoutGraph(result.nodes)
  assert.equal(new Set(positioned.map(node => `${node.x}:${node.y}`)).size, 2)
})

test('nested Preview mapping paths connect their containing model to consumers', () => {
  const spec = { components: { schemas: {
    Envelope: { properties: { lines: { type: 'array', items: ref('Line') } } },
    Line: { properties: { lineId: { type: 'integer' } } },
    Detail: { properties: { lineId: { type: 'integer' } } },
  } } }
  const result = buildEntityGraph(spec, [operation('List', ref('Envelope')),
    operation('Get', ref('Detail'), { parameters: [{ name: 'lineId', in: 'path' }] })], [{
    source: { operationId: 'List', property: 'lineId', eachItem: false, objectPath: ['lines', null] },
    target: { operationId: 'Get', location: 'path', name: 'lineId' },
  }])
  assert.ok(result.edges.some(edge => edge.kind === 'mapping' && edge.from === 'schema:Line' && edge.to === 'schema:Detail'))
})

test('external schemas with identical names stay isolated and cross-API mappings connect them explicitly', () => {
  const spec = { components: { schemas: { Invoice: { properties: { id: { type: 'integer' } } } } } }
  const externalSpec = { components: { schemas: { Invoice: { properties: { remoteOnly: { type: 'string' } } } } } }
  const local = { ...operation('Invoices', ref('Invoice')), apiId: 'local' }
  const external = { ...operation('Invoices', ref('Invoice'), { parameters: [{ name: 'invoiceId', in: 'path' }] }),
    apiId: 'billing', apiName: 'Billing', key: 'billing:GET /Invoices' }
  const result = buildEntityGraph(spec, [local, external], [{
    source: { apiId: 'local', operationId: 'Invoices', property: 'id' },
    target: { apiId: 'billing', operationId: 'Invoices', location: 'path', name: 'invoiceId' },
  }], [{ id: 'billing', name: 'Billing', document: externalSpec }])
  assert.equal(result.nodes.length, 2)
  const localNode = result.nodes.find(node => node.apiId === 'local')
  const remoteNode = result.nodes.find(node => node.apiId === 'billing')
  assert.ok(remoteNode.schema.properties.remoteOnly)
  assert.equal(localNode.endpoints.filter(entry => entry.roles.includes('response 200'))[0].operation.key, local.key)
  assert.equal(remoteNode.endpoints.filter(entry => entry.roles.includes('response 200'))[0].operation.key, external.key)
  assert.ok(result.edges.some(edge => edge.from === localNode.id && edge.to === remoteNode.id && edge.kind === 'mapping'))
})

test('catalog names resolve flattened OpenAPI keys and preserve qualified CLR names for details', () => {
  const key = 'CompanyProductBillingContractsInvoiceLine'
  const qualifiedType = 'Company.Product.Billing.Contracts.InvoiceLine'
  const spec = { components: { schemas: {
    [key]: { title: 'Invoice line response', type: 'object' },
    Alias: { 'x-necto-clr-name': 'Invoice', 'x-necto-clr-full-name': 'Company.Billing.Invoice', type: 'object' },
  } } }
  const { nodes } = buildEntityGraph(spec, [operation('InvoiceLine', ref(key)), operation('Invoice', ref('Alias'))], [], [], [{ kind: 'model', name: qualifiedType }])
  const line = nodes.find(node => node.schemaKey === key)
  assert.equal(line.name, 'InvoiceLine')
  assert.equal(line.qualifiedType, qualifiedType)
  const alias = nodes.find(node => node.schemaKey === 'Alias')
  assert.equal(alias.name, 'Invoice')
  assert.equal(alias.qualifiedType, 'Company.Billing.Invoice')
})

test('only schemas reachable from an operation contract appear in the graph', () => {
  const spec = { components: { schemas: {
    InvoiceDto: { properties: { id: { type: 'integer' } } },
    CreateInvoice: { properties: { lines: { type: 'array', items: ref('CreateInvoiceLine') } } },
    CreateInvoiceLine: { properties: { amount: { type: 'number' } } },
    DatabaseInvoice: { properties: { dto: ref('InvoiceDto'), items: ref('DatabaseLine') } },
    DatabaseLine: { properties: { parent: ref('DatabaseInvoice') } },
  } } }
  const create = operation('Create', ref('InvoiceDto'), {
    requestBody: { content: { 'application/json': { schema: ref('CreateInvoice') } } },
  })
  const catalog = [{ kind: 'model', name: 'DatabaseInvoice' }]
  const { nodes, edges } = buildEntityGraph(spec, [create], [], [], catalog)
  assert.deepEqual(nodes.map(node => node.name), ['CreateInvoice', 'CreateInvoiceLine', 'InvoiceDto'])
  assert.ok(nodes.find(node => node.name === 'CreateInvoiceLine').endpoints[0].roles.includes('request'))
  assert.deepEqual(edges.map(({ from, to }) => [from, to]), [['schema:CreateInvoice', 'schema:CreateInvoiceLine']])
  assert.deepEqual(buildEntityGraph(spec, [], [], [], catalog), { nodes: [], edges: [] })
})
