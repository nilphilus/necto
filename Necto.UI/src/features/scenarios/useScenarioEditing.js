import { computed, ref, shallowRef, watch } from 'vue'
import { snapshotScenario } from './scenario.js'

export function useScenarioEditing(store, getChain, resolveValues) {
  const { scenarios } = store
  const scenarioName = ref('')
  const editingScenarioId = ref(''),
    editingFolderSource = shallowRef(null)
  watch(
    editingScenarioId,
    () => {
      editingFolderSource.value = null
    },
    { flush: 'sync' }
  )
  const editingScenario = computed(() =>
    scenarios.value.find((scenario) => scenario.id === editingScenarioId.value)
  )
  const scenarioDirty = computed(() => {
    const saved = editingScenario.value
    if (!saved) return false
    try {
      return (
        JSON.stringify(snapshotScenario(getChain(), saved.name, saved.id, resolveValues).steps) !==
        JSON.stringify(saved.steps)
      )
    } catch {
      return true
    }
  })
  const overwriteScenario = computed(() =>
    scenarios.value.find(
      (scenario) =>
        scenario.id === editingScenarioId.value && scenario.name === scenarioName.value.trim()
    )
  )

  function saveEditing() {
    const overwriteId = overwriteScenario.value?.id
    const origin = overwriteId === editingScenarioId.value ? editingFolderSource.value : undefined
    const saved = store.save(getChain(), scenarioName.value, overwriteId, resolveValues, origin)
    editingScenarioId.value = saved.id
    editingFolderSource.value = saved._sharedSource ?? null
    scenarioName.value = saved.name
    return saved
  }

  function selectOriginalName() {
    scenarioName.value = editingScenario.value.name
  }

  function suggestCopyName() {
    scenarioName.value = editingScenario.value.name + ' copy'
  }

  return {
    scenarioName,
    editingScenarioId,
    editingFolderSource,
    editingScenario,
    scenarioDirty,
    overwriteScenario,
    saveEditing,
    selectOriginalName,
    suggestCopyName,
  }
}
