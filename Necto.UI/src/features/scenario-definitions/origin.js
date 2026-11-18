export function sharedOrigin(value) {
  return value &&
    ['builder', 'chain'].includes(value.kind) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 2000 &&
    typeof value.revision === 'string' &&
    /^[a-f0-9]{64}$/.test(value.revision)
    ? { kind: value.kind, id: value.id, revision: value.revision }
    : undefined
}
