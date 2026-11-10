import { reactive } from 'vue'
import { buildRequest, initialBody, sendRequest } from './request.js'

export function useRequestRunner(configuration) {
  const sessions = reactive(new Map())

  function sessionFor(operation) {
    if (!sessions.has(operation.key)) {
      sessions.set(operation.key, {
        fields: {},
        body: initialBody(operation),
        panel: 'request',
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
      session.result = await sendRequest(buildRequest(operation, configuration.value, session))
      session.panel = 'response'
    } catch (cause) {
      session.error = cause.message
    } finally {
      session.pending = false
    }
  }

  return { sessions, sessionFor, run }
}
