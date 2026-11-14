import { parseDocument, bundleReferences } from '../workbench/document.js'
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'

export function httpUrl(value, label, base) {
  const url = new URL(value, base)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error(`${label} must be an HTTP(S) URL without credentials or a fragment.`)
  }
  return url.href
}

export function normalizeConnection(input) {
  const id = input.id?.trim()
  if (!/^[a-z][a-z0-9-]*$/.test(id ?? '') || id === 'local') {
    throw new Error('API ID must start with a lowercase letter and contain only lowercase letters, numbers or hyphens. "local" is reserved.')
  }
  const name = input.name?.trim()
  if (!name) throw new Error('Enter a name for the API.')
  return { id, name, openApiUrl: httpUrl(input.openApiUrl, 'OpenAPI URL'),
    endpointMappingsUrl: httpUrl(input.endpointMappingsUrl, 'Mappings URL'),
    apiBaseUrl: input.apiBaseUrl?.trim() ? httpUrl(input.apiBaseUrl, 'API base URL') : '',
    usePresets: input.usePresets === true }
}

const signature = entry => JSON.stringify([entry.openApiUrl, entry.endpointMappingsUrl, entry.apiBaseUrl])
export async function loadConnection(entry, signal, authentication) {
  const read = async (url, apiDocument = false) => {
    const options = { signal, headers: { Accept: apiDocument ? 'application/json, application/yaml, text/yaml' : 'application/json' }, credentials: 'omit' }
    const response = await (authentication?.metadataFetch(url, entry.id, options) ?? fetch(url, options))
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`)
    return apiDocument && response.text ? bundleReferences(parseDocument(await response.text()), url, (url, options) => fetch(url, { ...options, signal })) : response.json()
  }
  const [document, mappings] = await Promise.all([read(entry.openApiUrl, true), read(entry.endpointMappingsUrl)])
  if (!document?.openapi || typeof document.paths !== 'object' || !document.paths) throw new Error('Expected an OpenAPI document with paths.')
  if (!Array.isArray(mappings) || mappings.some(mapping => !mapping?.source?.operationId || !mapping?.target?.operationId)) {
    throw new Error('Expected a list of Necto endpoint mappings.')
  }
  return { document, mappings, signature: signature(entry) }
}

export function useExternalApis(configuration, authentication) {
  const connections = ref([])
  const show = ref(false)
  const loaded = reactive(new Map())
  const statuses = reactive(new Map())
  const storageError = ref('')
  const revision = ref(0)
  const changedApiId = ref('')
  const jobs = new Map()
  const storageKey = computed(() => configuration.value?.openApiUrl && `necto:external-apis:${configuration.value.openApiUrl}`)

  function stop(id) {
    jobs.get(id)?.controller.abort()
    jobs.delete(id)
    if (statuses.get(id)?.pending) statuses.set(id, { ...statuses.get(id), pending: false })
  }
  onScopeDispose(() => { for (const id of jobs.keys()) stop(id) })
  function persist() {
    if (!storageKey.value) return
    try {
      localStorage.setItem(storageKey.value, JSON.stringify({ connections: connections.value, show: show.value }))
      storageError.value = ''
    } catch { storageError.value = 'Could not save external API settings in this browser.' }
  }
  async function testConnection(id, force = true) {
    const entry = connections.value.find(entry => entry.id === id)
    if (!entry) return
    const key = signature(entry)
    if (!force && (loaded.get(id)?.signature === key || jobs.get(id)?.signature === key)) return
    stop(id)
    const controller = new AbortController()
    const job = { controller, signature: key }
    jobs.set(id, job)
    statuses.set(id, { pending: true, error: '' })
    const timeout = setTimeout(() => controller.abort(new Error('Connection timed out after 20 seconds.')), 20000)
    try {
      const result = await loadConnection(entry, controller.signal, authentication)
      if (jobs.get(id) !== job || controller.signal.aborted) return
      loaded.set(id, result)
      statuses.set(id, { pending: false, error: '', ready: true, mappingCount: result.mappings.length })
    } catch (cause) {
      if (jobs.get(id) !== job) return
      loaded.delete(id)
      statuses.set(id, { pending: false, error: `Could not connect. ${cause.message} Check the URLs and the API's CORS configuration.` })
    } finally {
      clearTimeout(timeout)
      if (jobs.get(id) === job) jobs.delete(id)
    }
  }
  watch(() => configuration.value?.openApiUrl, url => {
    if (!url) return
    for (const id of jobs.keys()) stop(id)
    loaded.clear(); statuses.clear(); connections.value = []; show.value = false
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey.value))
      if (!saved) return
      const entries = saved.connections.map(normalizeConnection)
      if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate API IDs.')
      connections.value = entries
      show.value = saved.show === true
    } catch { storageError.value = 'Could not load saved external API settings.' }
  }, { immediate: true })
  watch([show, () => connections.value.map(entry => `${entry.id}:${signature(entry)}`).join('|')], () => {
    for (const [id, job] of jobs) {
      const entry = connections.value.find(entry => entry.id === id)
      if (!show.value || !entry || signature(entry) !== job.signature) stop(id)
    }
    if (show.value) for (const entry of connections.value) void testConnection(entry.id, false)
  })
  if (authentication) watch(authentication.revision, () => {
    for (const id of [...jobs.keys()]) stop(id)
    if (show.value) for (const entry of connections.value) void testConnection(entry.id)
  })
  watch([show, connections], persist, { deep: true })

  function saveConnection(input, editingId = '') {
    const entry = normalizeConnection(input)
    if (editingId && editingId !== entry.id) throw new Error('The API ID cannot be changed. Remove the connection and add a new one.')
    if (!editingId && connections.value.some(item => item.id === entry.id)) throw new Error('An API with this ID already exists.')
    if (editingId && !connections.value.some(item => item.id === editingId)) throw new Error('This connection no longer exists.')
    const previous = connections.value.find(item => item.id === entry.id)
    if (previous && signature(previous) !== signature(entry)) {
      stop(entry.id); loaded.delete(entry.id); statuses.delete(entry.id)
    }
    connections.value = editingId ? connections.value.map(item => item.id === editingId ? entry : item) : [...connections.value, entry]
    changedApiId.value = entry.id
    revision.value++
  }
  function removeConnection(id) {
    stop(id); loaded.delete(id); statuses.delete(id)
    connections.value = connections.value.filter(entry => entry.id !== id)
    changedApiId.value = id
    revision.value++
  }
  const contexts = computed(() => !show.value ? [] : connections.value.flatMap(entry => {
    const data = loaded.get(entry.id)
    if (!data || data.signature !== signature(entry)) return []
    return [{ ...data, id: entry.id, name: entry.name, usePresets: entry.usePresets,
      configuration: { openApiUrl: entry.openApiUrl, endpointMappingsUrl: entry.endpointMappingsUrl,
        apiBaseUrl: entry.apiBaseUrl || new URL('/', entry.openApiUrl).href, overrideServer: Boolean(entry.apiBaseUrl) } }]
  }))
  return { connections, show, contexts, statuses, storageError, revision, changedApiId, saveConnection, removeConnection, testConnection }
}
