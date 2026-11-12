import { onScopeDispose, reactive, ref, watch } from 'vue'
import { MAX_QUERY_LENGTH } from './search.js'

export function usePayloadSearch(result) {
  const query = ref(''), scope = ref('all'), caseSensitive = ref(false), exact = ref(false)
  const state = reactive({ pending: false, matches: [], total: 0, page: 1, pages: 1, scanned: 0, error: '', cancelled: false })
  let worker, timer, requestId = 0
  const listeners = new Set()
  function disposeWorker() {
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = null }
  }
  function clearState() { Object.assign(state, { pending: false, matches: [], total: 0, page: 1, pages: 1, scanned: 0, error: '', cancelled: false }) }
  function notify() { for (const listener of listeners) listener() }
  function launch(page = 1) {
    clearTimeout(timer)
    if (!query.value.trim()) { clearState(); disposeWorker(); notify(); return }
    const id = ++requestId
    Object.assign(state, { pending: true, scanned: 0, error: '', cancelled: false })
    try {
      if (query.value.length > MAX_QUERY_LENGTH) throw new Error(`Use at most ${MAX_QUERY_LENGTH} characters.`)
      if (!worker) {
        if (typeof Worker === 'undefined') throw new Error('This browser does not support background response search.')
        const instance = new Worker(new URL('./search.worker.js', import.meta.url), { type: 'module' })
        worker = instance
        instance.onmessage = ({ data }) => {
          if (worker !== instance || data.id !== requestId) return
          if (data.type === 'progress') state.scanned = data.scanned
          else if (data.type === 'result') { Object.assign(state, data, { pending: false, error: '', cancelled: false }); notify() }
          else if (data.type === 'error') { state.pending = false; state.error = data.message }
        }
        instance.onerror = () => {
          if (worker !== instance) return
          state.pending = false; state.error = 'Could not search this response. Preview and download remain available.'
          disposeWorker()
        }
        instance.postMessage({ type: 'init', id, text: result.value.rawText ?? result.value.text })
      }
      worker.postMessage({ type: 'search', id, query: query.value, scope: scope.value,
        caseSensitive: caseSensitive.value, exact: exact.value, page })
    } catch (cause) { state.pending = false; state.error = cause.message; disposeWorker() }
  }
  watch([query, scope, caseSensitive, exact], () => {
    clearTimeout(timer); requestId++
    worker?.postMessage({ type: 'cancel' })
    clearState(); notify()
    if (!query.value.trim()) { disposeWorker(); return }
    state.pending = true
    timer = setTimeout(() => launch(), 250)
  })
  watch(result, () => {
    clearTimeout(timer); requestId++; disposeWorker(); query.value = ''; clearState(); notify()
  })
  function stop() {
    clearTimeout(timer); requestId++; disposeWorker(); state.pending = false; state.cancelled = true
  }
  onScopeDispose(() => { clearTimeout(timer); disposeWorker(); listeners.clear() })
  return { query, scope, caseSensitive, exact, state, search: launch, stop,
    onResults: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
}
