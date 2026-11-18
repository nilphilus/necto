import { computed, ref, watch } from 'vue'
import { migratePreset, resolveNamedRequestValues } from '../request-runner/request.js'
import { workspaceIdentity } from '../workbench/workspaceIdentity.js'
import { onWorkspaceImport } from '../workbench/workspaceUpdates.js'
import { validatePresetCollection } from './presetCollection.js'

export function usePresets(configuration) {
  const presets = ref(new Map())
  const presetColors = ref(new Map())
  const activePresetNames = ref([])
  const presetError = ref('')
  const activePresetValues = computed(() =>
    activePresetNames.value.map((name) => presets.value.get(name))
  )
  // Keep the original storage key so saved environments carry over to presets.
  const storageKey = computed(() => 'necto:environments:' + workspaceIdentity(configuration.value))
  function loadPresets() {
    presets.value = new Map()
    presetColors.value = new Map()
    activePresetNames.value = []
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey.value))
      if (!saved) return
      validatePresetCollection(saved)
      presets.value = new Map(
        (saved.presets ?? saved.environments).map(([name, values]) => [
          name,
          saved.version === 2 ? new Map(values) : migratePreset(values),
        ])
      )
      presetColors.value = new Map(
        Object.entries(saved.colors ?? {}).filter(
          ([name, color]) => presets.value.has(name) && /^#[0-9a-f]{6}$/i.test(color)
        )
      )
      const active = Array.isArray(saved.active) ? saved.active : [saved.active]
      activePresetNames.value = [...new Set(active.filter((name) => presets.value.has(name)))]
    } catch {
      presetError.value = 'Could not load saved presets in this browser.'
    }
  }
  watch(configuration, loadPresets)
  onWorkspaceImport(storageKey, loadPresets)

  function savePresets() {
    try {
      const entries = Array.from(presets.value, ([name, values]) => [name, [...values]])
      localStorage.setItem(
        storageKey.value,
        JSON.stringify({
          version: 2,
          active: activePresetNames.value,
          presets: entries,
          colors: Object.fromEntries(presetColors.value),
        })
      )
      presetError.value = ''
    } catch {
      presetError.value = 'Could not save presets in this browser.'
    }
  }

  function valuesFor(operation, layers = activePresetValues.value) {
    if (operation.apiId && operation.apiId !== 'local' && !operation.usePresets) return new Map()
    return resolveNamedRequestValues(
      operation,
      ...layers.map((values) => ({
        name: [...presets.value].find(([, stored]) => stored === values)?.[0],
        values,
      }))
    )
  }

  return {
    presets,
    presetColors,
    activePresetNames,
    presetError,
    storageKey,
    savePresets,
    valuesFor,
  }
}
