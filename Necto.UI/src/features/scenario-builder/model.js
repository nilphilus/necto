import { payloadSnapshot, validatePayloadSnapshot, bodyContent, isJson } from '../workbench/body.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { validateAssertions } from '../workbench/assertions.js'
import { validateGenerator } from './generation.js'

export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
export const newBlueprint = () => ({ format: 'necto-scenario-builder', version: 1, id: newId(), name: 'Untitled scenario', concurrency: 4, steps: [] })
export function newStep(operation, session) {
  return { id: newId(), label: operation.name, operationKey: operation.key, apiId: operation.apiId ?? 'local', method: operation.method, path: operation.path,
    dependsOn: [], inputs: [], request: { fields: { ...session.fields }, body: session.body ?? '', ...payloadSnapshot(session), ...executionOptions(session),
      assertions: [], serverIndex: session.serverIndex, serverValues: { ...session.serverValues } } }
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
export function pointerParts(pointer) {
  if (typeof pointer !== 'string' || pointer.length > 2048 || pointer !== '' && !pointer.startsWith('/')) throw new Error('Use a JSON Pointer such as /items/0/id. Leave empty for the whole value.')
  const parts = pointer === '' ? [] : pointer.slice(1).split('/').map(part => {
    if (/~(?:[^01]|$)/.test(part)) throw new Error('Escape ~ as ~0 and / as ~1 in JSON Pointers.')
    return part.replaceAll('~1', '/').replaceAll('~0', '~')
  })
  if (parts.length > 32 || parts.some(part => forbidden.has(part))) throw new Error('This JSON Pointer is not supported.')
  return parts
}
export function readPointer(value, pointer) {
  for (const part of pointerParts(pointer)) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error(`Response has no value at ${pointer || '(root)'}.`)
    value = value[part]
  }
  if (value === undefined) throw new Error('Response has no JSON value.')
  return value
}
function assignPointer(value, parts, replacement) {
  if (!parts.length) return replacement
  const root = value
  for (const [index, part] of parts.entries()) {
    if (!value || typeof value !== 'object') throw new Error('The target JSON path crosses a scalar. Edit the request body first.')
    if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(part) || Number(part) >= value.length)) throw new Error('Target array index must already exist in the request body.')
    if (index === parts.length - 1) Object.defineProperty(value, part, { value: replacement, writable: true, enumerable: true, configurable: true })
    else {
      if (!Object.hasOwn(value, part)) Object.defineProperty(value, part, { value: {}, writable: true, enumerable: true, configurable: true })
      value = value[part]
    }
  }
  return root
}
export function inputKey(input) { return JSON.stringify([input.location, input.location === 'body' ? input.pointer : input.name]) }
export function applyInput(session, operation, input, value) {
  if (input.location !== 'body') {
    if (value === null || value === undefined) throw new Error(`${input.location}:${input.name} has no value.`)
    session.fields[`${input.location}:${input.name}`] = typeof value === 'object' ? JSON.stringify(value) : String(value)
  } else {
    const media = bodyContent(operation, session)?.[0]
    if (!isJson(media ?? '')) {
      if (input.pointer || ['multipart/form-data', 'application/x-www-form-urlencoded', 'application/octet-stream'].includes(media)) throw new Error('Dynamic body inputs require JSON, or a whole text/XML body.')
      session.body = typeof value === 'string' ? value : JSON.stringify(value)
    } else {
      const parts = pointerParts(input.pointer)
      const body = parts.length ? JSON.parse(session.body.trim() || '{}') : null
      session.body = JSON.stringify(assignPointer(body, parts, value), null, 2)
    }
  }
}
export function dependencies(step) { return [...new Set([...step.dependsOn, ...step.inputs.filter(input => input.source === 'response').map(input => input.stepId)])] }
export function layers(blueprint) {
  const remaining = new Map(blueprint.steps.map(step => [step.id, step])), done = new Set(), result = []
  while (remaining.size) {
    const ready = [...remaining.values()].filter(step => dependencies(step).every(id => done.has(id)))
    if (!ready.length) throw new Error('Scenario contains a cycle or a missing dependency. Remove the circular connection.')
    result.push(ready)
    for (const step of ready) { done.add(step.id); remaining.delete(step.id) }
  }
  return result
}
export function validateBlueprint(blueprint) {
  if (blueprint?.format !== 'necto-scenario-builder' || blueprint.version !== 1 || typeof blueprint.id !== 'string' || !blueprint.id ||
    typeof blueprint.name !== 'string' || !blueprint.name.trim() || blueprint.name.length > 200 || !Array.isArray(blueprint.steps) || blueprint.steps.length > 100 ||
    !Number.isInteger(blueprint.concurrency) || blueprint.concurrency < 1 || blueprint.concurrency > 8) throw new Error('Invalid Scenario Builder definition (maximum 100 steps; parallelism 1–8).')
  const ids = new Set()
  for (const step of blueprint.steps) {
    if (typeof step.id !== 'string' || !step.id || ids.has(step.id) || typeof step.label !== 'string' || !step.label.trim() || step.label.length > 200 ||
      typeof step.operationKey !== 'string' || typeof step.apiId !== 'string' || typeof step.method !== 'string' || typeof step.path !== 'string' ||
      !Array.isArray(step.dependsOn) || step.dependsOn.length > 100 || !Array.isArray(step.inputs) || step.inputs.length > 100 || !step.request ||
      typeof step.request.body !== 'string' || !step.request.fields || Array.isArray(step.request.fields) || typeof step.request.fields !== 'object' ||
      Object.values(step.request.fields).some(value => typeof value !== 'string')) throw new Error('Invalid scenario step or request.')
    ids.add(step.id)
    validatePayloadSnapshot(step.request); executionOptions(step.request); validateAssertions(step.request.assertions ?? [])
    if (step.request.binaryFile && !(step.request.binaryFile instanceof Blob) || step.request.formFields?.some(row => row.files && (!Array.isArray(row.files) || row.files.some(file => !(file instanceof Blob))))) throw new Error('Attach files in the browser; imported file data is not executable.')
    const targets = []
    for (const input of step.inputs) {
      if (!['path', 'query', 'header', 'body'].includes(input.location) || !['response', 'human', 'generate'].includes(input.source) ||
        (input.location !== 'body' && (typeof input.name !== 'string' || !input.name || /[\r\n]/.test(input.name)))) throw new Error(`Invalid input in ${step.label}.`)
      const path = input.location === 'body' ? pointerParts(input.pointer) : [input.location === 'header' ? input.name.toLowerCase() : input.name]
      if (targets.some(target => target.location === input.location && (input.location !== 'body' ? target.path[0] === path[0] :
        path.slice(0, Math.min(path.length, target.path.length)).every((part, index) => part === target.path[index])))) throw new Error(`Overlapping input targets in ${step.label}.`)
      targets.push({ location: input.location, path })
      if (input.source === 'response') { if (typeof input.stepId !== 'string') throw new Error('Choose a source step.'); pointerParts(input.responsePointer) }
      if (input.source === 'generate') validateGenerator(input)
      if (input.source === 'human' && (typeof input.prompt !== 'string' || !input.prompt.trim() || !['text', 'number', 'boolean', 'json'].includes(input.valueType))) throw new Error('Human inputs need a question and value type.')
    }
  }
  for (const step of blueprint.steps) if (dependencies(step).some(id => !ids.has(id) || id === step.id)) throw new Error(`Invalid dependency in ${step.label}.`)
  layers(blueprint)
  return blueprint
}
export function parseHuman(value, type) {
  if (value === undefined || String(value).trim() === '') throw new Error('Enter a value before continuing.')
  if (type === 'json') return JSON.parse(value)
  if (type === 'number') { const number = Number(value); if (!Number.isFinite(number)) throw new Error('Enter a finite number.'); return number }
  if (type === 'boolean') { if (!['true', 'false'].includes(value)) throw new Error('Enter true or false.'); return value === 'true' }
  return String(value)
}
export function parseBlueprint(text) {
  if (text.length > 2 * 1024 * 1024) throw new Error('Scenario Builder imports are limited to 2 MB.')
  return validateBlueprint(JSON.parse(text))
}
