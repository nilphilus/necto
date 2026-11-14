import { workspaceIdentity } from '../workbench/workspaceIdentity.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { requestIdentity, captureSentRequest } from '../workbench/requestContext.js'
import { useServerProfiles } from '../workbench/serverProfiles.js'
import { markRaw, onScopeDispose, reactive, watch } from 'vue'
import { redactedRequest } from '../authentication/authentication.js'
import { evaluateAssertions, validateAssertions } from '../workbench/assertions.js'
import { useRequestHistory } from '../workbench/history.js'
import { buildRequest, initialBody, sendRequest } from './request.js'

export function useRequestRunner(configuration, authentication) {
  const running = new Set()
  const controllers = new WeakMap()
  const history = useRequestHistory()
  const cancel = () => { history.clear(); for (const controller of running) controller.abort(new Error('Authentication changed. Send the request again.')) }
  if (authentication) watch(authentication.revision, cancel, { flush: 'sync' })
  onScopeDispose(cancel)
  useServerProfiles(configuration, () => { for (const controller of running) controller.abort(new Error('API server changed. Send the request again.')) })
  const sessions = reactive(new Map())
  watch(() => workspaceIdentity(configuration.value), (next, previous) => { if (previous && next !== previous) { cancel(); sessions.clear() } }, { flush: 'sync' })

  function createSession(operation) {
    return reactive({
      apiId: operation.apiId ?? 'local',
      fields: {},
      assertions: [],
      serverValues: {},
      timeout: 30000,
      responseLimitMiB: 32,
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

  function prepare(operation, session, values) {
    const request = buildRequest(operation, configuration.value, session, values)
    const api = authentication?.apis.get(operation.apiId ?? 'local')
    if (api && !api.origins?.includes(request.url.origin)) authentication.register({ ...api, origins: [...(api.origins ?? []), request.url.origin] })
    return authentication ? authentication.apply(request, operation) : request
  }

  async function run(operation, session, values, { signal, onRequest } = {}) {
    if (session.pending) return
    session.error = ''
    session.pending = true
    const controller = new AbortController()
    running.add(controller)
    controllers.set(session, controller)
    let timeout
    let request
    try {
      const policy = executionOptions(session)
      timeout = setTimeout(() => controller.abort(new Error("Request timed out.")), policy.timeout)
      validateAssertions(session.assertions ?? [])
      const identity = requestIdentity(buildRequest(operation, configuration.value, session, values), session)
      request = prepare(operation, session, values)
      const snapshot = captureSentRequest(request, session)
      const sentRequest = snapshot ? markRaw(snapshot) : undefined
      request.options.signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      onRequest?.(redactedRequest(request))
      const started = performance.now()
      const result = await sendRequest(request, { responseLimitBytes: policy.responseLimitMiB * 1024 * 1024, onProgress: progress => {
        session.result = { ...progress, requestIdentity: identity, sentRequest, elapsed: Math.round(performance.now() - started) }
      } })
      if (result.json && typeof result.json === 'object') markRaw(result.json)
      session.resultStale = false
      session.result = { ...result, requestIdentity: identity, sentRequest, elapsed: Math.round(performance.now() - started) }
      session.result.assertions = evaluateAssertions(session.assertions ?? [], session.result)
      try { history.add(operation, request, session.result, '', session) } catch { /* History must not change the outcome of a sent request. */ }
      return session.result
    } catch (cause) {
      if (session.result) session.resultStale = true
      session.error = controller.signal.aborted ? controller.signal.reason?.message ?? 'Request canceled.' : signal?.aborted ? 'Request canceled.' : cause.message
      try { history.add(operation, request, undefined, session.error, session) } catch { /* Metadata retention is optional. */ }
      if (session.result?.receiving) session.result.receiving = false
      if (session.result?.stream) { session.result.stream.done = true; session.result.stream.reason = session.error }

      return null
    } finally {
      clearTimeout(timeout)
      controllers.delete(session)
      running.delete(controller)
      session.pending = false
    }
  }

  return { sessions, sessionFor, createSession, run, prepare, history, cancel: session => controllers.get(session)?.abort(new Error('Request canceled.')) }
}
