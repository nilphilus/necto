import { ref, shallowReactive } from 'vue'
import { API_ACCESS, authorizeRequest, httpOrigin, validateCredential } from './authentication.js'

export function useAuthentication() {
  const apis = shallowReactive(new Map())
  const revision = ref(0)
  const fingerprint = scheme => JSON.stringify([scheme?.type, scheme?.scheme?.toLowerCase(), scheme?.in, scheme?.name, scheme?.openIdConnectUrl, scheme?.flows?.authorizationCode?.authorizationUrl, scheme?.flows?.authorizationCode?.tokenUrl])
  function register(input) {
    const previous = apis.get(input.id)
    const signature = JSON.stringify([input.configuration.openApiUrl, input.configuration.apiBaseUrl, input.configuration.overrideServer])
    const retain = previous && (previous.signature === signature || previous.bootstrap && httpOrigin(previous.configuration.openApiUrl) === httpOrigin(input.configuration.openApiUrl))
    const schemes = { ...(retain && !input.document ? previous.schemes : {}), ...input.schemes }
    const credentials = retain ? Object.fromEntries(Object.entries(previous.credentials).filter(([name]) => schemes[name] && fingerprint(previous.schemes[name]) === fingerprint(schemes[name]))) : {}
    apis.set(input.id, { ...input, signature, credentials, schemes, access: retain ? previous.access : undefined, accessScheme: retain ? previous.accessScheme : undefined })
    if (previous && ((!retain && previous.access) || Object.keys(credentials).length !== Object.keys(previous.credentials).length)) revision.value++
  }
  function save(id, name, scheme, values) {
    const api = apis.get(id)
    if (!api) throw new Error('This API connection is no longer available.')
    const credential = validateCredential(scheme, values, api.configuration.openApiUrl)
    const transport = definition => ['oauth2', 'openIdConnect'].includes(definition?.type) || definition?.type === 'http' ? 'header:authorization'
      : definition?.type === 'apiKey' ? `${definition.in}:${definition.in === 'header' ? definition.name.toLowerCase() : definition.name}` : 'browser-session'
    let access = api.access
    const credentials = { ...api.credentials }
    if (credential.metadata) {
      for (const [key, previous] of Object.entries(credentials)) if (previous.metadata && transport(api.schemes[key]) === transport(scheme)) credentials[key] = { ...previous, metadata: false }
      if (access?.metadata && transport(api.accessScheme) === transport(scheme)) access = { ...access, metadata: false }
    }
    apis.set(id, name === API_ACCESS ? { ...api, credentials, access: credential, accessScheme: scheme } : { ...api, access, credentials: { ...credentials, [name]: credential }, schemes: { ...api.schemes, [name]: scheme } })
    revision.value++
  }
  function clear(id, name) {
    const api = apis.get(id)
    if (!api) return
    const credentials = { ...api.credentials }
    if (name) delete credentials[name]
    else for (const key of Object.keys(credentials)) delete credentials[key]
    apis.set(id, { ...api, credentials, access: !name || name === API_ACCESS ? undefined : api.access }); revision.value++
  }
  function remove(id) { const had = apis.get(id); apis.delete(id); if (had && (Object.keys(had.credentials).length || had.access)) revision.value++ }
  function apply(request, operation) { return authorizeRequest(request, operation, apis.get(operation.apiId ?? 'local')) }
  function metadataOptions(url, id = 'local', options = {}) {
    const api = apis.get(id)
    if (!api) return options
    const target = new URL(url, api.configuration.openApiUrl)
    const known = [api.configuration.openApiUrl, api.configuration.endpointMappingsUrl, api.configuration.configurationUrl].filter(Boolean).map(value => new URL(value, api.configuration.openApiUrl).href)
    if (!known.includes(target.href)) return options
    const selected = Object.entries(api.credentials).filter(([, value]) => value.metadata && value.origins.includes(target.origin)).map(([name, credential]) => ({ scheme: api.schemes[name], credential }))
    if (api.access?.metadata && api.access.origins.includes(target.origin)) selected.push({ scheme: api.accessScheme, credential: api.access })
    if (!selected.length) return options
    const schemes = {}, credentials = {}, required = {}
    selected.forEach((entry, index) => { const name = `metadata${index}`; schemes[name] = entry.scheme; credentials[name] = entry.credential; required[name] = [] })
    const request = authorizeRequest({ url: target, options: { ...options, headers: new Headers(options.headers) } },
      { security: [required], apiId: id }, { schemes, credentials })
    return { ...request.options, authenticatedUrl: request.url }
  }

  async function metadataFetch(url, id = 'local', options = {}) {
    const { authenticatedUrl, ...settings } = metadataOptions(url, id, options)
    return fetch(authenticatedUrl ?? url, settings)
  }
  return { apis, revision, register, save, clear, remove, apply, metadataFetch }
}
