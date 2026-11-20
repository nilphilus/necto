import { stepIssue } from './stepIssue.js'
import { pickRandom } from './random.js'
import { evaluateExpression, expressionContext } from './expression.js'
import { sentRequest } from './sentRequest.js'
import { staticVariableValue } from './variables.js'
import { generateValue } from './generation.js'
import { abortableDelay, waitMatches } from './waiting.js'
import { applyInput, readPointer } from './model.js'

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
