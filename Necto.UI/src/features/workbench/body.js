export const isJson = (type) => /(?:\/|\+)json(?:;|$)/i.test(type)
export function bodyContent(operation, draft = {}) {
  const entries = Object.entries(operation.requestBody?.content ?? {})
  return (
    entries.find(([type]) => type === draft.mediaType) ??
    entries.find(([type]) => isJson(type)) ??
    entries[0]
  )
}
export function formFields(operation, mediaType) {
  const media = operation.requestBody?.content?.[mediaType]
  const schema = operation.resolve(media?.schema) ?? {}
  const properties = Object.assign(
    {},
    ...[schema, ...(schema.allOf ?? []).map(operation.resolve)].map(
      (part) => part?.properties ?? {}
    )
  )
  const required = new Set([
    ...(schema.required ?? []),
    ...(schema.allOf ?? []).flatMap(
      (part) => operation.resolve(part)?.required ?? []
    )
  ])
  return Object.entries(properties)
    .filter(([, value]) => !operation.resolve(value)?.readOnly)
    .map(([name, raw]) => {
      const value = operation.resolve(raw) ?? {},
        item = operation.resolve(value.items) ?? value
      const example =
        value.example ??
        value.examples?.[0] ??
        value.default ??
        (value.type === 'boolean' ? false : '')
      return {
        name,
        value:
          typeof example === 'object'
            ? JSON.stringify(example)
            : String(example),
        enabled: required.has(name) || example !== '',
        kind: item.format === 'binary' ? 'file' : 'text',
        required: required.has(name),
        multiple: value.type === 'array',
        files: []
      }
    })
}
export function payloadSnapshot(draft) {
  return {
    ...(draft.bodyVariants ? { bodyVariants: { ...draft.bodyVariants } } : {}),
    mediaType: draft.mediaType,
    extraHeaders: draft.extraHeaders ? { ...draft.extraHeaders } : undefined,
    extraQuery: draft.extraQuery?.map(row => [...row]),
    binaryAttachmentRequired: Boolean(
      draft.binaryFile || draft.binaryAttachmentRequired
    ),
    formFields: draft.formFields?.map(({ files, ...row }) => ({
      ...row,
      files: [],
      attachmentRequired: Boolean(files?.length || row.attachmentRequired)
    }))
  }
}
export function validatePayloadSnapshot(snapshot) {
  if (snapshot.bodyVariants !== undefined && (!snapshot.bodyVariants || Array.isArray(snapshot.bodyVariants) || typeof snapshot.bodyVariants !== 'object' || Object.keys(snapshot.bodyVariants).length > 1000 || Object.entries(snapshot.bodyVariants).some(([key,index]) => (key !== '' && !key.startsWith('/')) || key.length > 2048 || !Number.isInteger(index) || index < 0 || index > 1000))) throw new Error('Invalid body schema variants.')
  if (snapshot.extraHeaders !== undefined && (!snapshot.extraHeaders || Array.isArray(snapshot.extraHeaders) || typeof snapshot.extraHeaders !== 'object' || Object.keys(snapshot.extraHeaders).length > 100 || Object.values(snapshot.extraHeaders).some(value => typeof value !== 'string'))) throw new Error('Invalid imported headers.')
  if (snapshot.extraQuery !== undefined && (!Array.isArray(snapshot.extraQuery) || snapshot.extraQuery.length > 200 || snapshot.extraQuery.some(row => !Array.isArray(row) || row.length !== 2 || row.some(value => typeof value !== 'string')))) throw new Error('Invalid imported query inputs.')
  if (
    snapshot.mediaType !== undefined &&
    typeof snapshot.mediaType !== 'string'
  )
    throw new Error('Invalid body media type.')
  if (
    snapshot.formFields !== undefined &&
    (!Array.isArray(snapshot.formFields) ||
      snapshot.formFields.length > 200 ||
      snapshot.formFields.some(
        (row) =>
          typeof row.name !== 'string' ||
          typeof row.value !== 'string' ||
          !['file', 'text'].includes(row.kind) ||
          typeof row.enabled !== 'boolean'
      ))
  )
    throw new Error('Invalid saved form fields.')
}
function formValues(row) {
  if (row.kind === 'file') return row.files ?? []
  if (row.multiple) {
    try {
      const values = JSON.parse(row.value)
      if (Array.isArray(values))
        return values.map((value) =>
          typeof value === 'object' ? JSON.stringify(value) : String(value)
        )
    } catch {
      /* A single value is also accepted. */
    }
  }
  return [row.value]
}
export function buildNonJsonBody(operation, draft, type) {
  if (
    type === 'multipart/form-data' ||
    type === 'application/x-www-form-urlencoded'
  ) {
    const rows = draft.formFields ?? formFields(operation, type)
    const result =
      type === 'multipart/form-data' ? new FormData() : new URLSearchParams()
    for (const row of rows) {
      if (!row.enabled) {
        if (row.required) throw new Error(`${row.name} is required.`)
        continue
      }
      if (!row.name || /[\r\n]/.test(row.name))
        throw new Error('Enter a valid form field name.')
      const values = formValues(row)
      if (
        row.kind === 'file' &&
        (row.required || row.attachmentRequired) &&
        !values.length
      )
        throw new Error(
          `Choose a file for ${row.name}. Files are not retained in saved requests.`
        )
      if (row.kind !== 'file' && row.required && row.value === '')
        throw new Error(`${row.name} is required.`)
      if (type === 'application/x-www-form-urlencoded' && row.kind === 'file')
        throw new Error('File uploads require multipart/form-data.')
      for (const value of values) {
        if (value instanceof Blob)
          result.append(row.name, value, value.name ?? 'upload.bin')
        else result.append(row.name, String(value))
      }
    }
    return result
  }
  if (
    type === 'application/octet-stream' ||
    operation.resolve(operation.requestBody?.content?.[type]?.schema)
      ?.format === 'binary'
  ) {
    if (
      !(draft.binaryFile instanceof Blob) &&
      !operation.requestBody?.required &&
      !draft.binaryAttachmentRequired
    )
      return undefined
    if (!(draft.binaryFile instanceof Blob))
      throw new Error('Choose a file to send as the request body.')
    return draft.binaryFile
  }
  return draft.body ?? ''
}
export function describeBody(body) {
  if (body instanceof FormData)
    return Object.fromEntries(
      [...body].map(([key, value]) => [
        key,
        value instanceof Blob
          ? `[file: ${value.name ?? 'upload.bin'}, ${value.size} bytes]`
          : value
      ])
    )
  if (body instanceof URLSearchParams) return Object.fromEntries(body)
  if (body instanceof Blob) return `[binary body: ${body.size} bytes]`
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}
