import { normalizeParameterNames } from './parameterNames.js'
import { normalizeBodyFieldNames } from './bodyFieldNames.js'
import { stepIssue } from './stepIssue.js'
import { pickRandom } from './random.js'
import { evaluateExpression, expressionContext } from './expression.js'
import { applyBodyPresets, buildRequest, contextKey, fieldKey, presetSource, protectedBodyPaths } from '../request-runner/request.js'
import { bodyContent, isJson } from '../workbench/body.js'
import { pointer, prefix, schemaView } from './bodySchema.js'
import { effectiveTarget } from '../workbench/target.js'
import { sentRequest } from './sentRequest.js'
import { applyInput, dependencies, pointerParts, readPointer, validateBlueprint } from './model.js'
import { staticVariableValue } from './variables.js'
import { generateValue } from './generation.js'
import { abortableDelay, waitMatches } from './waiting.js'
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

export function canRetryStep(step) {
  return Boolean(step?.request && ['failed', 'cancelled'].includes(step.status))
}

export function remainingSteps(plan) {
  const available = new Set(plan.filter(step => step.status === 'completed').map(step => step.id))
  const remaining = []
  let changed = true
  while (changed) {
    changed = false
    for (const step of plan) {
      if (available.has(step.id) || !['skipped', 'cancelled'].includes(step.status) || step.request) continue
      if (!step.dependencies.every(id => available.has(id))) continue
      available.add(step.id)
      remaining.push(step)
      changed = true
    }
  }
  return remaining
}

