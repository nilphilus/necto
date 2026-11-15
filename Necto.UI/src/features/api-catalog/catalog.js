import { importedWorkspaceId } from '../workbench/workspaceIdentity.js'
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { parseDocument, bundleReferences } from '../workbench/document.js'
import { useExternalApis } from '../external-apis/connections.js'

const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace', 'query']

async function fetchJson(url, authentication, signal, apiDocument = false) {
  const accept = apiDocument ? 'application/json, application/yaml, text/yaml' : 'application/json'
  const response = await (authentication?.metadataFetch(url, 'local', { signal, headers: { Accept: accept } }) ?? fetch(url, { signal, headers: { Accept: accept } }))
  if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 401 ? ' — sign in using Authorize, then retry.' : response.status === 403 ? ' — access denied for this account.' : ''}`)
  if (response.redirected || !/json|yaml|text\/plain/i.test(response.headers.get('content-type') ?? '')) throw new Error('The documentation endpoint returned a login page. Use Authorize or sign into the product, then retry.')
  const data = apiDocument ? await bundleReferences(parseDocument(await response.text()), new URL(url, document.baseURI).href, (url, options) => fetch(url, { ...options, signal })) : await response.json()
  signal?.throwIfAborted()
  return data
}

function resolveReference(spec, value) {
  const visited = new Set()
  while (value?.$ref) {
    const reference = value.$ref
    if (!reference.startsWith('#/') || visited.has(reference)) return undefined
    visited.add(reference)
    value = decodeURIComponent(reference.slice(2)).split('/').reduce(
      (node, key) => { const name = key.replaceAll('~1', '/').replaceAll('~0', '~'); return node && Object.hasOwn(node, name) ? node[name] : undefined },
      spec,
    )
  }
  return value
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

export function useCatalog(authentication) {
  const spec = ref(null)
  const configuration = ref(null)
  const error = ref('')
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
    const version = ++generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    error.value = ''
    try {
      const settings = await fetchJson('./configuration', authentication, signal)
      if (version !== generation) return
      const openApiUrl = new URL(settings.openApiUrl, document.baseURI).href
      configuration.value = { ...settings, openApiUrl, configurationUrl: new URL('./configuration', document.baseURI).href }
      const current = authentication?.apis.get('local')
      authentication?.register({ id: 'local', name: 'Local API', configuration: configuration.value, document: current?.document, schemes: current?.schemes, origins: [new URL(openApiUrl).origin] })
      const openApiDocument = await fetchJson(openApiUrl, authentication, signal, true)
      if (!openApiDocument?.openapi) throw new Error('Expected an OpenAPI document. If redirected to a login page, sign into the product first.')
      if (version === generation) {
        spec.value = openApiDocument
        documentSource.value = { kind: 'server', name: 'Server document' }
      }
    } catch (cause) {
      if (version === generation && !signal.aborted) error.value = `Could not load the API documentation. ${cause.message}`
    }
  }
  async function importDocument(text, name = 'Local API document', { association = 'separate', workspaceName = name } = {}) {
    if (!['separate', 'current'].includes(association)) throw new Error('Choose how to associate this API document.')
    const workspaceId = association === 'separate' ? importedWorkspaceId(configuration.value, workspaceName) : configuration.value.workspaceId
    const version = ++generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    const imported = parseDocument(text)
    const bundled = await bundleReferences(imported, configuration.value.openApiUrl, (url, options) => fetch(url, { ...options, signal }))
    if (version !== generation) return
    if (association === 'separate') configuration.value = { ...configuration.value, workspaceId, overrideServer: false, serverProfiles: {}, endpointMappingsUrl: undefined, entityCatalogUrl: undefined, operationRolesUrl: undefined }
    spec.value = bundled
    documentSource.value = { kind: 'import', name, workspaceName: association === 'separate' ? workspaceName.trim() : documentSource.value.workspaceName }
    error.value = ''
  }
  onMounted(reload)
  return { spec, configuration, error, operations, groups, externalApis, documentSource, reload, importDocument, restoreServerDocument: () => reload({ server: true }) }
}
