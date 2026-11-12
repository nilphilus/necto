import { applyChoice, matchesPath, sourcePath } from '../related-endpoints/mappings.js'
import { buildRequest, contextKey } from '../request-runner/request.js'

export const pathLabel = path => '$' + path.map(part => `[${JSON.stringify(part)}]`).join('')
const targetKey = binding => JSON.stringify([binding.location, binding.name])
const inputValue = value => typeof value === 'object' ? JSON.stringify(value) : String(value)

function currentValue(session, location, name) {
  if (location !== 'body') return session.fields[`${location}:${name}`]
  try {
    const body = JSON.parse(session.body)
    return JSON.stringify(name === null ? body : body?.[name])
  } catch { return undefined }
}

export function rememberBinding(session, choice, sourceStep) {
  const { location, name, value } = choice
  session.bindings = (session.bindings ?? []).filter(binding => targetKey(binding) !== targetKey(choice) &&
    !(location === 'body' && binding.location === 'body' && (name === null || binding.name === null)))
  if (!choice.binding || !Number.isInteger(sourceStep) || sourceStep < 0) return
  session.bindings.push({ sourceStep, path: [...choice.binding.path], location, name,
    appliedValue: location === 'body' ? JSON.stringify(value) : inputValue(value) })
}

export function snapshotScenario(chain, name, id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, valuesFor = () => new Map()) {
  name = name.trim()
  if (!name) throw new Error('Enter a scenario name.')
  if (!chain.length || chain.length > 100) throw new Error('A scenario needs between 1 and 100 steps.')
  if (chain.some(step => step.session.pending)) throw new Error('Wait for pending requests before saving.')
  const steps = chain.map(({ operation, session }, index) => {
    const context = valuesFor(operation)
    const fields = Object.fromEntries(Object.entries(session.fields).filter(([key, value]) => typeof value === 'string' &&
      !context.has(key.startsWith('header:') ? key.toLowerCase() : key)))
    let body = session.body ?? ''
    const bindings = (session.bindings ?? []).filter(binding => binding.sourceStep < index &&
      currentValue(session, binding.location, binding.name) === binding.appliedValue)
      .map(({ sourceStep, path, location, name }) => ({ sourceStep, path: [...path], location, name }))
    for (const binding of bindings) {
      if (binding.location !== 'body') delete fields[`${binding.location}:${binding.name}`]
      else if (binding.name === null) body = ''
      else {
        const parsed = JSON.parse(body)
        delete parsed[binding.name]
        body = JSON.stringify(parsed, null, 2)
      }
    }
    return { operationKey: operation.key, apiId: operation.apiId ?? 'local', name: operation.name,
      method: operation.method, path: operation.path, fields, body, bindings }
  })
  return { version: 1, id, name, steps }
}

export function validateScenario(scenario) {
  if (scenario?.version !== 1 || typeof scenario.id !== 'string' || !scenario.id ||
    typeof scenario.name !== 'string' || !scenario.name.trim() || !Array.isArray(scenario.steps) ||
    !scenario.steps.length || scenario.steps.length > 100) throw new Error('Invalid saved scenario.')
  for (const [index, step] of scenario.steps.entries()) {
    if (typeof step.operationKey !== 'string' || typeof step.apiId !== 'string' || typeof step.name !== 'string' ||
      typeof step.method !== 'string' || typeof step.path !== 'string' || typeof step.body !== 'string' ||
      !step.fields || Array.isArray(step.fields) || typeof step.fields !== 'object' ||
      Object.values(step.fields).some(value => typeof value !== 'string') || !Array.isArray(step.bindings)) {
      throw new Error(`Invalid scenario step ${index + 1}.`)
    }
    const targets = new Set()
    for (const binding of step.bindings) {
      if (!Number.isInteger(binding.sourceStep) || binding.sourceStep < 0 || binding.sourceStep >= index ||
        !Array.isArray(binding.path) || binding.path.some(part => typeof part !== 'string' &&
          !(Number.isSafeInteger(part) && part >= 0)) || !['path', 'query', 'header', 'body'].includes(binding.location) ||
        !(typeof binding.name === 'string' || (binding.location === 'body' && binding.name === null)) ||
        targets.has(targetKey(binding))) throw new Error(`Invalid response binding in step ${index + 1}.`)
      targets.add(targetKey(binding))
    }
    if (step.bindings.some(binding => binding.location === 'body' && binding.name === null) &&
      step.bindings.filter(binding => binding.location === 'body').length > 1) throw new Error(`Overlapping body bindings in step ${index + 1}.`)
  }
}