// DAG scheduler: ready nodes start immediately; a join waits for every dependency.
// Only explicit response-wait policies repeat requests. Errors stop the run.
export async function executeBlueprint(plan, { concurrency = 4, execute, signal, ask, generate = generateValue, sleep = abortableDelay, pick = pickRandom, retryStepId, resume = false, resolvedVariables = new Map() }) {
  const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal])
  const byId = new Map(plan.map(step => [step.id, step])), running = new Map()
  const retryOnly = retryStepId !== undefined
  if (retryOnly) {
    const target = byId.get(retryStepId)
    if (!canRetryStep(target)) throw new Error('This step has no failed request to retry.')
    Object.assign(target, { status: 'waiting', error: '', problemTarget: undefined })
  }
  if (resume) for (const step of remainingSteps(plan)) {
    Object.assign(step, { status: 'waiting', error: '', attempt: undefined, maxAttempts: undefined })
  }
  let failure, activeRequests = 0
  const waiting = []
  function release() { activeRequests--; waiting.shift()?.grant() }
  function acquire() {
    combined.throwIfAborted()
    if (activeRequests < concurrency) { activeRequests++; return release }
    return new Promise((resolve, reject) => {
      const entry = { grant() { combined.removeEventListener('abort', aborted); activeRequests++; resolve(release) } }
      const aborted = () => { const index = waiting.indexOf(entry); if (index >= 0) waiting.splice(index, 1); reject(combined.reason) }
      combined.addEventListener('abort', aborted, { once: true }); waiting.push(entry)
    })
  }
  const variableDefinitions = new Map((plan.variables ?? []).map(variable => [variable.id, variable])), variableValues = new Map()
  const questionIds = new Map(), reservedIds = new Set(byId.keys())
  for (const variable of variableDefinitions.values()) { let id = 'variable:' + variable.id; while (reservedIds.has(id)) id += ':'; reservedIds.add(id); questionIds.set(variable.id, id) }
  function resolveVariable(id) {
    if (resolvedVariables.has(id)) return Promise.resolve(resolvedVariables.get(id))
    if (!variableValues.has(id)) variableValues.set(id, (async () => {
      const variable = variableDefinitions.get(id)
      if (!variable) throw new Error('Shared variable is unavailable.')
      combined.throwIfAborted()
      let value
      if (variable.source === 'static') value = staticVariableValue(variable)
      else if (variable.source === 'generate') value = await generate(variable)
      else if (['response','random'].includes(variable.source)) {
        const producer = byId.get(variable.stepId)
        if (producer?.status !== 'completed') throw new Error(`Source step for ${variable.name} is not completed.`)
        value = variable.source === 'random' ? pick(producer.response?.json,variable) : readPointer(producer.response?.json, variable.responsePointer)
      } else {
        if (!ask) throw new Error('Shared variable needs human input. Enable human-in-the-loop mode.')
        const answers = await ask({ id: questionIds.get(variable.id), sharedVariable: true, label: 'Shared variable · ' + variable.name }, [{ location: 'variable', name: variable.name, prompt: variable.prompt, valueType: variable.valueType }], combined)
        if (!Array.isArray(answers) || answers.length !== 1) throw new Error('Missing shared variable input.')
        value = answers[0]
      }
      combined.throwIfAborted()
      resolvedVariables.set(id, value)
      return value
    })())
    return variableValues.get(id)
  }
  const run = async step => {
    step.status = 'preparing'
    const preparedBody = step.session.body
    const preparedFields = { ...step.session.fields }
    let releaseSlot, issueInput
    const policies = step.entryPolicies ?? [step]
    const delayMs = Math.max(0, ...policies.map(policy => policy.delayMs ?? 0))
    const conditions = policies.filter(policy => policy.waitFor)
    try {
      combined.throwIfAborted()
      if (!retryOnly && delayMs) {
        step.status = 'delaying'; step.nextAttemptAt = Date.now() + delayMs
        await sleep(delayMs, combined); combined.throwIfAborted(); step.nextAttemptAt = undefined
        step.status = 'preparing'
      }
      for (const input of retryOnly ? [] : step.inputs.filter(input => input.source !== 'human')) {
        issueInput = input
        if (input.source === 'variable' && variableDefinitions.get(input.variableId)?.source === 'human') step.status = 'needs-input'
        let value
        if (input.source === 'expression') {
          try {
            const values = Object.create(null)
            for (const binding of input.bindings) {
              combined.throwIfAborted()
              if (binding.source === 'variable') {
                if (variableDefinitions.get(binding.variableId)?.source === 'human') step.status = 'needs-input'
                values[binding.name] = await resolveVariable(binding.variableId)
              } else {
                const producer = byId.get(binding.stepId)
                if (producer?.status !== 'completed') throw new Error(`Source step "${binding.stepId}" is not completed.`)
                try { values[binding.name] = readPointer(producer.response?.json, binding.responsePointer) }
                catch {
                  throw new Error(`Missing value for "${binding.name}" in step "${binding.stepId}" at ${binding.responsePointer || '(root)'}.`)
                }
              }
            }
            combined.throwIfAborted()
            value = evaluateExpression(input.expression, values)
            applyInput(step.session, step.operation, input, value)
            continue
          } catch (cause) {
            combined.throwIfAborted()
            const alias = cause.code === 'missing' ? cause.path?.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0] : undefined
            const origin = alias && input.bindings.find((binding) => binding.name === alias && binding.source === 'response')
            const source = origin ? ` Source step "${origin.stepId}", binding "${alias}" at ${origin.responsePointer || '(root)'}.` : ''
            throw new Error(`${expressionContext(step, input)}. ${cause.message}${source} No request was sent for this step.`)
          }
        } else if(input.source==='random') {
          const producer=byId.get(input.stepId)
          if(producer?.status!=='completed')throw new Error('Pick random source step is not completed.')
          value=pick(producer.response?.json,input)
        } else value = input.source === 'variable' ? await resolveVariable(input.variableId) : input.source === 'generate' ? await generate(input) : readPointer(byId.get(input.stepId)?.response?.json, input.responsePointer)
        combined.throwIfAborted()
        applyInput(step.session, step.operation, input, value)
      }
      issueInput = undefined
      const questions = retryOnly ? [] : step.inputs.filter(input => input.source === 'human')
      if (questions.length) {
        if (!ask) throw new Error('This step needs human input. Enable human-in-the-loop mode.')
        step.status = 'needs-input'
        const answers = await ask(step, questions, combined)
        combined.throwIfAborted()
        if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('Missing human input.')
        questions.forEach((input, index) => applyInput(step.session, step.operation, input, answers[index]))
      }
      combined.throwIfAborted()
      if (!retryOnly) step.attempts = []
      step.attempts ??= []
      const previousAttempts = step.attempts.length
      const maximum = retryOnly ? 1 : Math.max(1, ...conditions.map(policy => policy.waitFor.retryCount + 1))
      for (let attempt = 1; attempt <= maximum; attempt++) {
        step.attempt = previousAttempts + attempt; step.maxAttempts = previousAttempts + maximum; step.status = 'queued'
        const permit = acquire()
        releaseSlot = typeof permit === 'function' ? permit : await permit
        combined.throwIfAborted(); step.status = 'running'
        let response
        try {
          response = await execute(step.operation, step.session, step.values, combined, ({ url, options }) => {
            step.request = sentRequest({url,options})
          })
        } finally { releaseSlot(); releaseSlot = undefined }
        combined.throwIfAborted()
        step.response = response; step.httpStatus = response?.status; step.elapsed = response?.elapsed
        const record = { attempt: step.attempt, status: response?.status, elapsed: response?.elapsed, matched: false }
        step.attempts.push(record)
        if (!response || !response.ok && !response.assertions?.some(check => check.kind === 'status' && check.passed)) throw new Error(response ? `HTTP ${response.status} ${response.statusText ?? ''}` : step.session.error || 'No response received.')
        const unmet = conditions.filter(policy => !waitMatches(response, policy.waitFor))
        const matched = !unmet.length
        record.matched = matched
        if (matched) {
          if (response.assertions?.some(check => !check.passed)) throw new Error('Response checks failed.')
          break
        }
        const exhausted = unmet.find(policy => retryOnly || attempt > policy.waitFor.retryCount)
        if (exhausted) throw new Error(`Response condition at ${exhausted.waitFor.pointer || '(root)'}${exhausted.label ? ' on ' + exhausted.label : ''} was not met after ${attempt} attempt${attempt === 1 ? '' : 's'}.`)
        const intervalMs = Math.max(...unmet.map(policy => policy.waitFor.intervalMs))
        step.status = 'retry-wait'; step.nextAttemptAt = Date.now() + intervalMs
        await sleep(intervalMs, combined); combined.throwIfAborted(); step.nextAttemptAt = undefined
      }
      step.status = 'completed'
    } catch (cause) {
      step.status = combined.aborted ? 'cancelled' : 'failed'
      step.error = combined.aborted ? 'Canceled.' : cause.message
      if (combined.aborted && !step.request) {
        // Resume re-evaluates bindings against the original prepared request.
        Object.assign(step.session, { body: preparedBody, fields: preparedFields })
      }
      if (!combined.aborted && !failure) {
        const issue = stepIssue(cause, step, issueInput)
        step.problemTarget = issue.target
        failure = { step, cause }
        controller.abort(cause)
      }
    } finally { step.nextAttemptAt = undefined; releaseSlot?.() }
  }
  while (true) {
    if (!combined.aborted) {
      const ready = plan.filter(step => step.status === 'waiting' && (retryOnly
        ? step.id === retryStepId : step.dependencies.every(id => byId.get(id)?.status === 'completed')))
      for (const step of ready) {
        const task = run(step).finally(() => running.delete(step.id))
        running.set(step.id, task)
      }
    }
    if (!running.size) break
    await Promise.race(running.values())
  }
  variableValues.clear()
  for (const step of plan) if (step.status === 'waiting') step.status = 'skipped'
  if (failure) return { status: 'failed', error: `${failure.step.label}: ${failure.cause.message}` }
  if (signal.aborted) return { status: 'cancelled', error: 'Scenario stopped.' }
  if (retryOnly && plan.some(step => step.status !== 'completed'))
    return { status: 'incomplete', error: 'Step retried. Other steps were not run again.' }
  if (plan.some(step => step.status !== 'completed')) return { status: 'failed', error: 'Some dependencies could not complete.' }
  return { status: 'completed', error: '' }
}
