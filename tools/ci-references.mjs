import { bundleReferences, DOCUMENT_LIMIT } from '../Necto.UI/src/features/workbench/document.js'
import { readBoundedText } from '../Necto.UI/src/features/workbench/response.js'

export function referenceOrigin(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('--allow-ref-origin requires an HTTP(S) origin without a path, credentials, query or fragment.')
  return url.origin
}

// An allowlisted origin is an explicit network permission, including for internal services.
// The API base origin is deliberately not implicitly allowed for metadata requests.
export async function resolveCiReferences(document, baseUrl, { allowedOrigins = [], timeout = 30000, fetcher = fetch } = {}) {
  const allowed = new Set(allowedOrigins.map(referenceOrigin))
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) throw new Error('Reference timeout must be between 1 and 600000 ms.')
  const signal = AbortSignal.timeout(timeout)
  let remaining = 16 * 1024 * 1024
  return bundleReferences(document, baseUrl, async (target, options) => {
    const url = new URL(target)
    if (!allowed.has(url.origin)) throw new Error('External references are disabled for this origin. Use a bundled CI export or explicitly allow a trusted origin with --allow-ref-origin.')
    signal.throwIfAborted()
    if (remaining <= 0) throw new Error('External references exceed the total 16 MiB byte budget.')
    const response = await fetcher(url, { ...options, credentials: 'omit', redirect: 'error', signal })
    if (!response.ok) throw new Error(`External reference HTTP ${response.status}`)
    const result = await readBoundedText(response, { signal, responseLimitBytes: Math.min(DOCUMENT_LIMIT, remaining) })
    remaining -= result.bytes
    signal.throwIfAborted()
    return new Response(result.text, { headers: { 'Content-Type': 'application/yaml' } })
  })
}
