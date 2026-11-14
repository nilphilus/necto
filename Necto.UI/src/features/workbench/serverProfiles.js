import { watch } from 'vue'
export function useServerProfiles(configuration, onChange = () => {}) {
  watch(
    () => configuration.value?.openApiUrl,
    (url) => {
      if (!url) return
      let saved = {}
      try {
        saved = JSON.parse(localStorage.getItem(`necto:servers:${url}`)) ?? {}
      } catch {
        /* Optional browser settings. */
      }
      configuration.value.serverProfiles =
        saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
    },
    { immediate: true }
  )
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
