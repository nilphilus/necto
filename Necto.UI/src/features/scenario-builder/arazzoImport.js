import { parse } from 'yaml'
import { applyInput, newBlueprint, newStep, validateBlueprint } from './model.js'
import { pointer, prefix } from './bodySchema.js'
import { pointerParts } from './pointers.js'
import { isJson } from '../workbench/body.js'

export function readArazzo(text, json) {
  let document = json
  if (document === undefined) {
    try { document = parse(text, { maxAliasCount: 20, uniqueKeys: true }) }
    catch { throw new Error('Invalid JSON or YAML in scenario file.') }
  }
  if (!document || !Object.hasOwn(document, 'arazzo')) return null
  if (!/^1\.0\.\d+$/.test(document.arazzo)) throw new Error('Import supports Arazzo 1.0 documents.')
  if (!Array.isArray(document.workflows) || !document.workflows.length || document.workflows.length > 100)
    throw new Error('An Arazzo document must contain 1–100 workflows.')
  const ids = new Set()
  for (const workflow of document.workflows) {
    if (typeof workflow?.workflowId !== 'string' || !workflow.workflowId.trim() || workflow.workflowId.length > 200 ||
        ids.has(workflow.workflowId) || !Array.isArray(workflow.steps) || !workflow.steps.length || workflow.steps.length > 100)
      throw new Error('Each Arazzo workflow needs a unique ID and 1–100 steps.')
    ids.add(workflow.workflowId)
  }
  return document
}

function documentUrl(url, base) {
  try { return new URL(url, base).href } catch { return undefined }
}

function resolveOperation(step, sources, operations, localUrl) {
  if (Boolean(step.operationId) === Boolean(step.operationPath)) {
    throw new Error('Specify exactly one operationId or operationPath. Nested workflows are unsupported.')
  }
  let source, referenceUrl, matches
  if (typeof step.operationId === 'string' && step.operationId) {
    const qualified = /^\$sourceDescriptions\.([^.]+)\.(.+)$/.exec(step.operationId)
    if (qualified) {
      source = sources.get(qualified[1])
      if (!source) throw new Error('The operationId source is unavailable.')
    }
    const id = qualified?.[2] ?? step.operationId
    matches = operations.filter(operation => operation.id === id)
  } else if (typeof step.operationPath === 'string') {
    const [reference, fragment, ...rest] = step.operationPath.split('#')
    const parts = pointerParts(decodeURIComponent(fragment ?? ''))
    if (rest.length || parts.length !== 3 || parts[0] !== 'paths')
      throw new Error('operationPath must reference an OpenAPI operation under /paths.')
    const expression = /^\{\$sourceDescriptions\.([^}]+)\.url\}$/.exec(reference)
    if (expression) {
      source = sources.get(expression[1])
      if (!source) throw new Error('The operationPath source is unavailable.')
    } else if (reference) referenceUrl = reference
    matches = operations.filter(operation => operation.path === parts[1] && operation.method === parts[2].toUpperCase())
  } else throw new Error('Invalid operation reference.')

  if (!source && !referenceUrl && sources.size > 1)
    throw new Error('Use a source-qualified operation when the workflow references multiple API documents.')
  source ??= !referenceUrl && sources.size === 1 ? sources.values().next().value : undefined
  if (source && source.type !== 'openapi') throw new Error('Only OpenAPI source descriptions are supported.')
  if (source || referenceUrl) {
    const url = referenceUrl ?? source.url
    const selected = documentUrl(url, localUrl)
    const scoped = selected ? operations.filter(operation => {
      const operationUrl = (operation.apiId ?? 'local') === 'local'
        ? localUrl : operation.configuration?.openApiUrl
      return Boolean(operationUrl) && documentUrl(operationUrl, localUrl) === selected
    }) : []
    if (!scoped.length)
      throw new Error('Connect the OpenAPI document referenced by this step before importing.')
    const allowed = new Set(scoped)
    matches = matches.filter(operation => allowed.has(operation))
  }
  if (matches.length !== 1) throw new Error(matches.length
    ? 'The operation is ambiguous across connected APIs.' : 'The operation is missing from the loaded OpenAPI documents.')
  return matches[0]
}

function responsePointer(value) {
  if (typeof value !== 'string') return undefined
  if (value === '$response.body') return ''
  if (!value.startsWith('$response.body#')) return undefined
  const path = decodeURIComponent(value.slice('$response.body#'.length))
  pointerParts(path)
  return path
}

