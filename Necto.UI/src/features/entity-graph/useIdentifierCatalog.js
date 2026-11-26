import { onScopeDispose, ref, watch } from 'vue'
import { readBoundedText } from '../workbench/response.js'
import { validateEntityCatalog } from './identifierCatalog.js'

export function useIdentifierCatalog(props) {
  const entries = ref([]), pending = ref(false), error = ref('')
  let controller

  async function reload() {
    controller?.abort()
    const url = props.configuration?.entityCatalogUrl
    if (!url) {
      controller = undefined
      pending.value = false
      return
    }

    const job = controller = new AbortController()
    const { signal } = job
    const timeout = setTimeout(() => job.abort(), 20000)
    pending.value = true
    error.value = ''
    try {
      const response = await (props.authentication?.metadataFetch(url, 'local', { signal }) ?? fetch(url, { signal }))
      if (!response.ok) throw new Error('Could not load entity catalog.')
      const { text } = await readBoundedText(response, { signal, responseLimitBytes: 5 * 1024 * 1024 })
      if (!signal.aborted) entries.value = validateEntityCatalog(JSON.parse(text))
    } catch (cause) {
      if (controller === job) error.value = signal.aborted ? 'Catalog loading stopped.' : cause.message
    } finally {
      clearTimeout(timeout)
      if (controller === job) pending.value = false
    }
  }

  watch([
    () => props.configuration?.entityCatalogUrl,
    () => props.configuration?.workspaceId,
    () => props.authentication?.apiRevision('local'),
  ], () => {
    entries.value = []
    error.value = ''
    void reload()
  }, { immediate: true })
  onScopeDispose(() => controller?.abort())
  return { entries, pending, error, reload }
}
