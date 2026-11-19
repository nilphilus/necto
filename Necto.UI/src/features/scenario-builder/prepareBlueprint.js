import { normalizeParameterNames } from './parameterNames.js'
import { normalizeBodyFieldNames } from './bodyFieldNames.js'
import { stepIssue } from './stepIssue.js'
import { applyBodyPresets, buildRequest, contextKey, fieldKey, presetSource, protectedBodyPaths } from '../request-runner/request.js'
import { bodyContent, isJson } from '../workbench/body.js'
import { pointer, prefix, schemaView } from './bodySchema.js'
import { effectiveTarget } from '../workbench/target.js'
import { applyInput, dependencies, pointerParts, readPointer, validateBlueprint } from './model.js'
import { allConnections, connectionSummary, upgradeBlueprint } from './connections.js'

function missingRequiredBody(operation, draft, inputs) {
  const media = bodyContent(operation, draft)
  if (!isJson(media?.[0] ?? '') || !media[1].schema) return undefined
  // A scenario can explicitly exercise the API's validation error.
  if (draft.assertions?.some(check => check.kind === 'status' && Number(check.expected) >= 400)) return undefined
  let body
  try { body = JSON.parse(draft.body || '{}') } catch { return undefined }
  const dynamic = inputs.filter(input => input.location === 'body').map(input => pointerParts(input.pointer))
  let remaining = 5000
  const missing = []

  function visit(raw, value, path) {
    if (!raw || remaining-- <= 0 || path.length > 24 ||
        dynamic.some(target => prefix(target, path)) || !value || typeof value !== 'object') return undefined
    const resolved = operation.resolve(raw)
    const variant = draft.bodyVariants?.[pointer(path)]
    // Without an explicit variant, only require properties common to the base schema.
    const base = variant === undefined && (resolved?.oneOf || resolved?.anyOf)
      ? { ...resolved, oneOf: undefined, anyOf: undefined } : raw
    const schema = schemaView(operation, base, variant)
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length && remaining > 0 && schema.items; index++) {
        visit(schema.items, value[index], [...path, index])
      }
      return undefined
    }
    for (const name of schema.required) {
      if (!Object.hasOwn(value, name) && !operation.resolve(schema.properties[name])?.readOnly) missing.push(pointer([...path, name]))
    }
    for (const [name, child] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value, name)) continue
      visit(child, value[name], [...path, name])
    }
  }
  visit(media[1].schema, body, [])
  return missing
}

function missingInput(message) {
  return Object.assign(new Error(message), { missingInput: true })
}

