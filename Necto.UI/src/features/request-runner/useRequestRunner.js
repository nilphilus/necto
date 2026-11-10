import { reactive } from 'vue'
import { buildRequest, initialBody, sendRequest } from './request.js'

export function useRequestRunner(configuration) {
  const sessions = reactive(new Map())

  function sessionFor(operation) {
    if (!sessions.has(operation.key)) {
      sessions.set(operation.key, {
        fields: {},
        body: initialBody(operation),
        result: null,
        pending: false,
        error: '',
      })
    }
    return sessions.get(operation.key)
  }

  async function run(operation) {
    const session = sessionFor(operation)
    if (session.pending) return
    session.error = ''
    session.pending = true
    try {
      const request = buildRequest(operation, configuration.value, session)
      const started = performance.now()
      const result = await sendRequest(request)
      session.result = { ...result, elapsed: Math.round(performance.now() - started) }
    } catch (cause) {
      session.error = cause.message
    } finally {
      session.pending = false
    }
  }

  return { sessions, sessionFor, run }
}
