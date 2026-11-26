import { requestIdentity } from '../workbench/requestContext.js'
import { buildRequest } from './request.js'

export function isResponseStale(operation, configuration, session, values) {
  if (!session.result) return false
  if (session.resultStale) return true
  if (!session.result.requestIdentity) return false
  try {
    return requestIdentity(buildRequest(operation, configuration ?? {}, session, values), session) !==
      session.result.requestIdentity
  } catch {
    return true
  }
}
