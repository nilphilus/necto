import { computed, onMounted, ref } from 'vue'

const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace', 'query']

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function resolveReference(spec, value) {
  const visited = new Set()
  while (value?.$ref) {
    const reference = value.$ref
    if (!reference.startsWith('#/') || visited.has(reference)) return undefined
    visited.add(reference)
    value = decodeURIComponent(reference.slice(2)).split('/').reduce(
      (node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')],
      spec,
    )
  }
  return value
}

function readOperations(spec) {
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
        key: `${verb} ${path}`,
        path,
        method: verb,
        id: operation.operationId,
        name: operation.summary || operation.operationId || path,
        description: operation.description,
        tags: operation.tags?.length ? [...new Set(operation.tags)] : ['Other'],
        parameters: [...parameters.values()],
        requestBody: resolve(operation.requestBody),
        responses: operation.responses ?? {},
        server: [operation.servers, item.servers, spec.servers].find(servers => servers?.length)?.[0],
        resolve,
      }
    })
  })
}

export function useCatalog() {
  const spec = ref(null)
  const configuration = ref(null)
  const error = ref('')
  const operations = computed(() => spec.value ? readOperations(spec.value) : [])
  const groups = computed(() => {
    const byTag = new Map((spec.value?.tags ?? []).map(({ name }) => [name, []]))
    for (const operation of operations.value) {
      for (const tag of operation.tags) {
        if (!byTag.has(tag)) byTag.set(tag, [])
        byTag.get(tag).push(operation)
      }
    }
    return [...byTag].filter(([, entries]) => entries.length)
      .map(([name, operations]) => ({ name, operations }))
  })

  onMounted(async () => {
    try {
      const settings = await fetchJson('./configuration')
      const openApiUrl = new URL(settings.openApiUrl, window.location.href).href
      const document = await fetchJson(openApiUrl)
      if (!document?.openapi) throw new Error('Expected an OpenAPI document')
      configuration.value = { ...settings, openApiUrl }
      spec.value = document
    } catch (cause) {
      error.value = `Could not load the API documentation. ${cause.message}`
    }
  })

  return { spec, configuration, error, operations, groups }
}
