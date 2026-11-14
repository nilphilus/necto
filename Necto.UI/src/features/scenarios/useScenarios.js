import { workspaceIdentity } from '../workbench/workspaceIdentity.js'
import { onWorkspaceImport } from '../workbench/workspaceUpdates.js'
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { executeScenario, prepareScenario, snapshotScenario, validateScenario } from './scenario.js'

export function useScenarios(configuration, { undoDuration = 30000 } = {}) {
  const scenarios = ref([])
  const error = ref('')
  const state = reactive({ id: '', name: '', status: 'idle', steps: [], error: '' })
  const runs = reactive(new Map())
  const pending = ref(false), deleted = ref(null)
  let deletedSnapshot, undoTimer
  function forgetDeletion() { clearTimeout(undoTimer); deletedSnapshot = undefined; deleted.value = null }
  onScopeDispose(forgetDeletion)
  let controller
  const key = computed(() => workspaceIdentity(configuration.value) && `necto:scenarios:${workspaceIdentity(configuration.value)}`)
  const stop = () => controller?.abort()
  onScopeDispose(stop)
  function loadStored(storageKey, reset = false) {
    const previous = scenarios.value
    if (reset) { Object.assign(state, { id: '', name: '', status: 'idle', steps: [], error: '' }); stop(); runs.clear(); scenarios.value = []; error.value = '' }
    if (!storageKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved !== null && (saved.version !== 1 || !Array.isArray(saved.scenarios))) throw new Error('Unsupported scenario file.')
      const next = saved?.scenarios ?? []
      for (const scenario of next) validateScenario(scenario)
      if (new Set(next.map(scenario => scenario.id)).size !== next.length) throw new Error('Duplicate scenario IDs.')
      if (!reset) for (const old of previous) {
        if (JSON.stringify(old) !== JSON.stringify(next.find(item => item.id === old.id))) {
          runs.delete(old.id)
          if (state.id === old.id) { const updated = next.find(item => item.id === old.id); stop(); Object.assign(state, {id:updated?.id ?? '',name:updated?.name ?? '',steps:[],error:'',status:updated?'saved':'idle'}) }
        }
      }
      scenarios.value = next; error.value = ''
    } catch(cause) { error.value = `Could not load saved scenarios. ${cause.message}` }
  }
  watch(key, forgetDeletion, { flush: 'sync' })
  watch(key, storageKey => loadStored(storageKey, true), { immediate: true })
  onWorkspaceImport(key, storageKey => loadStored(storageKey))
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
    const index = scenarios.value.findIndex(item => item.id === id)
    if (index < 0) return
    const snapshot = JSON.parse(JSON.stringify(scenarios.value[index]))
    persist(scenarios.value.filter(item => item.id !== id))
    forgetDeletion()
    deletedSnapshot = { key: key.value, index, scenario: snapshot }
    deleted.value = { id: snapshot.id, name: snapshot.name }
    undoTimer = setTimeout(forgetDeletion, undoDuration)
    runs.delete(id)
    if (state.id === id) { state.id = ''; state.name = ''; state.steps = []; state.status = 'idle'; state.error = '' }
  }
  function undoRemove() {
    if (pending.value || !deletedSnapshot) return
    if (deletedSnapshot.key !== key.value) { forgetDeletion(); return }
    const { scenario, index } = deletedSnapshot
    if (scenarios.value.some(item => item.id === scenario.id || item.name === scenario.name)) throw new Error('A scenario with this name or ID already exists. Undo would overwrite it.')
    const next = [...scenarios.value]
    next.splice(Math.min(index, next.length), 0, scenario)
    persist(next)
    // Restore only the saved definition; never restore or execute a previous run.
    forgetDeletion()
    return scenario
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
  return { scenarios, error, state, runs, pending, deleted, save, remove, undoRemove, open, run, stop }
}
