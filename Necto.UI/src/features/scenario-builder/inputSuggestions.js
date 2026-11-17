import { sourcePath } from '../related-endpoints/mappings.js'
import { bodyContent, isJson } from '../workbench/body.js'
import { pointer, prefix } from './bodySchema.js'
import { pointerParts } from './pointers.js'
import { dependencies } from './model.js'

export function suggestInputs(blueprint, target, operation, links) {
  if (!target || !operation) return []
  const downstream = new Set([target.id])
  let changed
  do {
    changed = false
    for (const step of blueprint.steps) {
      if (!downstream.has(step.id) && dependencies(step, blueprint).some(id => downstream.has(id))) {
        downstream.add(step.id)
        changed = true
      }
    }
  } while (changed)
  const groups = new Map()
  for (const link of links) {
    if (link.to.key !== operation.key || link.navigationOnly || Object.hasOwn(link, 'constant')) continue
    // A Builder response binding is unconditional. Only use Links whose status
    // is already enforced by the producer request.
    const parts = [...sourcePath(link.source)]
    if (link.source.property !== null) parts.push(link.source.property)
    if (parts.some(part => part == null)) continue
    const body = link.location === 'body'
    if (body && !isJson(bodyContent(operation, target.request)?.[0] ?? '')) continue
    const targetPath = link.name === null ? [] : [link.name]
    const input = { source: 'response', location: link.location, responsePointer: pointer(parts),
      ...(body ? { pointer: pointer(targetPath) } : { name: link.name }) }
    try {
      pointerParts(input.responsePointer)
      if (body) pointerParts(input.pointer)
    } catch { continue }
    if (target.inputs.some(existing => existing.location === input.location && (body
      ? prefix(targetPath, pointerParts(existing.pointer)) || prefix(pointerParts(existing.pointer), targetPath)
      : input.location === 'header' ? existing.name?.toLowerCase() === input.name?.toLowerCase() : existing.name === input.name))) continue
    const steps = blueprint.steps.filter(step => step.operationKey === link.from.key && step.apiId === (link.from.apiId ?? 'local'))
    const candidates = steps.filter(step => !downstream.has(step.id) && (!link.source.responseStatus ||
      step.request.assertions?.some(check => check.kind === 'status' && String(check.expected) === link.source.responseStatus)))
    const status = link.source.responseStatus
    if (!steps.length && link.from.key !== operation.key && ['GET', 'HEAD'].includes(link.from.method) &&
        (!status || /^2[0-9]{2}$/.test(status))) candidates.push(null)
    for (const step of candidates) {
      const field = body ? input.pointer || 'Whole body' : input.location + ' · ' + input.name
      const entries = groups.get(field) ?? []
      if (entries.some(item => item.from.key === link.from.key && item.stepId === step?.id && item.input.responsePointer === input.responsePointer)) continue
      if (entries.length >= 20 || !groups.has(field) && groups.size >= 100) continue
      entries.push({ input, from: link.from, stepId: step?.id, expectedStatus: step ? undefined : status, evidence: link.origin === 'openapi' ? 'OpenAPI Link' : link.match })
      groups.set(field, entries)
    }
  }
  return [...groups].map(([field, options]) => ({ field, options }))
}
