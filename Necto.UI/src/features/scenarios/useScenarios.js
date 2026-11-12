import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { executeScenario, prepareScenario, snapshotScenario, validateScenario } from './scenario.js'

export function useScenarios(configuration) {
  const scenarios = ref([])
  const error = ref('')
  const state = reactive({ id: '', name: '', status: 'idle', steps: [], error: '' })
  const runs = reactive(new Map())
  const pending = ref(false)
  let controller
  const key = computed(() => configuration.value?.openApiUrl && `necto:scenarios:${configuration.value.openApiUrl}`)
  const stop = () => controller?.abort()
  onScopeDispose(stop)
  watch(key, storageKey => {
    stop(); runs.clear(); scenarios.value = []; error.value = ''
    if (!storageKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved === null) return
      if (saved.version !== 1 || !Array.isArray(saved.scenarios)) throw new Error('Unsupported scenario file.')
      for (const scenario of saved.scenarios) validateScenario(scenario)
      if (new Set(saved.scenarios.map(scenario => scenario.id)).size !== saved.scenarios.length) throw new Error('Duplicate scenario IDs.')
      scenarios.value = saved.scenarios
    } catch (cause) { error.value = `Could not load saved scenarios. ${cause.message}` }
  }, { immediate: true })
  function persist(next) {
    if (!key.value) throw new Error('Load an API before saving scenarios.')
    try { localStorage.setItem(key.value, JSON.stringify({ version: 1, scenarios: next })) }
    catch { throw new Error('Could not save scenarios in this browser.') }
    scenarios.value = next; error.value = ''
  }
  function save(chain, name, overwriteId, valuesFor) {
    if (pending.value) throw new Error('Stop the scenario before saving changes.')
    if (overwriteId && !scenarios.value.some(item => item.id === overwriteId)) throw new Error('This scenario no longer exists.')
    const scenario = snapshotScenario(chain, name, overwriteId || undefined, valuesFor)
    validateScenario(scenario)
    if (scenarios.value.some(item => item.name === scenario.name && item.id !== overwriteId)) throw new Error('A scenario with this name already exists.')
    persist(overwriteId ? scenarios.value.map(item => item.id === overwriteId ? scenario : item) : [...scenarios.value, scenario])
    Object.assign(state, { id: scenario.id, name: scenario.name, status: 'saved', steps: [], error: '' })
    return scenario
  }
  function remove(id) {
    if (pending.value) return
    persist(scenarios.value.filter(item => item.id !== id))
    runs.delete(id)
    if (state.id === id) { state.id = ''; state.name = ''; state.steps = []; state.status = 'idle'; state.error = '' }
  }
  function open(scenario, context) {
    if (pending.value) return
    error.value = ''
    try {
      const plan = prepareScenario(scenario, { ...context, validateRequests: false })
      Object.assign(state, { id: scenario.id, name: scenario.name, status: 'ready', steps: plan, error: '' })
      return plan
    } catch (cause) {
      Object.assign(state, { id: scenario.id, name: scenario.name, status: 'failed', steps: [], error: cause.message })
      return null
    }
  }
  async function run(scenario, context, execute) {
    if (pending.value) return
    state.error = ''; error.value = ''
    const execution = reactive({ id: scenario.id, name: scenario.name, status: 'running', steps: [], error: '' })
    runs.set(scenario.id, execution)
    try { execution.steps = prepareScenario(scenario, context) }
    catch (cause) {
      Object.assign(execution, { status: 'failed', error: cause.message })
      Object.assign(state, execution)
      return
    }
    controller = new AbortController()
    pending.value = true
    Object.assign(state, execution)
    try {
      const outcome = await executeScenario(execution.steps, { execute, signal: controller.signal })
      Object.assign(execution, outcome)
      if (runs.get(scenario.id) === execution) Object.assign(state, outcome)
    } finally { pending.value = false; controller = undefined }
  }
  return { scenarios, error, state, runs, pending, save, remove, open, run, stop }
}