function criteriaFor(criteria) {
  if (criteria === undefined) return []
  if (!Array.isArray(criteria) || criteria.length > 50) throw new Error('Invalid success criteria.')
  return criteria.map(rule => {
    if (rule.type && rule.type !== 'simple' || typeof rule.condition !== 'string' || rule.context)
      throw new Error('Only simple HTTP status or response body equality criteria are supported.')
    const match = /^(\$statusCode|\$response\.body(?:#[^\s]*)?)\s*==\s*(.+)$/.exec(rule.condition.trim())
    if (!match) throw new Error('Only simple HTTP status or response body equality criteria are supported.')
    if (match[1] === '$statusCode') {
      if (!/^[1-5]\d\d$/.test(match[2].trim())) throw new Error('Expected an HTTP status in the success criterion.')
      return { kind: 'status', expected: match[2].trim() }
    }
    const expected = JSON.parse(match[2])
    if (expected !== null && typeof expected === 'object')
      throw new Error('Arazzo response equality currently supports scalar JSON values.')
    return { kind: 'equals', path: responsePointer(match[1]), expected: JSON.stringify(expected), comparison: 'arazzo-simple' }
  })
}

export function importArazzoWorkflow(document, workflowId, operations, localUrl) {
  const workflow = document.workflows.find(item => item.workflowId === workflowId)
  if (!workflow) throw new Error('Choose an Arazzo workflow.')
  if (workflow.dependsOn?.length || workflow.onFailure?.length || workflow.onSuccess?.length)
    throw new Error('Workflow dependencies and workflow-level actions are unsupported.')
  const sources = new Map()
  for (const source of document.sourceDescriptions ?? []) {
    if (typeof source?.name !== 'string' || typeof source.url !== 'string' || sources.has(source.name))
      throw new Error('Invalid or duplicate Arazzo source description.')
    sources.set(source.name, source)
  }
  const blueprint = newBlueprint()
  blueprint.name = ((typeof workflow.summary === 'string' && workflow.summary.trim()) || workflow.workflowId).slice(0, 200)
  if (typeof workflow.description === 'string') blueprint.description = workflow.description.slice(0, 500)
  const prior = new Map()
  const variables = new Map()
  let visited = 0

  function binding(value, target, step) {
    if (typeof value !== 'string') return false
    if (value.includes('{$')) throw new Error('Interpolated runtime expressions are unsupported.')
    if (!value.startsWith('$')) return false
    const previous = /^\$steps\.([^.]+)\.outputs\.([A-Za-z0-9._-]+)(?:#(.*))?$/.exec(value)
    const input = /^\$inputs\.([^.]+)$/.exec(value)
    if (previous) {
      const producer = prior.get(previous[1])
      const path = responsePointer(producer?.outputs.get(previous[2]))
      if (path === undefined) throw new Error(`Output ${value} must reference a prior step's JSON response body.`)
      const targetPath = previous[3] === undefined ? path
        : pointer([...pointerParts(path), ...pointerParts(decodeURIComponent(previous[3]))])
      step.inputs.push({ ...target, source: 'response', stepId: producer.id, responsePointer: targetPath })
    } else if (input) {
      const name = input[1]
      const schema = workflow.inputs?.properties?.[name]
      if (!schema || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name))
        throw new Error(`Input ${name} needs a supported workflow input schema.`)
      if (!variables.has(name)) {
        const valueType = schema.type === 'integer' || schema.type === 'number' ? 'number'
          : schema.type === 'boolean' ? 'boolean' : schema.type === 'string' ? 'text' : 'json'
        const variable = { id: 'input-' + variables.size, name, valueType }
        if (Object.hasOwn(schema, 'default')) {
          Object.assign(variable, { source: 'static', value: valueType === 'text' ? schema.default : JSON.stringify(schema.default) })
        } else {
          Object.assign(variable, { source: 'human', prompt: schema.description || 'Enter ' + name })
        }
        variables.set(name, variable)
      }
      step.inputs.push({ ...target, source: 'variable', variableId: variables.get(name).id })
    } else throw new Error('Unsupported runtime expression. Use a workflow input or a prior step output.')
    return true
  }

  for (const [index, source] of workflow.steps.entries()) {
    try {
      if (typeof source?.stepId !== 'string' || !source.stepId.trim() || prior.has(source.stepId))
        throw new Error('Each step needs a unique stepId.')
      if (source.workflowId || source.onFailure?.length || source.onSuccess?.some(action =>
        action.criteria?.length || !(action.type === 'end' && index === workflow.steps.length - 1 ||
          action.type === 'goto' && !action.workflowId && action.stepId === workflow.steps[index + 1]?.stepId)))
        throw new Error('Conditional actions, retries and nested workflows are unsupported.')
      const operation = resolveOperation(source, sources, operations, localUrl)
      const step = newStep(operation, { fields: {}, body: '' })
      step.id = source.stepId
      step.label = (typeof source.description === 'string' ? source.description.trim() : '')?.slice(0, 200) || source.stepId.slice(0, 200)
      const params = [...(workflow.parameters ?? []), ...(source.parameters ?? [])].map(parameter => {
        if (!parameter.reference) return parameter
        const name = /^\$components\.parameters\.(.+)$/.exec(parameter.reference)?.[1]
        const definitions = document.components?.parameters ?? {}
        if (!name || !Object.hasOwn(definitions, name)) throw new Error('An Arazzo parameter reference is unresolved.')
        return { ...definitions[name], ...(Object.hasOwn(parameter, 'value') ? { value: parameter.value } : {}) }
      })
      const effectiveParams = new Map(params.map(parameter => [parameter.in + ':' + parameter.name, parameter]))
      for (const [key, parameter] of effectiveParams) {
        if (!['path', 'query', 'header'].includes(parameter.in) ||
            !operation.parameters.some(item => item.in === parameter.in && item.name === parameter.name) ||
            !Object.hasOwn(parameter, 'value')) throw new Error('A parameter target does not match the selected OpenAPI operation.')
        const target = { location: parameter.in, name: parameter.name }
        if (!binding(parameter.value, target, step)) {
          if (parameter.value === null) throw new Error('A path, query or header parameter cannot use null.')
          step.request.fields[key] = typeof parameter.value === 'object' ? JSON.stringify(parameter.value) : String(parameter.value)
        }
      }

      if (source.requestBody) {
        const body = source.requestBody
        const types = Object.keys(operation.requestBody?.content ?? {})
        const type = body.contentType ?? (types.length === 1 ? types[0] : undefined)
        if (!types.includes(type)) throw new Error('Choose a request body content type declared by OpenAPI.')
        step.request.mediaType = type
        function payload(value, path = []) {
          if (++visited > 25000 || path.length > 24) throw new Error('Request payload exceeds the import limit.')
          if (binding(value, { location: 'body', pointer: pointer(path) }, step)) return null
          if (Array.isArray(value)) return value.map((item, index) => payload(item, [...path, index]))
          if (value && typeof value === 'object')
            return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, payload(child, [...path, key])]))
          return value
        }
        if (isJson(type)) {
          step.request.body = JSON.stringify(payload(body.payload ?? null), null, 2)
          for (const replacement of body.replacements ?? []) {
            const path = pointerParts(replacement.target)
            const target = { location: 'body', pointer: replacement.target }
            if (!Object.hasOwn(replacement, 'value')) throw new Error('A body replacement needs a value.')
            step.inputs = step.inputs.filter(input => {
              if (input.location !== 'body') return true
              const existing = pointerParts(input.pointer)
              if (existing.length < path.length && prefix(existing, path))
                throw new Error('A body replacement cannot target a child of a dynamic value.')
              return !prefix(path, existing)
            })
            if (!binding(replacement.value, target, step)) applyInput(step.request, operation, target, replacement.value)
          }
        } else {
          if (!/^(?:text\/|application\/(?:.+\+)?xml)/i.test(type) || typeof body.payload !== 'string' ||
              body.payload.startsWith('$') || body.payload.includes('{$') || body.replacements?.length)
            throw new Error('Non-JSON request bodies support only literal text.')
          step.request.body = body.payload
        }
      }
      step.request.assertions = criteriaFor(source.successCriteria)
      if (index) blueprint.connections.push({ from: blueprint.steps.at(-1).id, to: step.id })
      prior.set(step.id, { id: step.id, outputs: new Map(Object.entries(source.outputs ?? {})) })
      blueprint.steps.push(step)
    } catch (cause) {
      throw new Error(`Arazzo step ${index + 1}${typeof source?.stepId === 'string' ? ' (' + source.stepId.slice(0, 120) + ')' : ''}: ${cause.message}`)
    }
  }
  const usedVariables = new Set(blueprint.steps.flatMap(step =>
    step.inputs.filter(input => input.source === 'variable').map(input => input.variableId)))
  blueprint.variables = [...variables.values()].filter(variable => usedVariables.has(variable.id))
  validateBlueprint(blueprint)
  return blueprint
}
