import { importedWorkspaceId } from '../workbench/workspaceIdentity.js'
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { resolveReference } from '../workbench/openapiReference.js'
import { readDocumentSource } from '../workbench/document.js'
import { useExternalApis } from '../external-apis/connections.js'

const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace', 'query']

async function fetchJson(url, authentication, signal, apiDocument = false) {
  const accept = apiDocument ? 'application/json, application/yaml, text/yaml' : 'application/json'
  const response = await (authentication?.metadataFetch(url, 'local', { signal, headers: { Accept: accept } }) ?? fetch(url, { signal, headers: { Accept: accept } }))
  if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 401 ? ' — sign in using Authorize, then retry.' : response.status === 403 ? ' — access denied for this account.' : ''}`)
  if (response.redirected || !/json|yaml|text\/plain/i.test(response.headers.get('content-type') ?? '')) throw new Error('The documentation endpoint returned a login page. Use Authorize or sign into the product, then retry.')
  const data = apiDocument ? await readDocumentSource(await response.text(), new URL(url, document.baseURI).href, (url, options) => fetch(url, { ...options, signal })) : await response.json()
  signal?.throwIfAborted()
  return data
}

export function readOperations(spec, api = { id: 'local' }) {
  const resolve = value => resolveReference(spec, value)
  return Object.entries(spec.paths ?? {}).flatMap(([path, pathItem]) => {
    const item = resolve(pathItem)
    return methods.filter(method => item?.[method]).map(method => {
      const operation = item[method]
      const parameters = new Map()
      for (const entry of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
        const parameter = resolve(entry)
        if (parameter) parameters.set(`${parameter.in}:${parameter.name}`, parameter)
      }

      const verb = method.toUpperCase()
      return {
        key: api.id === 'local' ? `${verb} ${path}` : JSON.stringify([api.id, verb, path]),
        apiId: api.id,
        apiName: api.name ?? spec.info?.title ?? 'Local API',
        configuration: api.configuration,
        usePresets: api.usePresets ?? false,
        path,
        method: verb,
        id: operation.operationId,
        summary: operation.summary,
        deprecated: operation.deprecated === true,
        name: operation.summary || operation.operationId || path,
        description: operation.description,
        accessHint: operation['x-necto-access'],
        tags: (operation.tags?.length ? [...new Set(operation.tags)] : ['Other'])
          .map(tag => api.id === 'local' ? tag : `${api.name} [${api.id}] · ${tag}`),
        parameters: [...parameters.values()],
        requestBody: resolve(operation.requestBody),
        responses: operation.responses ?? {},
        security: Object.hasOwn(operation, 'security') ? operation.security : spec.security ?? null,
        securitySchemes: Object.fromEntries(Object.entries(spec.components?.securitySchemes ?? {}).map(([name, value]) => [name, resolve(value)])),
        servers: [operation.servers, item.servers, spec.servers].find(servers => servers?.length) ?? [],
        server: [operation.servers, item.servers, spec.servers].find(servers => servers?.length)?.[0],
        resolve,
      }
    })
  })
}

function availableDocuments(settings, defaultUrl) {
  const documents = new Map()
  for (const item of Array.isArray(settings.openApiDocuments) ? settings.openApiDocuments : []) {
    if (typeof item?.name !== 'string' || !item.name.trim() || typeof item.url !== 'string') continue
    try {
      const url = new URL(item.url, document.baseURI)
      if (url.origin === new URL(defaultUrl).origin && !url.username && !url.password && !url.hash)
        documents.set(url.href, { name: item.name, url: url.href })
    } catch { /* Invalid configured entries are excluded. */ }
  }
  if (!documents.has(defaultUrl)) {
    const name = new URL(defaultUrl).pathname.split('/').at(-1)?.replace(/\.(?:json|ya?ml)$/i, '')
    documents.set(defaultUrl, { name: name || 'Default', url: defaultUrl })
  }
  return [...documents.values()]
}

export function useCatalog(authentication) {
  const spec = ref(null)
  const configuration = ref(null)
  const error = ref('')
  const documentError = ref('')
  const documentLoading = ref(false)
  const openApiDocuments = ref([])
  let serverSettings, selectedServerUrl
  const selectionKey = () => 'necto:openapi-document:' + serverSettings.configurationUrl
  function rememberedDocument() {
    try { return sessionStorage.getItem(selectionKey()) }
    catch { return null }
  }
  function rememberDocument(url) {
    try { sessionStorage.setItem(selectionKey(), url) }
    catch { /* A browser policy may restrict storage. */ }
  }
  const documentSource = ref({ kind: 'server', name: 'Server document' })
  const externalApis = useExternalApis(configuration, authentication)
  const operations = computed(() => spec.value ? [
    ...readOperations(spec.value),
    ...externalApis.contexts.value.flatMap(api => readOperations(api.document, api)),
  ] : [])
  const groups = computed(() => {
    const descriptions = new Map((spec.value?.tags ?? []).map(tag => [tag.name, tag.description]))
    for (const api of externalApis.contexts.value) for (const tag of api.document.tags ?? []) descriptions.set(`${api.name} [${api.id}] · ${tag.name}`, tag.description)
    const byTag = new Map((spec.value?.tags ?? []).map(({ name }) => [name, []]))
    for (const operation of operations.value) {
      for (const tag of operation.tags) {
        if (!byTag.has(tag)) byTag.set(tag, [])
        byTag.get(tag).push(operation)
      }
    }
    return [...byTag].filter(([, entries]) => entries.length)
      .map(([name, operations]) => ({ name, operations, description: descriptions.get(name) }))
  })

  let generation = 0, controller
  onScopeDispose(() => controller?.abort())
  async function reload({ server = false } = {}) {
    if (!server && documentSource.value.kind === 'import') {
      error.value = ''
      return { message: 'Credentials applied. Imported API document kept; no server document was loaded.' }
    }
    documentLoading.value = false
    documentError.value = ''
    const version = ++generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    error.value = ''
    try {
      const settings = await fetchJson('./configuration', authentication, signal)
      if (version !== generation) return
      const defaultUrl = new URL(settings.openApiUrl, document.baseURI).href
      const documents = availableDocuments(settings, defaultUrl)
      openApiDocuments.value = documents
      serverSettings = { ...settings, openApiDocuments: documents, configurationUrl: new URL('./configuration', document.baseURI).href }
      const preferredUrl = selectedServerUrl ?? rememberedDocument()
      const openApiUrl = documents.some((item) => item.url === preferredUrl) ? preferredUrl : defaultUrl
      configuration.value = { ...serverSettings, openApiUrl }
      const current = authentication?.apis.get('local')
      authentication?.register({ id: 'local', name: 'Local API', configuration: configuration.value, document: current?.document, schemes: current?.schemes, origins: [new URL(openApiUrl).origin] })
      const openApiDocument = await fetchJson(openApiUrl, authentication, signal, true)
      if (!openApiDocument?.document?.openapi) throw new Error('Expected an OpenAPI document. If redirected to a login page, sign into the product first.')
      if (version === generation) {
        const { document, ...source } = openApiDocument
        spec.value = document
        selectedServerUrl = openApiUrl
        documentSource.value = { ...source, kind: 'server', name: 'Server document' }
      }
    } catch (cause) {
      if (version === generation && !signal.aborted) error.value = `Could not load the API documentation. ${cause.message}`
    }
  }
  async function selectOpenApiDocument(url) {
    if (!serverSettings || !openApiDocuments.value.some((item) => item.url === url) ||
        documentSource.value.kind === 'server' && configuration.value?.openApiUrl === url) return
    const version = ++generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    documentLoading.value = true
    documentError.value = ''
    try {
      const openApiDocument = await fetchJson(url, authentication, signal, true)
      if (!openApiDocument?.document?.openapi) throw new Error('Expected an OpenAPI document.')
      if (version !== generation) return
      configuration.value = { ...serverSettings, openApiUrl: url }
      const { document, ...source } = openApiDocument
      spec.value = document
      selectedServerUrl = url
      rememberDocument(url)
      documentSource.value = { ...source, kind: 'server', name: 'Server document' }
      error.value = ''
    } catch (cause) {
      if (version === generation && !signal.aborted)
        documentError.value = `Could not switch OpenAPI document. ${cause.message}`
    } finally {
      if (version === generation) documentLoading.value = false
    }
  }
  async function importDocument(text, name = 'Local API document', { association = 'separate', workspaceName = name } = {}) {
    if (!['separate', 'current'].includes(association)) throw new Error('Choose how to associate this API document.')
    const workspaceId = association === 'separate' ? importedWorkspaceId(configuration.value, workspaceName) : configuration.value.workspaceId
    documentLoading.value = false
    documentError.value = ''
    const version = ++generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    const { document, ...source } = await readDocumentSource(text, configuration.value.openApiUrl, (url, options) => fetch(url, { ...options, signal }))
    if (version !== generation) return
    if (association === 'separate') configuration.value = { ...configuration.value, workspaceId, overrideServer: false, serverProfiles: {}, endpointMappingsUrl: undefined, entityCatalogUrl: undefined, operationRolesUrl: undefined }
    spec.value = document
    documentSource.value = { ...source, kind: 'import', name, workspaceName: association === 'separate' ? workspaceName.trim() : documentSource.value.workspaceName }
    error.value = ''
  }
  onMounted(reload)
  return { spec, configuration, error, operations, groups, externalApis, documentSource, openApiDocuments, documentLoading, documentError, selectOpenApiDocument, reload, importDocument, restoreServerDocument: () => reload({ server: true }) }
}
