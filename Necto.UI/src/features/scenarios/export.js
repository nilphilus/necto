import { scrubExportValue, workspaceExport, workspaceExportEntry } from '../workbench/workspaceExport.js'
import { scenarioCollection, scenarioCollectionKey } from './definition.js'

export function exportScenario(storage, id, workspace, includeBodies = false) {
  const key = scenarioCollectionKey(workspace)
  const collection = JSON.parse(storage.getItem(key))
  const scenario = collection?.scenarios?.find((item) => item.id === id)
  if (!scenario) throw new Error('This scenario is no longer saved.')
  const entry = workspaceExportEntry(key, scenarioCollection([scenario]), includeBodies)
  return workspaceExport([entry], includeBodies)
}

export function exportScenarioDefinition(scenario, includeBodies = false) {
  return scrubExportValue(JSON.parse(JSON.stringify(scenario)), includeBodies)
}
