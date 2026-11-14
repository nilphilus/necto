import { searchPayload } from './search.js'
let document, ready = false, generation = 0, cache = null
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    generation++; cache = null; ready = false
    try { document = JSON.parse(data.text); ready = true }
    catch { self.postMessage({ type: 'error', id: data.id, message: 'Could not prepare this response for search.' }) }
    return
  }
  if (data.type === 'cancel') { generation++; return }
  if (data.type !== 'search') return
  const current = ++generation
  if (!ready) { self.postMessage({ type: 'error', id: data.id, message: 'The response search index is unavailable.' }); return }
  const key = JSON.stringify([data.query, data.scope, data.caseSensitive, data.exact, data.field])
  try {
    const result = await searchPayload(document, { ...data,
      knownTotal: cache?.key === key ? cache.total : undefined,
      shouldCancel: () => current !== generation,
      onProgress: scanned => { if (current === generation) self.postMessage({ type: 'progress', id: data.id, scanned }) },
    })
    if (result.cancelled || current !== generation) return
    cache = { key, total: result.total }
    self.postMessage({ type: 'result', id: data.id, ...result })
  } catch (cause) {
    if (current === generation) self.postMessage({ type: 'error', id: data.id, message: cause.message })
  }
}
