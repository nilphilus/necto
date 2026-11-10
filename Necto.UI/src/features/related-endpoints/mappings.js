import { computed, ref, watch } from 'vue'

function readValues(response, { eachItem, property }) {
  if (response === undefined || (eachItem && !Array.isArray(response))) return []
  const values = eachItem ? response : [response]
  if (property === null) return values
  return values.flatMap(value =>
    value && Object.hasOwn(value, property) ? [value[property]] : [],
  )
}

export function useRelatedEndpoints(configuration, operations, sessions) {
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

      const response = sessions.get(from.key)?.result
      if (!response?.ok) continue
      const values = readValues(response.json, source).filter(value => location === 'body' || value !== null)
      if (values.length) links.push({ from, to, location, name: target.name, values })
    }
    return links
  })

  function targetsFor(operation) {
    const targets = links.value.filter(link => link.from.key === operation.key).map(link => link.to)
    return [...new Set(targets)]
  }

  function choicesFor(operation, location, name) {
    const choices = new Map()
    for (const link of links.value) {
      if (link.to.key !== operation.key || link.location !== location ||
        (location !== 'body' && link.name !== name)) continue
      for (const value of link.values) {
        const key = JSON.stringify([link.name, value])
        if (!choices.has(key)) choices.set(key, { key, name: link.name, value, source: link.from.name })
      }
    }
    return [...choices.values()]
  }

  return { error, targetsFor, choicesFor }
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