export function prepareBlueprint(blueprint, { operations, configuration, createSession, valuesFor, protectBodyExpressions = false, requestOverrides }, { collectIssues = false } = {}) {
  validateBlueprint(blueprint)
  blueprint = upgradeBlueprint(blueprint)
  const edges = allConnections(blueprint)
  if (!blueprint.steps.length) throw new Error('Add at least one request.')
  const byKey = new Map(operations.map(operation => [operation.key, operation]))
  const issues = [], presetEffects = []
  const plan = blueprint.steps.flatMap(definition => {
    const missing = []
    function reportMissing(input, message) {
      const issue = stepIssue(missingInput(`${definition.label}: ${message}`), definition, input)
      if (missing.some(item => item.target?.location === issue.target?.location && item.target?.name === issue.target?.name)) return
      missing.push(issue)
    }
    let issueInput
    try {
      if (!definition.operationKey) throw new Error(`${definition.label}: choose an endpoint before running.`)
      const operation = byKey.get(definition.operationKey)
      if (!operation || (operation.apiId ?? 'local') !== definition.apiId || operation.method !== definition.method || operation.path !== definition.path)
        throw new Error(`${definition.label}: endpoint unavailable. Check API visibility and connections.`)
      const request = { ...definition.request, fields: { ...definition.request.fields }, formFields: definition.request.formFields?.map(row => ({ ...row, files: [...(row.files ?? [])] })) }, session = createSession(operation)
      const parameters = normalizeParameterNames(operation, request.fields, definition.inputs)
      if (parameters.conflict) throw new Error(`${definition.label}: ${parameters.conflict}`)
      const normalized = normalizeBodyFieldNames(operation, request, parameters.inputs)
      if (normalized.conflict) throw new Error(`${definition.label}: ${normalized.conflict}`)
      const overrides = requestOverrides?.get(definition.id) ?? []
      const inputs = normalized.inputs.filter(input => !overrides.some(override =>
        input.location === override.location && (input.location === 'body'
          ? input.pointer === override.pointer : input.name === override.name) && input.source === 'preset'))
      Object.assign(session, request, { body: normalized.body, fields: parameters.fields })
      for (const override of overrides) applyInput(session, operation, override, override.value)
      const expressions = inputs.filter(input => input.location === 'body' && input.source === 'expression')
      const reserved = [
        ...(protectBodyExpressions ? expressions.map(input => pointerParts(input.pointer)) : []),
        ...overrides.filter(input => input.location === 'body').map(input => pointerParts(input.pointer)),
      ]
      if (reserved.length) session[protectedBodyPaths] = reserved
      const context = definition.ignorePresets ? new Map() : valuesFor(operation)
      // Keep the original map so body preset metadata is available during preparation.
      const values = new Map(context)
      for (const override of overrides) {
        if (override.location !== 'body') values.delete(contextKey({ in: override.location, name: override.name }))
      }
      const presetBody = applyBodyPresets(operation, session.body, context, session.mediaType, reserved)
      if (presetBody.notice) throw new Error(`${definition.label}: ${presetBody.notice}`)
      session.body = presetBody.body
      // Presets are run overrides, including bindings, generated and human inputs.
      const probe = { ...session, fields: { ...session.fields } }
      for (const input of inputs) if (input.location === 'body' && input.pointer) {
        try { applyInput(probe, operation, input, null) } catch { /* Uncovered invalid targets are checked below. */ }
      }
      const probed = applyBodyPresets(operation, probe.body, context, session.mediaType, reserved)
      if (probed.notice) throw new Error(`${definition.label}: ${probed.notice}`)
      const paths = [...(presetBody.paths ?? []), ...(probed.paths ?? [])]
      const coveredBody = (input, candidates) => {
        const target = pointerParts(input.pointer)
        return candidates.some(path => path.length <= target.length && path.every((part, index) => String(part) === target[index]))
      }
      const activeInputs = inputs.filter(input => input.location !== 'body'
        ? !values.has(contextKey({ in: input.location, name: input.name })) : !coveredBody(input, paths))
      for (const input of inputs) if (input.location === 'body' && !activeInputs.includes(input) && !coveredBody(input, presetBody.paths ?? [])) {
        applyInput(session, operation, input, readPointer(JSON.parse(probed.body), input.pointer))
      }
      for (const input of activeInputs.filter(input => input.source === 'preset')) {
        reportMissing(input, `supply a value or activate a matching preset for ${input.location === 'body' ? input.pointer || '(whole body)' : input.name}.`)
      }
      for (const input of inputs) {
        issueInput = input
        if (input.location === 'body' && !operation.requestBody || input.location !== 'body' &&
          !operation.parameters.some(parameter => parameter.in === input.location && parameter.name === input.name)) throw new Error(`${definition.label}: input target is no longer present in the API.`)
      }
      issueInput = undefined
      const step = { id: definition.id, label: definition.label, operation, session, values,
        bodyExpressions: expressions.map(input => ({ pointer: input.pointer, overridden: !activeInputs.includes(input) })),
        entryPolicies: edges.filter(edge => edge.to === definition.id).map(edge => ({ ...edge, label: connectionSummary(edge, blueprint.steps) })), presetOverrides: [...new Set([...values.keys()].filter(key => typeof key === 'string').concat(paths.map(path => 'body:/' + path.map(part => String(part).replaceAll('~','~0').replaceAll('/','~1')).join('/'))))], inputs: JSON.parse(JSON.stringify(activeInputs)), dependencies: dependencies(definition, blueprint), status: 'waiting', error: '' }
      if (collectIssues) {
        const fields = [...values.keys()].filter(key => typeof key === 'string')
          .map(field => ({ field, preset: presetSource(context, field) }))
        for (const { path, preset } of [...presetBody.sources, ...probed.sources]) {
          fields.push({ field: 'body:' + pointer(path), preset })
        }
        presetEffects.push({ label: definition.label, fields })
      }
      // Check every static request before sending anything. Dynamic values are checked again at dispatch.
      const draft = { ...session, fields: { ...session.fields } }
      try {
        for (const input of step.inputs) {
          issueInput = input
          const parameter = operation.parameters.find(parameter => parameter.in === input.location && parameter.name === input.name)
          const schema = operation.resolve(parameter?.schema)
          const value = schema?.type === 'array' ? [] : schema?.type === 'object' ? {} : schema?.type === 'integer' || schema?.type === 'number' ? 1 : schema?.type === 'boolean' ? true : 'run-value'
          applyInput(draft, operation, input, value)
        }
        issueInput = undefined
        for (const parameter of operation.parameters ?? []) {
          if (!(parameter.required || parameter.in === 'path')) continue
          const missingValue = values.has(contextKey(parameter))
            ? values.get(contextKey(parameter)) === '' || values.get(contextKey(parameter)) === undefined
            : !draft.fields[fieldKey(parameter)]
          if (missingValue) reportMissing({ location: parameter.in, name: parameter.name }, `${parameter.name} is required.`)
        }
        for (const bodyTarget of missingRequiredBody(operation, draft, step.inputs) ?? []) {
          reportMissing({ location: 'body', pointer: bodyTarget }, `Required body field ${bodyTarget} is missing.`)
        }
        if (missing.length) {
          issues.push(...missing)
          return []
        }
        buildRequest(operation, configuration, draft, values)
      } catch (cause) {
        const problem = new Error(`${definition.label}: ${cause.message}`)
        if (cause.missingInput) problem.missingInput = true
        throw problem
      }
      step.target = effectiveTarget(operation, configuration, draft, values)
      return [step]
    } catch (cause) {
      issues.push(...missing, stepIssue(cause, definition, issueInput))
      return []
    }
  })
  if (issues.length) {
    if (!collectIssues) throw issues[0]
    throw Object.assign(new AggregateError(issues, issues[0].message), { plan, presetEffects })
  }
  if (collectIssues) plan.presetEffects = presetEffects
  plan.variables = JSON.parse(JSON.stringify(blueprint.variables))
  return plan
}
