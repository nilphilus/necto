const reasons = {
  RESPONSE_LIMIT_EXCEEDED: 'Response exceeded the configured preview budget.',
  TIMEOUT: 'Request exceeded the configured timeout.',
  NETWORK_ERROR: 'Could not receive the response. Check connectivity, TLS and redirect policy.',
  BINDING_ERROR: 'Could not resolve a response binding from an earlier step.',
  HTTP_ERROR: 'Response HTTP status was not accepted.',
  ASSERTION_FAILED: 'Response checks failed.',
  ORIGIN_MISMATCH: 'Request origin differs from the configured base URL.',
  CANCELED: 'Scenario execution was canceled.',
  REQUEST_ERROR: 'Could not prepare or execute this request.'
}
// Fixed messages and allowlisted numeric context only. Never include exceptions,
// response values, URLs, headers or credential material in failure diagnostics.
export function failureDiagnostic(input, policy = {}, httpStatus) {
  const code = Object.hasOwn(reasons, input) ? input : 'REQUEST_ERROR'
  const result = { code, message: reasons[code] }
  if (code === 'RESPONSE_LIMIT_EXCEEDED' && Number.isInteger(policy.responseLimitMiB) && policy.responseLimitMiB >= 1 && policy.responseLimitMiB <= 512) result.limitMiB = policy.responseLimitMiB
  if (code === 'TIMEOUT' && Number.isInteger(policy.timeout) && policy.timeout >= 1 && policy.timeout <= 600000) result.timeoutMs = policy.timeout
  if (Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) result.httpStatus = httpStatus
  return result
}
