import { markRaw, reactive } from 'vue'
import { buildRequest, initialBody, sendRequest } from './request.js'

export function useRequestRunner(configuration) {
  const sessions = reactive(new Map())

  function createSession(operation) {
    return reactive({
      fields: {},
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

  async function run(operation, session, values) {
    if (session.pending) return
    session.error = ''
    session.pending = true
    try {
      const request = buildRequest(operation, configuration.value, session, values)
      const started = performance.now()
      const result = await sendRequest(request)
      if (result.json && typeof result.json === 'object') markRaw(result.json)
      session.result = { ...result, elapsed: Math.round(performance.now() - started) }
    } catch (cause) {
      session.error = cause.message
    } finally {
      session.pending = false
    }
  }

  return { sessions, sessionFor, createSession, run }
}
