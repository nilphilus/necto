export function requestDefinition(request) {
  request.assertions = (request.assertions ?? []).map((check) => ({
    kind: check.kind,
    path: check.path,
    ...(!['exists', 'nonempty'].includes(check.kind) ? { expected: check.expected } : {}),
  }))
  if (request.formFields)
    request.formFields = request.formFields.map((row) => ({
      name: row.name,
      value: row.value,
      kind: row.kind,
      enabled: row.enabled,
      required: Boolean(row.required),
      multiple: Boolean(row.multiple),
      attachmentRequired: Boolean(row.attachmentRequired),
      files: [],
    }))
  return request
}
