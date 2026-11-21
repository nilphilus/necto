import { readOperations } from '../features/api-catalog/catalog.js'
import { builderCollection, builderCollectionKey, savedBlueprint } from '../features/scenario-builder/definition.js'
import { newBlueprint, newStep } from '../features/scenario-builder/model.js'

export function installStarterScenario(storage, workspace, contract) {
  const key = builderCollectionKey(workspace)
  if (storage.getItem(key) !== null) return

  const operations = readOperations(contract)
  const listBuildings = operations.find(operation => operation.id === 'ListBuildings')
  const listInvoices = operations.find(operation => operation.id === 'ListInvoices')
  const buildingId = listInvoices?.parameters.find(parameter => parameter.in === 'query' && parameter.name.toLowerCase() === 'buildingid')
  if (!listBuildings || !listInvoices || !buildingId) return

  const buildings = newStep(listBuildings, {})
  buildings.label = 'List buildings'
  const invoices = newStep(listInvoices, {})
  invoices.label = 'List invoices for the first building'
  invoices.inputs = [{ source: 'response', location: 'query', name: buildingId.name, stepId: buildings.id, responsePointer: '/0/id' }]

  const scenario = {
    ...newBlueprint(),
    name: 'Building billing history',
    description: 'Run this read-only scenario and inspect how the first building ID becomes the invoice filter.',
    steps: [buildings, invoices],
  }
  storage.setItem(key, JSON.stringify(builderCollection([savedBlueprint(scenario)])))
}
