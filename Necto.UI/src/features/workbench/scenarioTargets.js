import { prepareScenario } from '../scenarios/scenario.js'
import { effectiveTarget } from './target.js'
// Preview current server resolution without credentials or request execution.
export function scenarioTargets(scenario, context) {
  try {
    return prepareScenario(scenario, { ...context, validateRequests: false }).map(step => ({
      operation: `${step.operation.method} ${step.operation.path}`,
      target: effectiveTarget(step.operation, context.configuration, step.session, step.values).label,
      api: step.operation.apiName ?? 'Local API'
    }))
  } catch { return [{ error: 'Targets could not be resolved. Check API visibility and saved steps before running.' }] }
}
