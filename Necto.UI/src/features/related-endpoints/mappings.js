import { computed, ref, watch } from 'vue'

export function sourcePath(source) {
  return source.objectPath ?? (source.eachItem ? [null] : [])
}

export function matchesPath(template, path) {
  return template.length === path.length && template.every((part, index) =>
    part === null ? Number.isInteger(path[index]) : part === path[index])
}

export function readValues(response, source, selectedPath) {
  let nodes = [{ value: response, path: [] }]
  for (const part of sourcePath(source)) {
    nodes = nodes.flatMap(({ value, path }) => part === null
      ? (Array.isArray(value) ? value.map((value, index) => ({ value, path: [...path, index] })) : [])
      : (value && Object.hasOwn(value, part) ? [{ value: value[part], path: [...path, part] }] : []))
  }
  if (selectedPath !== undefined && selectedPath !== null) {
    nodes = nodes.filter(({ path }) => path.length >= selectedPath.length &&
      selectedPath.every((part, index) => path[index] === part))
  }
  return nodes.flatMap(({ value }) => source.property === null
    ? (value === undefined ? [] : [value])
    : (value && Object.hasOwn(value, source.property) ? [value[source.property]] : []))
}

export function useRelatedEndpoints(configuration, operations) {
  const mappings = ref([])
  const error = ref('')

  watch(() => configuration.value?.endpointMappingsUrl, async url => {
    if (!url) return
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const entries = await response.json()
      if (!Array.isArray(entries)) throw new Error('Expected a list of endpoint mappings')
      mappings.value = entries
    } catch (cause) {
      error.value = `Could not load related endpoints. ${cause.message}`
    }
  })

  const links = computed(() => {
    const byId = new Map(operations.value.filter(operation => operation.id).map(operation => [operation.id, operation]))
    const links = []
    for (const { source, target } of mappings.value) {
      const from = byId.get(source?.operationId)
      const to = byId.get(target?.operationId)
      if (!from || !to) continue

      let location = target.location
      if (location === 'parameter') {
        location = to.parameters.find(parameter =>
          ['path', 'query', 'header'].includes(parameter.in) && parameter.name === target.name,
        )?.in
      }
      if (location === 'body') {
        if (!to.requestBody) continue
      } else if (!['path', 'query', 'header'].includes(location) ||
        !to.parameters.some(parameter => parameter.in === location && parameter.name === target.name)) {
        continue
      }

      links.push({ from, to, location, name: target.name, source })
    }
    return links
  })

  function mappedValues(link, result) {
    if (!result?.ok) return []
    return readValues(result.json, link.source, result.selectedPath).filter(value => link.location === 'body' || value !== null)
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
          if (!choices.has(key)) choices.set(key, { key, name: link.name, value, source: link.from.name })
        }
      }
    }
    return [...choices.values()]
  }

  function selectablePaths(operation) {
    return links.value.filter(link => link.from.key === operation.key).map(link => sourcePath(link.source))
  }

  return { error, targetsFor, choicesFor, selectablePaths }
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
