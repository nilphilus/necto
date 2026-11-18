const json = (value, status = 200, headers) => Response.json(value, { status, headers })
const problem = (status, detail) => Response.json({ status, detail }, {
  status, headers: { 'Content-Type': 'application/problem+json' },
})
const notFound = () => problem(404, 'Record not found in this tenant.')
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0
const amount = (lines) => lines.reduce((sum, line) => sum + line.amount, 0)

function lineFor(input, tenant, buildingId) {
  if (!input || !positiveInteger(input.assetId) || !positiveInteger(input.quantity) ||
      typeof input.description !== 'string' || !input.description.trim() ||
      typeof input.unitPrice !== 'number' || input.unitPrice < 0 ||
      !Number.isFinite(input.unitPrice * input.quantity)) return null
  const asset = tenant.assets.find((item) => item.id === input.assetId && item.buildingId === buildingId)
  if (!asset) return null
  return {
    assetId: asset.id, assetName: asset.name, description: input.description,
    quantity: input.quantity, unitPrice: input.unitPrice, amount: input.quantity * input.unitPrice,
  }
}

function invoiceSummary({ lines, customer, ...invoice }) {
  return { ...invoice, customerName: customer.name }
}

export function createDemoApi(seed, apiUrl) {
  const tenants = new Map(Object.entries(seed).map(([name, data]) => [
    name, { ...structuredClone(data), nextId: 1000 },
  ]))
  const base = new URL(apiUrl)
  return async function handle(request) {
    request.signal.throwIfAborted()
    const url = new URL(request.url)
    const relative = url.pathname.slice(base.pathname.length).replace(/\/$/, '')
    const [resource, idText, child, ...tail] = relative.split('/')
    if (tail.length || !['customers', 'buildings', 'assets', 'invoices'].includes(resource))
      return notFound()

    const tenantName = request.headers.get('X-Tenant')
    if (!tenantName?.trim() || tenantName.includes(',')) return problem(400, 'Provide one X-Tenant header.')
    const tenant = tenants.get(tenantName)
    if (!tenant) return problem(404, 'Tenant not found.')
    const id = /^\d+$/.test(idText ?? '') ? Number(idText) : undefined
    if (idText !== undefined && !positiveInteger(id)) return notFound()

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (child) return notFound()
      const collection = tenant[resource]
      if (id !== undefined) {
        const record = collection.find((item) => item.id === id)
        return record ? json(record) : notFound()
      }
      const filters = resource === 'invoices' ? ['buildingId', 'customerId']
        : resource === 'assets' ? ['buildingId'] : resource === 'buildings' ? ['ownerCustomerId'] : []
      if (filters.some((field) => url.searchParams.has(field) && !positiveInteger(Number(url.searchParams.get(field)))))
        return problem(400, 'Query filters must be positive integers.')
      const records = collection.filter((item) => filters.every((field) =>
        !url.searchParams.has(field) || item[field] === Number(url.searchParams.get(field))))
      return json(resource === 'invoices' ? records.map(invoiceSummary) : records)
    }

    if (request.method !== 'POST' || resource !== 'invoices' || id !== undefined && child !== 'lines')
      return problem(405, 'Method not supported by this demo.')

    let input
    try { input = await request.json() }
    catch { return problem(400, 'Enter a JSON request body.') }
    request.signal.throwIfAborted()
    const created = (invoice) => json(invoice, 201, { Location: new URL(`invoices/${invoice.id}`, apiUrl).href })

    if (id !== undefined) {
      const index = tenant.invoices.findIndex((item) => item.id === id)
      const invoice = tenant.invoices[index]
      if (!invoice) return notFound()
      if (invoice.issuedOn) return problem(409, 'Only draft invoices can be changed.')
      const line = lineFor(input, tenant, invoice.buildingId)
      if (!line) return problem(400, 'Enter a valid line for an asset in this building.')
      if (invoice.lines.some((item) => item.assetId === line.assetId))
        return problem(409, 'The asset is already on this invoice.')
      const lines = [...invoice.lines, line]
      const total = amount(lines)
      if (!Number.isFinite(total)) return problem(400, 'The invoice total is too large.')
      const updated = { ...invoice, lines, total }
      tenant.invoices[index] = updated
      return created(updated)
    }

    if (!input || !positiveInteger(input.buildingId) || typeof input.currency !== 'string' ||
        !/^[A-Z]{3}$/.test(input.currency) || (input.lines !== undefined && !Array.isArray(input.lines)))
      return problem(400, 'Choose a building, a three-letter currency and valid invoice lines.')
    const building = tenant.buildings.find((item) => item.id === input.buildingId)
    if (!building) return notFound()
    const lines = (input.lines ?? []).map((line) => lineFor(line, tenant, building.id))
    if (lines.some((line) => !line) || new Set(lines.map((line) => line.assetId)).size !== lines.length)
      return problem(400, 'Each line must reference a distinct asset in this building.')
    const total = amount(lines)
    if (!Number.isFinite(total)) return problem(400, 'The invoice total is too large.')
    const invoice = {
      id: tenant.nextId++, buildingId: building.id, buildingName: building.name,
      customer: building.owner, customerId: building.owner.id, currency: input.currency,
      issuedOn: null, lines, total,
    }
    tenant.invoices.push(invoice)
    return created(invoice)
  }
}
