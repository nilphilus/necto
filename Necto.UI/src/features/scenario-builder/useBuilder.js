import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { workspaceIdentity } from '../workbench/workspaceIdentity.js'
import { onWorkspaceImport } from '../workbench/workspaceUpdates.js'
import { payloadSnapshot } from '../workbench/body.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { newBlueprint, validateBlueprint, parseHuman } from './model.js'
import { prepareBlueprint, executeBlueprint } from './runner.js'
import { waitOptions } from './waiting.js'

const clone = value => JSON.parse(JSON.stringify(value))
export function savedBlueprint(draft) {
  const saved = clone({ format: draft.format, version: 2, id: draft.id, name: draft.name.trim(), concurrency: draft.concurrency,
    steps: draft.steps.map(step => ({ id: step.id, label: step.label.trim(), operationKey: step.operationKey, apiId: step.apiId, method: step.method, path: step.path,
      ...waitOptions(step), dependsOn: [...step.dependsOn], inputs: step.inputs.map(input => ({ location: input.location,
        ...(input.location === 'body' ? { pointer: input.pointer } : { name: input.name }), source: input.source,
        ...(input.source === 'response' ? { stepId: input.stepId, responsePointer: input.responsePointer } : input.source === 'human' ? { prompt: input.prompt, valueType: input.valueType } : { generator: input.generator, ...(input.generator === 'regex' ? { pattern: input.pattern } : {}) }) })),
      request: { fields: { ...step.request.fields }, body: step.request.body, ...payloadSnapshot(step.request), ...executionOptions(step.request),
        assertions: step.request.assertions ?? [], serverIndex: step.request.serverIndex, serverValues: step.request.serverValues ?? {} } })) })
  validateBlueprint(saved)
  return saved
}
export function useBuilder(configuration) {
  const draft = ref(newBlueprint()), saved = ref([]), error = ref(''), notice = ref('')
  const execution = reactive({ status: 'idle', steps: [], error: '', stale: false }), pending = ref(false), questions = reactive(new Map())
  const key = computed(() => workspaceIdentity(configuration.value) && 'necto:scenario-builder:' + workspaceIdentity(configuration.value))
  const dirty = computed(() => JSON.stringify(savedBlueprintSafe(draft.value)) !== JSON.stringify(saved.value.find(item => item.id === draft.value.id)))
  let controller, revision = 0
  function savedBlueprintSafe(value) { try { return savedBlueprint(value) } catch { return value } }
  function stop() { controller?.abort() }
  function invalidate(ids) {
    if (ids && !execution.steps.some(step => ids.includes(step.operation.apiId ?? 'local'))) return
    revision++; clearRun()
  }
  function clearRun() { stop(); questions.clear(); Object.assign(execution, { status: 'idle', steps: [], error: '', stale: false }) }
  function load() {
    saved.value = []; error.value = ''
    if (!key.value) return
    try {
      const data = JSON.parse(localStorage.getItem(key.value))
      if (data !== null && (data.version !== 1 || !Array.isArray(data.blueprints) || data.blueprints.length > 100)) throw new Error('Invalid builder collection.')
      const next = data?.blueprints ?? []
      next.forEach(validateBlueprint)
      if (new Set(next.map(item => item.id)).size !== next.length) throw new Error('Duplicate builder IDs.')
      saved.value = next
    } catch (cause) { error.value = `Could not load Scenario Builder. ${cause.message}` }
  }
  watch(key, () => { revision++; clearRun(); draft.value = newBlueprint(); notice.value = ''; load() }, { immediate: true, flush: 'sync' })
  onWorkspaceImport(key, load)
  onScopeDispose(() => { revision++; stop() })
  function persist(next) {
    if (!key.value) throw new Error('Load an API before saving.')
    const text = JSON.stringify({ version: 1, blueprints: next })
    if (next.length > 100 || text.length > 2 * 1024 * 1024) throw new Error('Builder storage is limited to 100 scenarios and 2 MB per workspace.')
    try { localStorage.setItem(key.value, text) } catch { throw new Error('Could not save in this browser. Export the definition instead.') }
    saved.value = next
  }
  function save() {
    if (pending.value) return
    const blueprint = savedBlueprint(draft.value)
    persist([...saved.value.filter(item => item.id !== blueprint.id), blueprint])
    notice.value = 'Saved in this browser. Run inputs and responses are not included.'
  }
  function open(blueprint) { if (pending.value) return; clearRun(); draft.value = { ...clone(blueprint), version: 2 }; notice.value = ''; error.value = '' }
  function fresh() { open(newBlueprint()) }
  function remove() { if (pending.value) return; persist(saved.value.filter(item => item.id !== draft.value.id)); fresh() }
  function ask(step, inputs, signal) {
    return new Promise((resolve, reject) => {
      const aborted = () => { questions.delete(step.id); reject(signal.reason ?? new Error('Canceled.')) }
      if (signal.aborted) { aborted(); return }
      signal.addEventListener('abort', aborted, { once: true })
      questions.set(step.id, { step, inputs, values: inputs.map(() => ''), error: '', submit() {
        try {
          const answers = inputs.map((input, index) => parseHuman(this.values[index], input.valueType))
          signal.removeEventListener('abort', aborted); questions.delete(step.id); resolve(answers)
        } catch (cause) { this.error = cause.message }
      } })
    })
  }
  async function run(context, execute, allowHuman) {
    if (pending.value) return
    error.value = ''; notice.value = ''
    const plan = prepareBlueprint(draft.value, context)
    if (!allowHuman && plan.some(step => step.inputs.some(input => input.source === 'human'))) throw new Error('Enable human-in-the-loop for steps that ask for input.')
    const runRevision = revision
    Object.assign(execution, { status: 'running', steps: plan, error: '', stale: false })
    const current = controller = new AbortController(); pending.value = true
    try {
      const outcome = await executeBlueprint(execution.steps, { concurrency: draft.value.concurrency, execute, signal: current.signal, ask: allowHuman ? ask : undefined })
      if (revision === runRevision) Object.assign(execution, outcome)
    } finally {
      // A canceled run must not retain human answers in its prompt queue.
      questions.clear(); pending.value = false
      if (controller === current) controller = undefined
    }
  }
  return { draft, saved, dirty, error, notice, execution, pending, questions, save, open, fresh, remove, stop, run, invalidate }
}
