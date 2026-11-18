import { buildRequest, resolveRequestTarget } from '../request-runner/request.js'
import { safeRequest } from './privacy.js'
export function effectiveTarget(operation, configuration, session, values = new Map()) {
  const {
    url: base,
    server,
    source,
  } = resolveRequestTarget(operation, configuration ?? {}, session)
  let url = base.href,
    complete = false
  try {
    const request = buildRequest(operation, configuration ?? {}, session, values)
    url = safeRequest({
      ...request,
      options: { ...request.options, body: undefined },
    }).url.href
    complete = true
  } catch {
    /* Base target remains available while inputs are incomplete. */
  }
  return {
    label: `${server?.description ? server.description + ' · ' : ''}${base.host}${base.pathname === '/' ? '' : base.pathname.replace(/\/$/, '')}`,
    url,
    complete,
    api: operation.apiName ?? 'Local API',
    source,
  }
}
