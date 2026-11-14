import { buildRequest, requestUrl } from '../request-runner/request.js'
import { safeRequest } from './privacy.js'
export function effectiveTarget(operation, configuration, session, values = new Map()) {
  const apiId = operation.apiId ?? 'local'
  const selected = operation.servers?.[session.serverIndex]
  const server = selected ? { ...selected, values: session.serverValues ?? {} } : configuration?.serverProfiles?.[apiId]
  const scoped = operation.configuration ? { ...operation.configuration, serverProfiles: configuration?.serverProfiles } : configuration ?? {}
  const base = requestUrl(server ? { ...operation, requestServer: server } : operation, scoped)
  let url = base.href, complete = false
  try {
    const request = buildRequest(operation, configuration ?? {}, session, values)
    url = safeRequest({ ...request, options: { ...request.options, body: undefined } }).url.href
    complete = true
  } catch { /* Base target remains available while inputs are incomplete. */ }
  return { label: `${(server ?? operation.server)?.description ? (server ?? operation.server).description + ' · ' : ''}${base.host}${base.pathname === '/' ? '' : base.pathname.replace(/\/$/, '')}`, url, complete, api: operation.apiName ?? 'Local API', source: selected ? 'This request' : server ? 'API default' : 'API configuration' }
}
