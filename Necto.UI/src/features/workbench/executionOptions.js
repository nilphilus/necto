export const DEFAULT_TIMEOUT = 30000
export const DEFAULT_RESPONSE_LIMIT_MIB = 32
export function executionOptions(draft = {}) {
  const timeout = draft.timeout === undefined ? DEFAULT_TIMEOUT : draft.timeout
  const responseLimitMiB = draft.responseLimitMiB === undefined ? DEFAULT_RESPONSE_LIMIT_MIB : draft.responseLimitMiB
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) throw new Error('Timeout must be a whole number from 1 to 600000 ms.')
  if (!Number.isInteger(responseLimitMiB) || responseLimitMiB < 1 || responseLimitMiB > 512) throw new Error('Response budget must be a whole number from 1 to 512 MiB.')
  return { timeout, responseLimitMiB }
}
