import { validateSharedIdentity } from '../scenario-definitions/sharedIdentity.js'
import { teamCollection } from '../scenario-definitions/teamCollection.js'
import { validateScenario } from './scenario.js'
import { payloadSnapshot } from '../workbench/body.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { requestDefinition } from '../scenario-definitions/requestDefinition.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

export function sharedChain(scenario) {
  validateSharedIdentity(scenario)
  validateScenario(scenario)
  const definition = clone({
    version: 1,
    id: scenario.id,
    name: scenario.name.trim(),
    steps: scenario.steps.map((step) => ({
      operationKey: step.operationKey,
      apiId: step.apiId,
      name: step.name,
      method: step.method,
      path: step.path,
      fields: step.fields,
      body: step.body,
      bindings: step.bindings.map((binding) => ({
        sourceStep: binding.sourceStep,
        path: binding.path,
        location: binding.location,
        name: binding.name,
        ...(binding.selector
          ? {
              selector: {
                arrayPath: binding.selector.arrayPath,
                field: binding.selector.field,
                expected: binding.selector.expected,
              },
            }
          : {}),
      })),
      ...payloadSnapshot(step),
      ...executionOptions(step),
      assertions: step.assertions ?? [],
      serverIndex: step.serverIndex,
      serverValues: step.serverValues ?? {},
    })),
  })
  definition.steps.forEach(requestDefinition)
  return definition
}

export const scenarioCollectionKey = (workspace) => 'necto:scenarios:' + workspace
export const scenarioCollection = (scenarios = []) => ({ version: 1, scenarios })

export function readScenarioCollection(text) {
  const collection = JSON.parse(text) ?? scenarioCollection()
  validateScenarioCollection(collection)
  return collection.scenarios
}

export const teamDefinitions = teamCollection({
  keyForWorkspace: scenarioCollectionKey,
  property: 'scenarios',
  collection: scenarioCollection,
  canonical: sharedChain,
})

export function validateScenarioCollection(value) {
  if (value.version !== 1 || !Array.isArray(value.scenarios))
    throw new Error('Invalid scenario collection.')
  value.scenarios.forEach(validateScenario)
  if (new Set(value.scenarios.map((item) => item.id)).size !== value.scenarios.length)
    throw new Error('Duplicate scenario IDs.')
}
