import { teamCollection } from '../scenario-definitions/teamCollection.js'
import { randomSnapshot } from './random.js'
import { expressionSnapshot } from './expression.js'
import { payloadSnapshot } from '../workbench/body.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { validateBlueprint } from './model.js'
import { variableSnapshot } from './variables.js'
import { waitOptions } from './waiting.js'
import { allConnections, hasTiming, upgradeBlueprint } from './connections.js'
import { requestDefinition } from '../scenario-definitions/requestDefinition.js'

const clone = (value) => JSON.parse(JSON.stringify(value))
export function savedBlueprint(draft) {
  validateBlueprint(draft)
  draft = upgradeBlueprint(draft)
  const saved = clone({
    format: draft.format,
    version: 7,
    variables: draft.variables.map(variableSnapshot),
    id: draft.id,
    name: draft.name.trim(),
    concurrency: draft.concurrency,
    connections: allConnections(draft)
      .filter((edge) => edge.from !== null || hasTiming(edge))
      .map((edge) => ({ from: edge.from, to: edge.to, ...waitOptions(edge) })),
    steps: draft.steps.map((step) => ({
      ...(step.position ? { position: { ...step.position } } : {}),
      id: step.id,
      label: step.label.trim(),
      operationKey: step.operationKey,
      apiId: step.apiId,
      method: step.method,
      path: step.path,
      dependsOn: [],
      inputs: step.inputs.map((input) => ({
        location: input.location,
        ...(input.location === 'body' ? { pointer: input.pointer } : { name: input.name }),
        source: input.source,
        ...(input.source === 'random'
          ? randomSnapshot(input)
          : input.source === 'expression'
            ? expressionSnapshot(input)
            : input.source === 'response'
              ? { stepId: input.stepId, responsePointer: input.responsePointer }
              : input.source === 'variable'
                ? { variableId: input.variableId }
                : input.source === 'human'
                  ? { prompt: input.prompt, valueType: input.valueType }
                  : input.source === 'generate'
                    ? {
                        generator: input.generator,
                        ...(input.generator === 'regex' ? { pattern: input.pattern } : {}),
                      }
                    : {}),
      })),
      request: {
        fields: { ...step.request.fields },
        body: step.request.body,
        ...payloadSnapshot(step.request),
        ...executionOptions(step.request),
        assertions: step.request.assertions ?? [],
        serverIndex: step.request.serverIndex,
        serverValues: step.request.serverValues ?? {},
      },
    })),
  })
  validateBlueprint(saved)
  return saved
}
export function sharedBlueprint(scenario) {
  const definition = savedBlueprint(scenario)
  for (const step of definition.steps) requestDefinition(step.request)
  return definition
}

export const teamDefinitions = teamCollection({
  keyForWorkspace: (workspace) => 'necto:scenario-builder:' + workspace,
  property: 'blueprints',
  canonical: sharedBlueprint,
})
