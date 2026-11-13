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

export function jsonContent(operation) {
  return Object.entries(operation.requestBody?.content ?? {}).find(([type]) =>
    type === 'application/json' || type.endsWith('+json'),
  )
}

function schemaExample(operation, schema, ancestors = new Set(), useExamples = true) {
  schema = operation.resolve(schema)
  if (!schema || ancestors.has(schema)) return null
  const nested = new Set(ancestors).add(schema)
  const example = schema.examples?.[0] ?? schema.enum?.[0] ?? schema.const ?? schema.default
  if (useExamples && Object.hasOwn(schema, 'example')) return schema.example
  if (useExamples && example !== undefined) return example
  if (schema.oneOf || schema.anyOf) return schemaExample(operation, (schema.oneOf ?? schema.anyOf)[0], nested, useExamples)
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map(part => schemaExample(operation, part, nested, useExamples)))

  const type = Array.isArray(schema.type) ? schema.type.find(type => type !== 'null') : schema.type
  if (type === 'object' || schema.properties) {
    return Object.fromEntries(Object.entries(schema.properties ?? {})
      .filter(([, property]) => !operation.resolve(property)?.readOnly)
      .map(([name, property]) => [name, schemaExample(operation, property, nested, useExamples)]))
  }
  if (type === 'array') return schema.items ? [schemaExample(operation, schema.items, nested, useExamples)] : []
  if (type === 'boolean') return false
  if (type === 'integer' || type === 'number') return schema.minimum ?? 0
  if (type === 'string') return 'string'
  return null
}

export function initialBody(operation) {
  const content = jsonContent(operation)?.[1]
  if (!content) return ''
  if (Object.hasOwn(content, 'example')) return formatJson(content.example)
  for (const entry of Object.values(content.examples ?? {})) {
    const example = operation.resolve(entry)
    if (example && Object.hasOwn(example, 'value')) return formatJson(example.value)
  }
  return formatJson(content.schema ? schemaExample(operation, content.schema) : {})
}

function bodyValue(value, example) {
  if (typeof example === 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

export function applyBodyPresets(operation, body, values) {
  const layers = values.get(bodyPresets)
  const matches = new Set()
  const sources = []
  const sourceNames = presetOrigins.get(values)?.bodyNames ?? []
  if (!layers) return { body, matches, sources }
  let parsed
  try { parsed = JSON.parse(body.trim() ? body : '{}') } catch { return { body, matches, sources } }
  const shape = schemaExample(operation, jsonContent(operation)?.[1].schema, new Set(), false)
  let applied = false
  function fill(value, example, root = false, path = []) {
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
  const filled = fill(parsed, shape, true)
  return { body: applied ? formatJson(filled) : body, matches, applied, sources }
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

function requestUrl(operation, configuration) {
  const server = configuration.overrideServer ? undefined : operation.server
  const serverUrl = server?.url.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = server.variables?.[name]?.default
    if (value === undefined) throw new Error(`The API server variable ${name} has no default.`)
    return value
  })
  const url = serverUrl
    ? new URL(serverUrl, configuration.openApiUrl)
    : new URL(configuration.apiBaseUrl ?? '/', configuration.openApiUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The API server must use HTTP or HTTPS.')
  return url
}

export function buildRequest(operation, configuration, draft, values = new Map()) {
  configuration = operation.configuration ?? configuration
  const url = requestUrl(operation, configuration)
  const headers = new Headers()
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

  const options = { method: operation.method, headers }
  if (operation.requestBody) {
    const content = jsonContent(operation)
    if (!content) throw new Error('This request needs a body format other than JSON.')
    const { body } = applyBodyPresets(operation, draft.body, values)
    if (body.trim() || operation.requestBody.required) {
      try {
        JSON.parse(body)
      } catch (cause) {
        throw new Error(jsonBodyIssue(body, cause))
      }
      options.body = body
      if (!values.has('header:content-type')) headers.set('Content-Type', content[0])
    }
  }
  for (const [key, value] of values) {
    if (typeof key === 'string' && key.startsWith('header:') && !declared.has(key)) headers.set(key.slice(7), value)
  }
  return { url, options }
}

async function parseResponse(text, signal) {
  signal?.throwIfAborted()
  if (text.length < 1000000 || typeof Worker === 'undefined') {
    try { return JSON.parse(text) } catch { return undefined }
  }
  const worker = new Worker(new URL('./json.worker.js', import.meta.url), { type: 'module' })
  let abort
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason)
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) { abort(); return }
      worker.onmessage = ({ data }) => resolve(data.valid ? data.json : undefined)
      worker.onerror = () => reject(new Error('Could not parse the response in the background.'))
      worker.postMessage(text)
    })
  } finally { signal?.removeEventListener('abort', abort); worker.terminate() }
}

export async function sendRequest(request) {
  const response = await fetch(request.url, request.options)
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  const json = text ? await parseResponse(text, request.options.signal) : undefined
  request.options.signal?.throwIfAborted()
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType,
    rawText: text,
    text,
    json,
  }
}
