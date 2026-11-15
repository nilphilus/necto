import { schemaTemplate, formatTemplate, TemplateLimitError, TEMPLATE_CHARACTER_LIMIT, TEMPLATE_NOTICE } from './schemaTemplate.js'
import { bodyContent, buildNonJsonBody, isJson } from '../workbench/body.js'
import { jsonBodyIssue } from './bodyHelp.js'
export const formatJson = value => JSON.stringify(value, null, 2)
export const fieldKey = parameter => `${parameter.in}:${parameter.name}`
export const supportedParameters = operation => operation.parameters.filter(
  parameter => ['path', 'query', 'header'].includes(parameter.in),
)

export function contextKey(parameter) {
  return parameter.in === 'header' ? fieldKey(parameter).toLowerCase() : fieldKey(parameter)
}

export function migratePreset(entries) {
  const preset = new Map()
  for (const [key, value] of entries) {
    const [location, name] = key.match(/^(header|path|query):(.*)$/)?.slice(1) ?? ['', key]
    preset.set(name, { value, legacyHeader: location === 'header' || preset.get(name)?.legacyHeader })
  }
  return preset
}

const bodyPresets = Symbol('body presets')

function matchingPreset(name, siblings, layer) {
  if (layer.has(name)) return layer.get(name)
  const lower = name.toLowerCase()
  if (siblings.filter(sibling => sibling.toLowerCase() === lower).length !== 1) return
  const aliases = [...layer.keys()].filter(candidate => candidate.toLowerCase() === lower)
  if (aliases.length === 1) return layer.get(aliases[0])
}

const presetOrigins = new WeakMap()

export function presetSource(values, key) { return presetOrigins.get(values)?.parameters.get(key) }

export function resolveRequestValues(operation, ...layers) { return resolveLayers(operation, layers) }

export function resolveNamedRequestValues(operation, ...layers) {
  const available = layers.filter(entry => entry?.values)
  return resolveLayers(operation, available.map(entry => entry.values), available.map(entry => entry.name))
}

function resolveLayers(operation, layers, sourceNames = []) {
  const parameters = supportedParameters(operation)
  const values = new Map()
  const sources = new Map()
  presetOrigins.set(values, { parameters: sources, bodyNames: sourceNames })
  const declared = new Set(parameters.map(contextKey))
  const namesByLocation = new Map()
  for (const { in: location, name } of parameters) {
    if (!namesByLocation.has(location)) namesByLocation.set(location, [])
    namesByLocation.get(location).push(name)
  }
  const activeLayers = layers.filter(Boolean)
  for (const [index, layer] of activeLayers.entries()) {
    for (const [name, { value, legacyHeader }] of layer) {
      const headerKey = 'header:' + name.toLowerCase()
      if (!declared.has(headerKey) && (legacyHeader || values.has(headerKey))) {
        values.set(headerKey, value)
        sources.set(headerKey, sourceNames[index])
      }
    }
    for (const parameter of parameters) {
      const entry = matchingPreset(parameter.name, namesByLocation.get(parameter.in), layer)
      if (entry) {
        values.set(contextKey(parameter), entry.value)
        sources.set(contextKey(parameter), sourceNames[index])
      }
    }
  }
  if (activeLayers.length && jsonContent(operation)) {
    values.set(bodyPresets, activeLayers.map(layer => new Map(layer)))
  }
  return values
}

export function jsonContent(operation, mediaType) {
  return Object.entries(operation.requestBody?.content ?? {}).find(([type]) =>
    (mediaType === undefined || type === mediaType) && isJson(type),
  )
}

export function initialPayload(operation, mediaType) {
  try {
    const entry = bodyContent(operation, { mediaType })
    const content = entry?.[1]
    if (entry && !isJson(entry[0])) {
      const example = content.example ?? Object.values(content.examples ?? {}).map(operation.resolve).find(value => value && Object.hasOwn(value, 'value'))?.value
      if (typeof example === 'string' && example.length > TEMPLATE_CHARACTER_LIMIT) throw new TemplateLimitError()
      return { body: example === undefined ? '' : typeof example === 'string' ? example : formatTemplate(example), notice: '' }
    }
    if (!content) return { body: '', notice: '' }
    if (Object.hasOwn(content, 'example')) return { body: formatTemplate(content.example), notice: '' }
    for (const entry of Object.values(content.examples ?? {})) {
      const example = operation.resolve(entry)
      if (example && Object.hasOwn(example, 'value')) return { body: formatTemplate(example.value), notice: '' }
    }
    return { body: formatTemplate(content.schema ? schemaTemplate(operation, content.schema) : {}), notice: '' }
  } catch (error) {
    if (!(error instanceof TemplateLimitError)) throw error
    return { body: '', notice: TEMPLATE_NOTICE }
  }
}
export const initialBody = (operation, mediaType) => initialPayload(operation, mediaType).body

