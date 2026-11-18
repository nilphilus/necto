import { redactResponse } from './sensitiveSchema.js'
import { historySnapshot } from './historySnapshot.js'
import { shallowReactive } from 'vue'
import { safeRequest, traceBody, redactValue } from './privacy.js'
const MAX_HISTORY = 20,
  MAX_PAYLOAD = 250000,
  MAX_TOTAL = 1000000
export function useRequestHistory() {
  const entries = shallowReactive([])
  function add(operation, request, result, error = '', draft) {
    const oversized =
      typeof request?.options.body === 'string' &&
      request.options.body.length > MAX_PAYLOAD
    const safe = request
      ? safeRequest(
          oversized
            ? { ...request, options: { ...request.options, body: undefined } }
            : request
        )
      : undefined
    const body = safe ? traceBody(safe.options.body) : undefined
    const requestSize = JSON.stringify(body)?.length ?? 0
    const size =
      (result?.rawText?.length ??
        JSON.stringify(result?.json ?? result?.text)?.length ??
        0) + requestSize
    let retained =
      !oversized && size <= MAX_PAYLOAD && !result?.binary && !result?.stream
    let snapshot = retained && request ? historySnapshot(request, draft, operation) : undefined
    if (snapshot && size + JSON.stringify(snapshot).length > MAX_PAYLOAD) { retained = false; snapshot = undefined }
    const payload = retained
      ? redactValue(redactResponse(operation, result))
      : undefined
    const requestMetadata = safe
      ? {
          headers: Object.fromEntries(
            [...safe.options.headers].map(([key, value]) => [
              key,
              value.slice(0, 512)
            ])
          ),
          body: retained ? body : '[body omitted]'
        }
      : undefined
    entries.unshift({
      id: crypto.randomUUID(),
      key: operation.key,
      apiId: operation.apiId ?? 'local',
      name: operation.name,
      method: operation.method,
      at: new Date().toISOString(),
      url: safe?.url.href.slice(0, 4096),
      status: result?.status,
      elapsed: result?.elapsed,
      error,
      request: requestMetadata,
      snapshot,
      payload,
      size:
        (JSON.stringify(payload)?.length ?? 0) +
        (JSON.stringify(requestMetadata)?.length ?? 0) + (JSON.stringify(snapshot)?.length ?? 0),
      omitted: !retained
    })
    if (entries.length > MAX_HISTORY) entries.splice(MAX_HISTORY)
    let total = 0
    for (const entry of entries) {
      total += entry.size
      if (total > MAX_TOTAL) {
        entry.payload = undefined
        entry.snapshot = undefined
        if (entry.request) entry.request.body = '[body omitted]'
        entry.omitted = true
        entry.size = 0
      }
    }
  }
  return {
    entries,
    add,
    clear: () => entries.splice(0),
    clearApi: id => { for (let index = entries.length - 1; index >= 0; index--) if ((entries[index].apiId ?? 'local') === id) entries.splice(index, 1) },
    clearOperation: key => { for (let index = entries.length - 1; index >= 0; index--) if (entries[index].key === key) entries.splice(index, 1) },
    forOperation: (key) => entries.filter((entry) => entry.key === key)
  }
}
export function diffValues(before, after, limit = 100) {
  const result = [],
    stack = [{ before, after, path: '' }]
  let visited = 0
  while (stack.length && result.length < limit && visited++ < 5000) {
    const item = stack.pop(),
      a = item.before,
      b = item.after
    if (Object.is(a, b)) continue
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      Array.isArray(a) === Array.isArray(b) &&
      item.path.split('/').length < 12
    ) {
      const keys = new Set([
        ...Object.keys(a).slice(0, 1000),
        ...Object.keys(b).slice(0, 1000)
      ])
      for (const key of keys)
        stack.push({
          before: Object.hasOwn(a, key) ? a[key] : undefined,
          after: Object.hasOwn(b, key) ? b[key] : undefined,
          path:
            item.path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1')
        })
    } else
      result.push({
        path: item.path || '/',
        before: JSON.stringify(a)?.slice(0, 250) ?? '(missing)',
        after: JSON.stringify(b)?.slice(0, 250) ?? '(missing)'
      })
  }
  return { changes: result, limited: stack.length > 0 }
}
