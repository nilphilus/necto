<script setup>
import { computed, onMounted, ref } from 'vue'

const spec = ref(null)
const endpointMappings = ref([])
const error = ref('')
const mappingError = ref('')
const filter = ref('')
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace', 'query']

const operations = computed(() =>
  Object.entries(spec.value?.paths ?? {}).flatMap(([path, item]) =>
    methods.filter(method => item?.[method]).map(method => ({
      path,
      method: method.toUpperCase(),
      id: item[method].operationId,
      parameters: [...(item[method].parameters ?? []), ...(item.parameters ?? [])],
      summary: item[method].summary ?? item[method].operationId ?? '',
      description: item[method].description,
    })),
  ),
)

const suggestions = computed(() => {
  const byId = new Map(operations.value.map(operation => [operation.id, operation]))
  const byTarget = new Map()

  for (const mapping of endpointMappings.value) {
    const source = byId.get(mapping.source.operationId)
    const target = byId.get(mapping.target.operationId)
    if (!source || !target) continue

    let location = mapping.target.location
    if (location === 'parameter') {
      location = target.parameters.find(parameter =>
        parameter.name === mapping.target.name && ['path', 'query'].includes(parameter.in),
      )?.in
      if (!location) continue
    }

    const entries = byTarget.get(target.id) ?? []
    entries.push({ ...mapping, location })
    byTarget.set(target.id, entries)
  }
  return byTarget
})

const matchingOperations = computed(() => {
  const query = filter.value.trim().toLowerCase()
  return operations.value.filter(({ method, path, summary }) =>
    `${method} ${path} ${summary}`.toLowerCase().includes(query),
  )
})

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

onMounted(async () => {
  let endpointMappingsUrl
  try {
    const configuration = await fetchJson('./configuration')
    const { openApiUrl } = configuration
    endpointMappingsUrl = configuration.endpointMappingsUrl
    const openApi = await fetchJson(openApiUrl)
    if (!openApi?.openapi) {
      throw new Error('Expected an OpenAPI document')
    }
    spec.value = openApi
  } catch (cause) {
    error.value = `Could not load the API documentation. ${cause.message}`
    return
  }

  if (endpointMappingsUrl) {
    try {
      const mappings = await fetchJson(endpointMappingsUrl)
      if (!Array.isArray(mappings)) throw new Error('Expected a list of endpoint mappings')
      endpointMappings.value = mappings
    } catch (cause) {
      mappingError.value = `Could not load suggested values. ${cause.message}`
    }
  }
})
</script>

<template>
  <main>
    <header>
      <p class="brand">Necto UI</p>
      <h1>{{ spec?.info?.title ?? 'API documentation' }}</h1>
      <p v-if="spec?.info?.version">Version {{ spec.info.version }}</p>
      <p v-if="spec?.info?.description">{{ spec.info.description }}</p>
    </header>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!spec" role="status">Loading API documentation…</p>
    <section v-else aria-labelledby="operations-heading">
      <h2 id="operations-heading">Operations</h2>
      <p v-if="mappingError" role="status">{{ mappingError }}</p>
      <label for="operation-filter">Filter operations</label>
      <input id="operation-filter" v-model="filter" type="search" placeholder="Method, path, or name">
      <p v-if="!matchingOperations.length" role="status">
        {{ operations.length ? 'No matching operations.' : 'No operations in this document.' }}
      </p>
      <ul v-else>
        <li v-for="operation in matchingOperations" :key="operation.method + ' ' + operation.path">
          <div class="operation">
            <strong>{{ operation.method }}</strong>
            <code>{{ operation.path }}</code>
          </div>
          <p v-if="operation.summary">{{ operation.summary }}</p>
          <p v-if="operation.description">{{ operation.description }}</p>
          <details v-if="suggestions.has(operation.id)">
            <summary>Suggested values</summary>
            <ul>
              <li v-for="(mapping, index) in suggestions.get(operation.id)" :key="index">
                <code>{{ mapping.source.operationId }}{{ mapping.source.eachItem ? '[*]' : '' }}{{ mapping.source.property === null ? '' : '.' + mapping.source.property }}</code>
                →
                <code>{{ mapping.location }} {{ mapping.target.name }}</code>
                <small v-if="mapping.suggestedIdentifierType">
                  · Consider a dedicated <code>{{ mapping.suggestedIdentifierType }}</code> type
                </small>
              </li>
            </ul>
          </details>
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  color: #19263d;
  background: #f5f7fb;
}

main {
  width: min(46rem, calc(100% - 2rem));
  margin: 3rem auto;
}

header {
  border-bottom: 1px solid #cbd5e1;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
}

.brand {
  color: #185b85;
  font-weight: 700;
}

input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  margin: .5rem 0 1rem;
  padding: .7rem;
  border: 1px solid #64748b;
  border-radius: .5rem;
  font: inherit;
}

ul {
  padding: 0;
  list-style: none;
}

li {
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: .5rem;
  margin-bottom: .5rem;
  padding: .8rem 1rem;
}

li p {
  margin: .5rem 0 0;
}

.operation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .75rem;
  overflow-wrap: anywhere;
}

.operation strong {
  background: #dbeafe;
  color: #154070;
  padding: .25rem .5rem;
  border-radius: .25rem;
  font-size: .8rem;
}
</style>
