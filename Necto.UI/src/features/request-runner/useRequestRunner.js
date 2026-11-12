import { markRaw, reactive } from 'vue'
import { buildRequest, initialBody, sendRequest } from './request.js'

export function useRequestRunner(configuration) {
  const sessions = reactive(new Map())

  function createSession(operation) {
    return reactive({
      apiId: operation.apiId ?? 'local',
      fields: {},
      bindings: [],
      body: initialBody(operation),
      result: null,
      pending: false,
      error: '',
    })
  }

  function sessionFor(operation) {
    if (!sessions.has(operation.key)) {
      sessions.set(operation.key, createSession(operation))
    }
    return sessions.get(operation.key)
  }

  async function run(operation, session, values, { signal } = {}) {
    if (session.pending) return
    session.error = ''
    session.pending = true
    try {
      const request = buildRequest(operation, configuration.value, session, values)
      if (signal) request.options.signal = signal
      const started = performance.now()
      const result = await sendRequest(request)
      if (result.json && typeof result.json === 'object') markRaw(result.json)
      session.result = { ...result, elapsed: Math.round(performance.now() - started) }
      return session.result
    } catch (cause) {
      session.error = signal?.aborted ? 'Request canceled.' : cause.message
      return null
    } finally {
      session.pending = false
    }
  }

  return { sessions, sessionFor, createSession, run }
}
