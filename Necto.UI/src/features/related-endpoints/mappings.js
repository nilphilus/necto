import { mappingExplanation } from './mappingExplanation.js'
import { openApiMappingLinks } from '../workbench/openapiLinks.js'
import { computed, ref, watch } from 'vue'

export function sourcePath(source) {
  return source.objectPath ?? (source.eachItem ? [null] : [])
}

export function matchesPath(template, path) {
  return template.length === path.length && template.every((part, index) =>
    part === null ? Number.isInteger(path[index]) : part === path[index])
}

export const RELATED_VALUE_LIMIT = 200

export function readResponseEntries(response, source, selectedPath, limit = Infinity) {
  const template = sourcePath(source)
  const entries = []
  function visit(value, depth, path) {
    if (entries.length >= limit) return
    if (depth === template.length) {
      if (selectedPath && selectedPath.length > depth) return
      if (source.property === null) {
        if (value !== undefined) entries.push({ value, path })
      } else if (value && Object.hasOwn(value, source.property)) {
        entries.push({ value: value[source.property], path: [...path, source.property] })
      }
      return
    }
    const part = template[depth], selected = selectedPath?.[depth]
    if (part === null) {
      if (!Array.isArray(value)) return
      if (selected !== undefined) {
        if (Number.isInteger(selected) && selected >= 0 && selected < value.length) visit(value[selected], depth + 1, [...path, selected])
      } else {
        for (let index = 0; index < value.length && entries.length < limit; index++) visit(value[index], depth + 1, [...path, index])
      }
    } else if ((selected === undefined || selected === part) && value && Object.hasOwn(value, part)) {
      visit(value[part], depth + 1, [...path, part])
    }
  }
  visit(response, 0, [])
  return entries
}

export function readValues(response, source, selectedPath, limit = Infinity) {
  return readResponseEntries(response, source, selectedPath, limit).map(entry => entry.value)
}

export function resolveMappingLinks(operations, catalogs) {
  const byId = new Map()
  for (const operation of operations) {
    if (!operation.id) continue
    const key = JSON.stringify([operation.apiId ?? 'local', operation.id])
    byId.set(key, byId.has(key) ? null : operation)
  }
  const links = openApiMappingLinks(operations)
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
      const objectPath = target.objectPath
      if (objectPath != null && (location !== 'body' || typeof target.name !== 'string' ||
        !Array.isArray(objectPath) || !objectPath.length || objectPath.length > 16 ||
        objectPath.some(part => part !== null && typeof part !== 'string'))) continue
      links.push({ from, to, location, name: target.name, objectPath: objectPath ?? undefined, source, origin: 'mapping', evidence: mapping.evidence, description: mappingExplanation(mapping), match: mapping.match ?? 'explicit' })
    }
  }
  return links
}

export function indexValueSources(links) {
  const index = new Map()
  for (const link of links) {
    if (link.navigationOnly || Object.hasOwn(link, 'constant')) continue
    const key = valueSourceKey(link.to, link.location, link.name)
    const entries = index.get(key) ?? new Map()
    const parts = [...sourcePath(link.source)]
    if (link.source.property != null) parts.push(link.source.property)
    const path = parts.reduce((text, part) => text + (part === null ? '[*]' :
      typeof part === 'number' ? `[${part}]` :
      /^[a-zA-Z_$][\w$]*$/.test(part) ? '.' + part : `[${JSON.stringify(part)}]`), '$')
    const id = JSON.stringify([link.from.key, link.location, link.name, link.objectPath, path, link.source.responseStatus])
    if (!entries.has(id)) entries.set(id, {
      id, operation: link.from, name: link.name, objectPath: link.objectPath, path, selector: sourcePath(link.source), status: link.source.responseStatus, origin: link.origin, match: link.match,
    })
    index.set(key, entries)
  }
  for (const [key, entries] of index) index.set(key, [...entries.values()].sort((a, b) =>
    Number(b.origin === 'openapi') - Number(a.origin === 'openapi') ||
    Number(['GET', 'HEAD'].includes(b.operation.method)) - Number(['GET', 'HEAD'].includes(a.operation.method))))
  return index
}

function valueSourceKey(operation, location, name) {
  return JSON.stringify([operation.key, location, location === 'body' ? null : name])
}

