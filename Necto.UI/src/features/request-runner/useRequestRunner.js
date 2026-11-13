import { markRaw, onScopeDispose, reactive, watch } from 'vue'
import { redactedRequest } from '../authentication/authentication.js'
import { buildRequest, initialBody, sendRequest } from './request.js'

export function useRequestRunner(configuration, authentication) {
  const running = new Set()
  const cancel = () => { for (const controller of running) controller.abort(new Error('Authentication changed. Send the request again.')) }
  if (authentication) watch(authentication.revision, cancel, { flush: 'sync' })
  onScopeDispose(cancel)
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

  function sessionFor(operation, initialize = createSession) {
    if (!sessions.has(operation.key)) {
      sessions.set(operation.key, initialize(operation))
    }
    return sessions.get(operation.key)
  }

  async function run(operation, session, values, { signal, onRequest } = {}) {
    if (session.pending) return
    session.error = ''
    session.pending = true
    const controller = new AbortController()
    running.add(controller)
    try {
      const draft = buildRequest(operation, configuration.value, session, values)
      const request = authentication ? authentication.apply(draft, operation) : draft
      request.options.signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      onRequest?.(redactedRequest(request))
      const started = performance.now()
      const result = await sendRequest(request)
      if (result.json && typeof result.json === 'object') markRaw(result.json)
      session.resultStale = false
      session.result = { ...result, elapsed: Math.round(performance.now() - started) }
      return session.result
    } catch (cause) {
      session.error = signal?.aborted ? 'Request canceled.' : cause.message
      return null
    } finally {
      running.delete(controller)
      session.pending = false
    }
  }

  return { sessions, sessionFor, createSession, run }
}
