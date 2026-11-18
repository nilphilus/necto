import { createDemoApi } from './api.js'

export async function installDemo() {
  const base = new URL('.', document.baseURI)
  const apiBase = new URL('api/', base)
  const originalFetch = globalThis.fetch.bind(globalThis)
  async function fixture(name) {
    const response = await originalFetch(new URL(`fixtures/${name}.json`, base))
    if (!response.ok) throw new Error('Could not load the demo fixture.')
    return response.json()
  }
  const [{ document: contract, mappings }, seed] = await Promise.all([
    fixture('contract'), fixture('seed'),
  ])
  const openApiUrl = new URL('openapi.json', base)
  const mappingsUrl = new URL('endpoint-mappings', base)
  const configurationUrl = new URL('configuration', base)
  const settings = {
    openApiUrl: openApiUrl.href, apiBaseUrl: apiBase.href, endpointMappingsUrl: mappingsUrl.href,
  }
  // The exported contract describes the sample server; the browser owns the demo transport.
  const servers = [{ url: apiBase.href }]
  contract.servers = servers
  for (const path of Object.values(contract.paths)) {
    if (path.servers) path.servers = servers
    for (const item of Object.values(path))
      if (item?.servers) item.servers = servers
  }

  try {
    const key = 'necto:environments:' + openApiUrl.href
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({
        version: 2, active: ['Acme'],
        presets: [
          ['Acme', [['X-Tenant', { value: 'acme' }]]],
          ['Northstar', [['X-Tenant', { value: 'northstar' }]]],
        ],
      }))
    }
  } catch { /* Presets can still be entered manually when storage is unavailable. */ }

  const handle = createDemoApi(seed, apiBase)
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, base)
    const isApi = url.origin === apiBase.origin && url.pathname.startsWith(apiBase.pathname)
    const fixtures = url.href === configurationUrl.href ? settings
      : url.href === openApiUrl.href ? contract : url.href === mappingsUrl.href ? mappings : undefined
    if (fixtures === undefined && !isApi) return originalFetch(input, options)
    const request = new Request(input instanceof Request ? input : url, options)
    request.signal.throwIfAborted()
    return fixtures === undefined ? handle(request) : Response.json(fixtures)
  }
}