function bodyValue(value, example) {
  if (typeof example === 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

export function applyBodyPresets(operation, body, values, mediaType) {
  const layers = values.get(bodyPresets)
  const matches = new Set()
  const sources = []
  const sourceNames = presetOrigins.get(values)?.bodyNames ?? []
  if (!layers) return { body, matches, sources }
  let parsed
  try { parsed = JSON.parse(body.trim() ? body : '{}') } catch { return { body, matches, sources } }
  let shape
  try { shape = schemaTemplate(operation, jsonContent(operation, mediaType)?.[1].schema, false) }
  catch (error) {
    if (!(error instanceof TemplateLimitError)) throw error
    return { body, matches, sources, notice: 'Automatic body presets exceed the generation budget. Disable body presets and enter the request body manually.' }
  }
  let applied = false
  let visited = 0
  function fill(value, example, root = false, path = []) {
    if (++visited > 5000 || path.length > 24) throw new TemplateLimitError()
    if (Array.isArray(value)) return value.map((item, index) => fill(item, example?.[index] ?? example?.[0], false, [...path, index]))
    if (!value || typeof value !== 'object') return value
    if (!example || typeof example !== 'object' || Array.isArray(example)) example = {}
    const names = [...new Set([...Object.keys(value), ...Object.keys(example)])]
    const entries = []
    for (const name of names) {
      let source
      const entry = layers.reduce((previous, layer, index) => {
        const candidate = matchingPreset(name, names, layer)
        if (candidate) source = sourceNames[index]
        return candidate ?? previous
      }, undefined)
      const present = Object.hasOwn(value, name)
      const sample = Object.hasOwn(example, name) ? example[name] : undefined
      if (entry) {
        applied = true
        if (source) sources.push({ path: [...path, name], preset: source })
        if (root) matches.add(name)
        entries.push([name, bodyValue(entry.value, sample ?? (present ? value[name] : undefined))])
      } else if (present) {
        entries.push([name, fill(value[name], sample, false, [...path, name])])
      } else if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        const nested = fill({}, sample, false, [...path, name])
        if (Object.keys(nested).length) entries.push([name, nested])
      }
    }
    return Object.fromEntries(entries)
  }
  try {
    const filled = fill(parsed, shape, true)
    return { body: applied ? formatJson(filled) : body, matches, applied, sources }
  } catch (error) {
    if (!(error instanceof TemplateLimitError)) throw error
    return { body, matches: new Set(), sources: [], notice: 'Automatic body presets exceed the generation budget. Disable body presets and enter the request body manually.' }
  }
}

export function presetInputs(operation, body, values) {
  const parameters = [...(presetOrigins.get(values)?.parameters ?? [])].filter(([, preset]) => preset).map(([key, preset]) => ({
    key, label: key, preset, value: key.startsWith('header:') ? 'Header value hidden' : String(values.get(key)),
  }))
  const fields = applyBodyPresets(operation, body, values).sources.map(({ path, preset }) => ({
    key: JSON.stringify(path), label: 'body ' + path.map(part => `[${JSON.stringify(part)}]`).join(''), preset,
  }))
  return [...parameters, ...fields]
}

export function hasPresetFor(operation, body, values) {
  return [...values.keys()].some(key => key !== bodyPresets) || applyBodyPresets(operation, body, values).applied
}

function parameterValue(operation, parameter, input) {
  const type = operation.resolve(parameter.schema)?.type
  if (type !== 'array' && type !== 'object') return input
  try {
    const value = JSON.parse(input)
    if (type === 'array' ? Array.isArray(value) : value && typeof value === 'object' && !Array.isArray(value)) {
      return value
    }
  } catch {
    // Report the field name and expected type below.
  }
  throw new Error(`${parameter.name} must be a JSON ${type}.`)
}

function serializeParameter(parameter, value, url, path) {
  const { name, in: location } = parameter
  const style = parameter.style ?? (location === 'query' ? 'form' : 'simple')
  const explode = parameter.explode ?? style === 'form'
  const object = typeof value === 'object' && !Array.isArray(value)
  const array = Array.isArray(value)
  const items = object ? Object.entries(value) : array ? value : [value]
  const encode = location === 'path' ? encodeURIComponent : String
  const parts = object
    ? items.flatMap(([key, entry]) => explode ? [`${encode(key)}=${encode(entry)}`] : [encode(key), encode(entry)])
    : items.map(encode)

  if (location === 'query') {
    if (object && style === 'deepObject') {
      for (const [key, entry] of items) url.searchParams.append(`${name}[${key}]`, entry)
    } else if (object && explode) {
      for (const [key, entry] of items) url.searchParams.append(key, entry)
    } else if (array && explode) {
      for (const entry of items) url.searchParams.append(name, entry)
    } else {
      const separator = style === 'spaceDelimited' ? ' ' : style === 'pipeDelimited' ? '|' : ','
      url.searchParams.append(name, parts.join(separator))
    }
    return
  }
  if (location === 'header') return parts.join(',')

  let serialized = parts.join(',')
  if (style === 'label') serialized = '.' + parts.join(explode ? '.' : ',')
  if (style === 'matrix') {
    const label = `;${encode(name)}=`
    serialized = object && explode ? ';' + parts.join(';') : label + parts.join(explode ? label : ',')
  }
  if (serialized === '.' || serialized === '..') throw new Error(`${name} cannot be a dot segment.`)
  return path.replaceAll(`{${name}}`, () => serialized)
}

export function requestUrl(operation, configuration) {
  const selected = operation.requestServer ?? configuration.serverProfiles?.[operation.apiId ?? 'local']
  const server = selected ?? (configuration.overrideServer ? undefined : operation.server)
  const serverUrl = server?.url.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = server.values?.[name] ?? server.variables?.[name]?.default
    if (value === undefined) throw new Error(`The API server variable ${name} has no default.`)
    return value
  })
  const url = serverUrl
    ? new URL(serverUrl, configuration.openApiUrl)
    : new URL(configuration.apiBaseUrl ?? '/', configuration.openApiUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('The API server must use HTTP or HTTPS.')
  return url
}