export function readResponseAt(response, path) {
  let value = response
  for (const part of path) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part) ||
      (typeof part === 'number' && !Array.isArray(value))) throw new Error(`Response has no value at ${pathLabel(path)}.`)
    value = value[part]
  }
  if (value === undefined) throw new Error(`Response has no JSON value at ${pathLabel(path)}.`)
  return value
}

function placeholder(operation, binding) {
  if (binding.location === 'body') return {}
  const parameter = operation.parameters.find(parameter => parameter.in === binding.location && parameter.name === binding.name)
  const type = operation.resolve(parameter?.schema)?.type
  return type === 'array' ? [] : type === 'object' ? {} : 'scenario-value'
}

export function prepareScenario(scenario, { operations, links, configuration, createSession, valuesFor, validateRequests = true }) {
  validateScenario(scenario)
  const byKey = new Map(operations.map(operation => [operation.key, operation]))
  const plan = scenario.steps.map((step, index) => {
    const operation = byKey.get(step.operationKey)
    if (!operation || (operation.apiId ?? 'local') !== step.apiId || operation.method !== step.method || operation.path !== step.path) {
      throw new Error(`Step ${index + 1}: ${step.method} ${step.path} is unavailable. Check API visibility and connections.`)
    }
    const session = createSession(operation)
    session.fields = { ...step.fields }; session.body = step.body
    session.bindings = step.bindings.map(binding => ({ ...binding, path: [...binding.path],
      appliedValue: currentValue(session, binding.location, binding.name) }))
    return { operation, group: operation.tags[0], session, bindings: step.bindings.map(binding => ({ ...binding, path: [...binding.path] })),
      values: new Map(valuesFor(operation)), status: 'waiting', error: '' }
  })
  if (!validateRequests) return plan
  for (const [index, step] of plan.entries()) {
    step.bindings = step.bindings.filter(binding => binding.location === 'body' ||
      !step.values.has(contextKey({ in: binding.location, name: binding.name })))
    const draft = { fields: { ...step.session.fields }, body: step.session.body }
    try {
      for (const binding of step.bindings) {
        const origin = plan[binding.sourceStep].operation
        const valid = links.some(link => link.from.key === origin.key && link.to.key === step.operation.key &&
          link.location === binding.location && link.name === binding.name && matchesPath(
            [...sourcePath(link.source), ...(link.source.property === null ? [] : [link.source.property])], binding.path))
        if (!valid) throw new Error(`The mapping from step ${binding.sourceStep + 1} (${pathLabel(binding.path)}) to ${binding.location}:${binding.name ?? 'body'} is no longer available.`)
        applyChoice(draft, binding.location, { name: binding.name, value: placeholder(step.operation, binding) })
      }
      buildRequest(step.operation, configuration, draft, step.values)
    } catch (cause) { throw new Error(`Step ${index + 1}: ${cause.message}`) }
  }
  return plan
}

export async function executeScenario(plan, { execute, signal, onStep = () => {} }) {
  let index = 0
  try {
    for (; index < plan.length; index++) {
      signal.throwIfAborted()
      const step = plan[index]
      step.status = 'running'
      for (const binding of step.bindings) {
        const source = plan[binding.sourceStep].session.result
        if (!source?.ok) throw new Error(`Step ${binding.sourceStep + 1} has no successful response.`)
        const value = readResponseAt(source.json, binding.path)
        if (binding.location !== 'body' && value === null) throw new Error(`Response value at ${pathLabel(binding.path)} is null.`)
        applyChoice(step.session, binding.location, { name: binding.name, value })
        rememberBinding(step.session, { ...binding, value, binding: { path: binding.path } }, binding.sourceStep)
      }
      await onStep(index, step)
      signal.throwIfAborted()
      const result = await execute(step.operation, step.session, step.values, signal)
      signal.throwIfAborted()
      step.httpStatus = result?.status
      step.elapsed = result?.elapsed
      if (!result?.ok) throw new Error(result ? `HTTP ${result.status} ${result.statusText}` : step.session.error || 'No response received.')
      step.session.result = result
      step.status = 'completed'
    }
    return { status: 'completed', error: '' }
  } catch (cause) {
    const status = signal.aborted ? 'cancelled' : 'failed'
    if (plan[index]) { plan[index].status = status; plan[index].error = signal.aborted ? 'Canceled.' : cause.message }
    for (let next = index + 1; next < plan.length; next++) plan[next].status = 'skipped'
    return { status, error: signal.aborted ? 'Scenario stopped.' : `Step ${index + 1}: ${cause.message}` }
  }
}
