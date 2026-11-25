import { parse } from 'yaml'
export const DOCUMENT_LIMIT = 5 * 1024 * 1024
export function parseDocument(text, { onConversion } = {}) {
  if (text.length > DOCUMENT_LIMIT)
    throw new Error('API document exceeds 5 MB.')
  const document = parse(text, { maxAliasCount: 100, uniqueKeys: true })
  if (!document || typeof document !== 'object' || Array.isArray(document))
    throw new Error('Expected an API document.')
  if (document.swagger === '2.0') {
    onConversion?.('Swagger 2.0')
    return convertSwagger(document)
  }
  if (!/^3\.[012]\.\d+$/.test(document.openapi ?? ''))
    throw new Error(
      'Supported documents: Swagger 2.0 and OpenAPI 3.0–3.2. OpenAPI 3.2 support is partial.'
    )
  if (document.openapi.startsWith('3.2.'))
    document['x-necto-import-warning'] =
      'OpenAPI 3.2: common HTTP operations are supported. Additional operations, QUERY serialization, media-type-level changes and itemSchema are not fully supported.'
  return document
}
function convertSwagger(source) {
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.map(rewrite)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === '$ref'
          ? item
              .replace('#/definitions/', '#/components/schemas/')
              .replace('#/parameters/', '#/components/parameters/')
              .replace('#/responses/', '#/components/responses/')
          : rewrite(item)
      ])
    )
  }
  const document = rewrite(source),
    content = (types, schema) =>
      Object.fromEntries(
        (types?.length ? types : ['application/json']).map((type) => [
          type,
          { schema }
        ])
      )
  document.openapi = '3.0.3'
  document.servers = (source.schemes ?? ['https']).map((scheme) => ({
    url: source.host
      ? `${scheme}://${source.host}${source.basePath ?? ''}`
      : source.basePath || '/'
  }))
  document.components = {
    schemas: document.definitions ?? {},
    parameters: document.parameters ?? {},
    responses: document.responses ?? {},
    securitySchemes: Object.fromEntries(
      Object.entries(document.securityDefinitions ?? {}).map(
        ([key, scheme]) => [
          key,
          scheme.type === 'basic' ? { type: 'http', scheme: 'basic' } : scheme
        ]
      )
    )
  }
  for (const item of Object.values(document.paths ?? {}))
    for (const [method, operation] of Object.entries(item)) {
      if (
        !['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(
          method
        )
      )
        continue
      const parameters = [
        ...(item.parameters ?? []),
        ...(operation.parameters ?? [])
      ]
      const body = parameters.find((parameter) => parameter.in === 'body'),
        form = parameters.filter((parameter) => parameter.in === 'formData')
      operation.parameters = parameters
        .filter((parameter) => !['body', 'formData'].includes(parameter.in))
        .map((parameter) => ({
          ...parameter,
          schema: parameter.schema ?? {
            type: parameter.type,
            items: parameter.items,
            enum: parameter.enum,
            default: parameter.default,
            format: parameter.format
          }
        }))
      if (body)
        operation.requestBody = {
          required: body.required,
          description: body.description,
          content: content(operation.consumes ?? source.consumes, body.schema)
        }
      if (form.length)
        operation.requestBody = {
          content: content(
            operation.consumes ?? source.consumes ?? ['multipart/form-data'],
            {
              type: 'object',
              required: form
                .filter((field) => field.required)
                .map((field) => field.name),
              properties: Object.fromEntries(
                form.map((field) => [
                  field.name,
                  field.type === 'file'
                    ? { type: 'string', format: 'binary' }
                    : {
                        type: field.type,
                        items: field.items,
                        description: field.description
                      }
                ])
              )
            }
          )
        }
      for (const response of Object.values(operation.responses ?? {}))
        if (response.schema)
          response.content = content(
            operation.produces ?? source.produces,
            response.schema
          )
    }
  delete document.swagger
  document['x-necto-import-warning'] =
    'Converted Swagger 2.0. OAuth flow conversion and collectionFormat semantics require review.'
  return document
}
export async function readDocumentSource(text, url, fetcher) {
  let convertedFrom
  const parsed = parseDocument(text, { onConversion: version => { convertedFrom = version } })
  const document = await bundleReferences(parsed, url, fetcher)
  return { document, sourceText: text, convertedFrom }
}

export async function bundleReferences(document, baseUrl, fetcher = fetch) {
  const documents = new Map([[baseUrl, document]]),
    pending = [document],
    references = Object.create(null)
  document['x-necto-references'] = references
  for (let index = 0; index < pending.length; index++) {
    const root = pending[index],
      origin =
        [...documents].find(([, value]) => value === root)?.[0] ?? baseUrl
    const stack = [root],
      seen = new WeakSet()
    while (stack.length) {
      const value = stack.pop()
      if (
        !value ||
        typeof value !== 'object' ||
        seen.has(value) ||
        value === references
      )
        continue
      seen.add(value)
      if (
        typeof value.$ref === 'string' &&
        (!value.$ref.startsWith('#') || root !== document)
      ) {
        const url = new URL(value.$ref, origin),
          fragment = url.hash
        url.hash = ''
        if (
          !['https:', 'http:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error(
            'External references must use HTTP(S) without credentials.'
          )
        const target = url.href
        if (target === baseUrl) value.$ref = fragment || '#'
        else {
          if (!documents.has(target)) {
            if (documents.size >= 32)
              throw new Error('External reference limit: 32 documents.')
            const response = await fetcher(target, {
              credentials: 'omit',
              headers: {
                Accept: 'application/json, application/yaml, text/yaml'
              }
            })
            if (!response.ok)
              throw new Error(`External reference HTTP ${response.status}`)
            const text = await response.text()
            if (text.length > DOCUMENT_LIMIT)
              throw new Error('External reference exceeds 5 MB.')
            const child = parse(text, { maxAliasCount: 100, uniqueKeys: true })
            documents.set(target, child)
            pending.push(child)
            references[documents.size - 1] = child
          }
          const key = [...documents.keys()].indexOf(target)
          value.$ref = `#/x-necto-references/${key}${fragment.slice(1)}`
        }
      }
      stack.push(...Object.values(value))
    }
  }
  return document
}
