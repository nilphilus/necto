import { validateSharedIdentity } from '../scenario-definitions/sharedIdentity.js'
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
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
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
  validateSharedIdentity(scenario)
  const definition = savedBlueprint(scenario)
  for (const step of definition.steps) requestDefinition(step.request)
  return definition
}

export const builderCollectionKey = (workspace) => 'necto:scenario-builder:' + workspace
export const builderCollection = (blueprints = []) => ({ version: 1, blueprints })

export function readBuilderCollection(text) {
  const collection = JSON.parse(text) ?? builderCollection()
  validateBuilderCollection(collection)
  return collection.blueprints
}

export const teamDefinitions = teamCollection({
  keyForWorkspace: builderCollectionKey,
  property: 'blueprints',
  collection: builderCollection,
  canonical: sharedBlueprint,
})

export function validateBuilderCollection(value) {
  if (value.version !== 1 || !Array.isArray(value.blueprints) || value.blueprints.length > 100)
    throw new Error('Invalid builder collection.')
  value.blueprints.forEach(validateBlueprint)
  if (new Set(value.blueprints.map((item) => item.id)).size !== value.blueprints.length)
    throw new Error('Duplicate builder IDs.')
}

export const builderTransfer = {
  empty: builderCollection,
  records: ({ blueprints }) =>
    blueprints.map((value) => ({ id: value.id, label: value.name, value })),
  upsert(collection, id, value) {
    const index = collection.blueprints.findIndex((blueprint) => blueprint.id === id)
    if (index < 0) collection.blueprints.push(value)
    else collection.blueprints[index] = value
  },
}