export function useRelatedEndpoints(configuration, operations, externalContexts = ref([]), authentication) {
  const mappings = ref([])
  const error = ref('')
  const pending = ref(false)

  watch([() => configuration.value?.endpointMappingsUrl, () => authentication?.apiRevision('local')], async ([url], previous, onCleanup) => {
    mappings.value = []; error.value = ''; pending.value = false
    if (!url) return
    pending.value = true
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    try {
      const options = { signal: controller.signal, headers: { Accept: 'application/json' } }
      const response = await (authentication?.metadataFetch(url, 'local', options) ?? fetch(url, options))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const entries = await response.json()
      if (!Array.isArray(entries)) throw new Error('Expected a list of endpoint mappings')
      if (!controller.signal.aborted) mappings.value = entries
    } catch (cause) {
      if (!controller.signal.aborted) error.value = `Could not load related endpoints. ${cause.message}`
    } finally { if (!controller.signal.aborted) pending.value = false }
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

  const valueSources = computed(() => indexValueSources(links.value))
  function sourcesFor(operation, location, name) {
    const sources = valueSources.value.get(valueSourceKey(operation, location, name)) ?? []
    return location === 'body' && name !== undefined ? sources.filter(source => source.name === name) : sources
  }

  function mappedEntries(link, result) {
    if (!result || result.incomplete || (!result.ok && link.origin !== 'openapi')) return []
    const status = link.source.responseStatus
    if (/^[1-5]XX$/i.test(status ?? '') && Object.hasOwn(link.from.responses ?? {}, String(result.status))) return []
    if (status === 'default' && Object.keys(link.from.responses ?? {}).some(code => code === String(result.status) || /^[1-5]XX$/i.test(code) && code[0] === String(result.status)[0])) return []
    if (status && status !== 'default' && !(status === String(result.status) || /^[1-5]XX$/i.test(status) && status[0] === String(result.status)[0])) return []
    if (link.navigationOnly) return [{}]
    if (Object.hasOwn(link, 'constant')) return link.location === 'body' || link.constant !== null ? [{value:link.constant}] : []
    if (result.json === undefined) return []
    return readResponseEntries(result.json, link.source, result.selectedPath, RELATED_VALUE_LIMIT)
      .filter(entry => link.location === 'body' || entry.value !== null)
  }
  function provenance(link, entry, result) {
    return { binding: entry.path ? { operationKey: link.from.key, path: entry.path } : undefined, sourceResult: result, origin: link.origin, linkName: link.linkName, evidence: link.evidence, match: link.match, description: link.description }
  }

  function targetsFor(operation, result) {
    const byTarget = new Map(), declared = new Map(), descriptions = new Map()
    for (const link of links.value) {
      if (link.from.key !== operation.key || link.objectPath) continue
      const values = mappedEntries(link, result)
      if (!values.length) continue
      if (link.description) descriptions.set(link.to, [...(descriptions.get(link.to) ?? []), link.description])
      if (link.origin === 'openapi') declared.set(link.to, [...(declared.get(link.to) ?? []), link.description].filter(Boolean))
      const matches = byTarget.get(link.to) ?? new Map()
      for (const entry of link.navigationOnly ? [] : values) {
        const value = entry.value
        const key = JSON.stringify([link.location, link.name, value])
        if (!matches.has(key)) matches.set(key, { location: link.location, name: link.name, value, ...provenance(link, entry, result) })
      }
      byTarget.set(link.to, matches)
    }
    return [...byTarget].map(([operation, matches]) => ({ operation, candidates: [...matches.values()], preferred: declared.has(operation), description: [...new Set(descriptions.get(operation) ?? [])].join('\n\n') }))
  }

  function choicesFor(operation, location, name, results, objectPath) {
    const choices = new Map()
    for (const link of links.value) {
      if (link.navigationOnly || link.to.key !== operation.key || link.location !== location ||
        (location !== 'body' && link.name !== name) ||
        JSON.stringify(link.objectPath) !== JSON.stringify(objectPath)) continue
      for (const result of results.get(link.from.key) ?? []) {
        for (const entry of mappedEntries(link, result)) {
          const value = entry.value
          const key = JSON.stringify([link.name, value])
          if (!choices.has(key)) choices.set(key, { key, name: link.name, value, ...provenance(link, entry, result), source: (link.from.apiId && link.from.apiId !== 'local' ? link.from.apiName + ' · ' : '') + link.from.name })
        }
      }
    }
    return [...choices.values()]
  }

  function selectablePaths(operation) {
    return links.value.filter(link => !link.navigationOnly && !Object.hasOwn(link, 'constant') && link.from.key === operation.key).map(link => sourcePath(link.source))
  }

  return { error, targetsFor, choicesFor, sourcesFor, selectablePaths, mappings: graphMappings, links, pending }
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
  if (choice.bodyPath) {
    let object = body
    for (const segment of choice.bodyPath.slice(0, -1)) {
      if (!object || typeof object !== 'object' || !Object.hasOwn(object, segment))
        throw new Error('The selected request body position no longer exists.')
      object = object[segment]
    }
    if (!object || typeof object !== 'object' || Array.isArray(object))
      throw new Error('The selected request body position is not a JSON object.')
    Object.defineProperty(object, choice.bodyPath.at(-1), { value, enumerable: true, writable: true, configurable: true })
    session.body = JSON.stringify(body, null, 2)
  } else {
    session.body = JSON.stringify({ ...body, [name]: value }, null, 2)
  }
}

// An explicit user selection wins. Otherwise prefer one unambiguous declared
// Link value over supplemental inferred values; never guess between two Links.
export function preferredRelatedChoice(choices, selected = []) {
  if (selected.length) return selected.length === 1 ? selected[0] : null
  const declared = choices.filter(choice => choice.origin === 'openapi')
  return declared.length === 1 ? declared[0] : choices.length === 1 ? choices[0] : null
}
