export const formatJson = value => JSON.stringify(value, null, 2)
export const fieldKey = parameter => `${parameter.in}:${parameter.name}`
export const supportedParameters = operation => operation.parameters.filter(
  parameter => ['path', 'query', 'header'].includes(parameter.in),
)

export function contextKey(parameter) {
  return parameter.in === 'header' ? fieldKey(parameter).toLowerCase() : fieldKey(parameter)
}

export function resolveRequestValues(operation, ...layers) {
  const queryKeys = supportedParameters(operation)
    .filter(parameter => parameter.in === 'query')
    .map(contextKey)
  const values = new Map()
  for (const layer of layers) {
    for (const [key, value] of layer) {
      if (!key.startsWith('query:') || queryKeys.includes(key)) {
        values.set(key, value)
        continue
      }
      const normalized = key.toLowerCase()
      const matches = queryKeys.filter(queryKey => queryKey.toLowerCase() === normalized)
      if (matches.length !== 1 || layer.has(matches[0])) continue
      const aliases = [...layer.keys()].filter(alias => alias.toLowerCase() === normalized)
      if (aliases.length === 1) values.set(matches[0], value)
    }
  }
  return values
}

export function jsonContent(operation) {
  return Object.entries(operation.requestBody?.content ?? {}).find(([type]) =>
    type === 'application/json' || type.endsWith('+json'),
  )
}

function schemaExample(operation, schema, ancestors = new Set()) {
  schema = operation.resolve(schema)
  if (!schema || ancestors.has(schema)) return null
  const nested = new Set(ancestors).add(schema)
  const example = schema.examples?.[0] ?? schema.enum?.[0] ?? schema.const ?? schema.default
  if (Object.hasOwn(schema, 'example')) return schema.example
  if (example !== undefined) return example
  if (schema.oneOf || schema.anyOf) return schemaExample(operation, (schema.oneOf ?? schema.anyOf)[0], nested)
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map(part => schemaExample(operation, part, nested)))

  const type = Array.isArray(schema.type) ? schema.type.find(type => type !== 'null') : schema.type
  if (type === 'object' || schema.properties) {
    return Object.fromEntries(Object.entries(schema.properties ?? {})
      .filter(([, property]) => !operation.resolve(property)?.readOnly)
      .map(([name, property]) => [name, schemaExample(operation, property, nested)]))
  }
  if (type === 'array') return schema.items ? [schemaExample(operation, schema.items, nested)] : []
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
    if (draft.body.trim() || operation.requestBody.required) {
      try {
        JSON.parse(draft.body)
      } catch {
        throw new Error('Enter a valid JSON request body.')
      }
      options.body = draft.body
      if (!values.has('header:content-type')) headers.set('Content-Type', content[0])
    }
  }
  for (const [key, value] of values) {
    if (key.startsWith('header:') && !declared.has(key)) headers.set(key.slice(7), value)
  }
  return { url, options }
}

async function parseResponse(text) {
  if (text.length < 1000000 || typeof Worker === 'undefined') {
    try { return JSON.parse(text) } catch { return undefined }
  }
  const worker = new Worker(new URL('./json.worker.js', import.meta.url), { type: 'module' })
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => resolve(data.valid ? data.json : undefined)
      worker.onerror = () => reject(new Error('Could not parse the response in the background.'))
      worker.postMessage(text)
    })
  } finally { worker.terminate() }
}

export async function sendRequest(request) {
  const response = await fetch(request.url, request.options)
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  const json = text ? await parseResponse(text) : undefined
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