export function buildRequest(operation, configuration, draft, values = new Map()) {
  if (draft.serverIndex >= 0 && operation.servers?.[draft.serverIndex]) operation = { ...operation, requestServer: { ...operation.servers[draft.serverIndex], values: draft.serverValues ?? {} } }
  configuration = operation.configuration ? { ...operation.configuration, serverProfiles: configuration.serverProfiles } : configuration
  const url = requestUrl(operation, configuration)
  const headers = new Headers(draft.extraHeaders ?? {})
  for (const [name, value] of draft.extraQuery ?? []) url.searchParams.append(name, value)
  const parameters = supportedParameters(operation)
  const declared = new Set(parameters.map(contextKey))
  let path = operation.path
  for (const parameter of parameters) {
    const key = contextKey(parameter)
    const input = values.has(key) ? values.get(key) : draft.fields[fieldKey(parameter)]
    if (input === undefined || input === '') {
      if (parameter.required || parameter.in === 'path') throw new Error(`${parameter.name} is required.`)
      continue
    }
    const value = parameterValue(operation, parameter, input)
    const serialized = serializeParameter(parameter, value, url, path)
    if (parameter.in === 'path') path = serialized
    if (parameter.in === 'header') headers.set(parameter.name, serialized)
  }
  if (/\{[^}]+\}/.test(path)) throw new Error('A path parameter is missing.')
  url.pathname = url.pathname.replace(/\/$/, '') + path

  if (['CONNECT', 'TRACE', 'TRACK'].includes(operation.method.toUpperCase())) throw new Error('This HTTP method is blocked by browsers. Export a code snippet to use a compatible client.')
  const options = { method: operation.method, headers }
  if (operation.requestBody) {
    const content = bodyContent(operation, draft)
    if (!content) throw new Error('This request has no supported media type.')
    if (isJson(content[0])) {
      const { body, notice } = applyBodyPresets(operation, draft.body ?? '', values, content[0])
      if (notice) throw new Error(notice)
      if (body.trim() || operation.requestBody.required) {
        try { JSON.parse(body) } catch (cause) { throw new Error(jsonBodyIssue(body, cause)) }
        options.body = body
      }
    } else options.body = buildNonJsonBody(operation, draft, content[0])
    if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', content[0])
  }
  for (const [key, value] of values) {
    if (typeof key === 'string' && key.startsWith('header:') && !declared.has(key)) headers.set(key.slice(7), value)
  }
  if (options.body instanceof FormData) headers.delete('Content-Type')
  return { url, options }
}

export { sendRequest } from '../workbench/response.js'
