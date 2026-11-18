import { canCaptureHistory } from '../workbench/historySnapshot.js'
import { sharedDefinition } from '../scenario-folder/format.js'
import { allConnections, upgradeBlueprint } from './connections.js'
import { newBlueprint, newStep } from './model.js'

export function appendHistoryRequests(existing, name, operation, entries) {
  if (!entries.length || !entries.every(canCaptureHistory))
    throw new Error('Choose successful requests with retained inputs.')
  const blueprint = existing ? upgradeBlueprint(existing) : { ...newBlueprint(), name }
  const captured = sharedDefinition('builder', {
    ...newBlueprint(),
    name: blueprint.name,
    steps: entries.map((entry) => ({
      ...newStep(operation, entry.snapshot.draft),
      label: operation.name.trim().slice(0, 200) || operation.method,
    })),
  }, [operation]).steps

  const outgoing = new Set(allConnections(blueprint).map((edge) => edge.from))
  let previous = blueprint.steps.filter((step) => !outgoing.has(step.id)).map((step) => step.id)
  for (const step of captured) {
    blueprint.connections.push(...previous.map((from) => ({ from, to: step.id })))
    previous = [step.id]
  }
  blueprint.steps.push(...captured)
  return blueprint
}
