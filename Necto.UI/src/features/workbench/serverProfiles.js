import { onWorkspaceImport } from './workspaceUpdates.js'
import { watch } from 'vue'
export function useServerProfiles(configuration, onChange = () => {}) {
  function loadProfiles() {
    const url = configuration.value?.openApiUrl
    if (!url) return
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(`necto:servers:${url}`)) ?? {} } catch { /* Optional browser settings. */ }
    const next = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
    if (JSON.stringify(configuration.value.serverProfiles) !== JSON.stringify(next)) configuration.value.serverProfiles = next
  }
  watch(() => configuration.value?.openApiUrl, loadProfiles, { immediate: true })
  onWorkspaceImport(() => configuration.value?.openApiUrl && `necto:servers:${configuration.value.openApiUrl}`, loadProfiles)
  watch(
    () => configuration.value?.serverProfiles,
    (profiles, previous) => {
      if (!profiles) return
      if (previous) onChange()
      try {
        localStorage.setItem(
          `necto:servers:${configuration.value.openApiUrl}`,
          JSON.stringify(profiles)
        )
      } catch {
        /* Session-only fallback. */
      }
    },
    { deep: true }
  )
}
