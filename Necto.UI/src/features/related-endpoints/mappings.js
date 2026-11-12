import { computed, ref, watch } from 'vue'

export function sourcePath(source) {
  return source.objectPath ?? (source.eachItem ? [null] : [])
}

export function matchesPath(template, path) {
  return template.length === path.length && template.every((part, index) =>
    part === null ? Number.isInteger(path[index]) : part === path[index])
}

export const RELATED_VALUE_LIMIT = 200

export function readValues(response, source, selectedPath, limit = Infinity) {
  const template = sourcePath(source)
  const values = []
  function visit(value, depth) {
    if (values.length >= limit) return
    if (depth === template.length) {
      // A selected descendant cannot provide values from its ancestors.
      if (selectedPath && selectedPath.length > depth) return
      if (source.property === null) {
        if (value !== undefined) values.push(value)
      } else if (value && Object.hasOwn(value, source.property)) values.push(value[source.property])
      return
    }
    const part = template[depth]
    const selected = selectedPath?.[depth]
    if (part === null) {
      if (!Array.isArray(value)) return
      if (selected !== undefined) {
        if (Number.isInteger(selected) && selected >= 0 && selected < value.length) visit(value[selected], depth + 1)
      } else {
        for (const item of value) {
          visit(item, depth + 1)
          if (values.length >= limit) break
        }
      }
    } else if ((selected === undefined || selected === part) && value && Object.hasOwn(value, part)) {
      visit(value[part], depth + 1)
    }
  }
  visit(response, 0)
  return values
}

export function resolveMappingLinks(operations, catalogs) {
  const byId = new Map()
  for (const operation of operations) {
    if (!operation.id) continue
    const key = JSON.stringify([operation.apiId ?? 'local', operation.id])
    byId.set(key, byId.has(key) ? null : operation)
  }
  const links = []
  for (const { apiId, mappings } of catalogs) {
    for (const mapping of mappings) {
      const { source, target } = mapping ?? {}
      if (!source || !target) continue
      const from = byId.get(JSON.stringify([source.apiId ?? apiId, source.operationId]))
      const to = byId.get(JSON.stringify([target.apiId ?? apiId, target.operationId]))
      if (!from || !to) continue
      let location = target.location
      if (location === 'parameter') location = to.parameters.find(parameter =>
        ['path', 'query', 'header'].includes(parameter.in) && parameter.name === target.name)?.in
      if (location === 'body' ? !to.requestBody : !['path', 'query', 'header'].includes(location) ||
        !to.parameters.some(parameter => parameter.in === location && parameter.name === target.name)) continue
      links.push({ from, to, location, name: target.name, source, match: mapping.match ?? 'explicit' })
    }
  }
  return links
}

export function useRelatedEndpoints(configuration, operations, externalContexts = ref([])) {
  const mappings = ref([])
  const error = ref('')

  watch(() => configuration.value?.endpointMappingsUrl, async (url, previous, onCleanup) => {
    mappings.value = []; error.value = ''
    if (!url) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const entries = await response.json()
      if (!Array.isArray(entries)) throw new Error('Expected a list of endpoint mappings')
      if (!controller.signal.aborted) mappings.value = entries
    } catch (cause) {
      if (!controller.signal.aborted) error.value = `Could not load related endpoints. ${cause.message}`
    }
  })

  const graphMappings = computed(() => [
    { apiId: 'local', entries: mappings.value },
    ...externalContexts.value.map(api => ({ apiId: api.id, entries: api.mappings })),
  ].flatMap(({ apiId, entries }) => entries.filter(entry => entry?.source && entry?.target).map(entry => ({
    ...entry, source: { ...entry.source, apiId: entry.source.apiId ?? apiId },
    target: { ...entry.target, apiId: entry.target.apiId ?? apiId },
  }))))
  const links = computed(() => resolveMappingLinks(operations.value, [
    { apiId: 'local', mappings: mappings.value },
    ...externalContexts.value.map(api => ({ apiId: api.id, mappings: api.mappings })),
  ]))

  function mappedValues(link, result) {
    if (!result?.ok) return []
    return readValues(result.json, link.source, result.selectedPath, RELATED_VALUE_LIMIT).filter(value => link.location === 'body' || value !== null)
  }

  function targetsFor(operation, result) {
    const byTarget = new Map()
    for (const link of links.value) {
      if (link.from.key !== operation.key) continue
      const values = mappedValues(link, result)
      if (!values.length) continue
      const matches = byTarget.get(link.to) ?? new Map()
      for (const value of values) {
        const key = JSON.stringify([link.location, link.name, value])
        matches.set(key, { location: link.location, name: link.name, value })
      }
      byTarget.set(link.to, matches)
    }
    return [...byTarget].map(([operation, matches]) => ({ operation, candidates: [...matches.values()] }))
  }

  function choicesFor(operation, location, name, results) {
    const choices = new Map()
    for (const link of links.value) {
      if (link.to.key !== operation.key || link.location !== location ||
        (location !== 'body' && link.name !== name)) continue
      for (const result of results.get(link.from.key) ?? []) {
        for (const value of mappedValues(link, result)) {
          const key = JSON.stringify([link.name, value])
          if (!choices.has(key)) choices.set(key, { key, name: link.name, value, source: (link.from.apiId && link.from.apiId !== 'local' ? link.from.apiName + ' · ' : '') + link.from.name })
        }
      }
    }
    return [...choices.values()]
  }

  function selectablePaths(operation) {
    return links.value.filter(link => link.from.key === operation.key).map(link => sourcePath(link.source))
  }

  return { error, targetsFor, choicesFor, selectablePaths, mappings: graphMappings }
}

export function applyChoice(session, location, choice) {
  const { name, value } = choice
  if (location !== 'body') {
    session.fields[`${location}:${name}`] = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return
  }

  if (name === null) {
    session.body = JSON.stringify(value, null, 2)
    return
  }

  let body
  try {
    body = session.body.trim() ? JSON.parse(session.body) : {}
  } catch {
    throw new Error('Fix the JSON request body before applying a related value.')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('The request body must be a JSON object to apply this value.')
  }
  session.body = JSON.stringify({ ...body, [name]: value }, null, 2)
}
