import { validateConnectionCollection } from '../external-apis/connections.js'
import { validateScenarioCollection } from '../scenarios/definition.js'
import { validateBuilderCollection } from '../scenario-builder/definition.js'
import { validateSampleCollection } from '../request-runner/samples.js'
import { validatePresetCollection } from '../presets/presetCollection.js'
import { scrubExportValue, workspaceExport, workspaceExportEntry } from './workspaceExport.js'

const allowed = (key) =>
  /^necto:(scenario-builder|scenarios|samples|request-samples|environments|external-apis|servers):/.test(key)

export function exportWorkspace(storage, includeBodies = false) {
  const entries = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!allowed(key)) continue
    entries.push(workspaceExportEntry(key, JSON.parse(storage.getItem(key)), includeBodies))
  }
  return workspaceExport(entries, includeBodies)
}

export function inspectWorkspace(text, storage) {
  if (text.length > 2 * 1024 * 1024)
    throw new Error('Workspace imports are limited to 2 MB.')
  const workspace = JSON.parse(text)
  if (
    workspace?.format !== 'necto-workspace' ||
    workspace.version !== 1 ||
    !Array.isArray(workspace.entries) ||
    workspace.entries.length > 1000
  )
    throw new Error('Unsupported workspace format or version.')
  const keys = new Set()
  for (const entry of workspace.entries) {
    if (
      typeof entry.key !== 'string' ||
      !allowed(entry.key) ||
      keys.has(entry.key) ||
      !entry.value ||
      typeof entry.value !== 'object'
    )
      throw new Error('Invalid or duplicate workspace entry.')
    const value = entry.value
    if (entry.key.startsWith('necto:scenario-builder:')) {
      validateBuilderCollection(value)
    } else if (entry.key.startsWith('necto:scenarios:')) {
      validateScenarioCollection(value)
    } else if ((entry.key.startsWith('necto:samples:') || entry.key.startsWith('necto:request-samples:'))) {
      validateSampleCollection(value)
    } else if (entry.key.startsWith('necto:external-apis:')) {
      validateConnectionCollection(value)
    } else if (entry.key.startsWith('necto:environments:')) {
      validatePresetCollection(value)
    } else if (
      Object.values(value).some(
        (server) =>
          !server ||
          typeof server.url !== 'string' ||
          (server.values !== undefined && typeof server.values !== 'object')
      )
    )
      throw new Error('Invalid server profiles.')
    keys.add(entry.key)
    entry.conflict = storage.getItem(entry.key) !== null
  }
  return workspace
}
export function importWorkspace(workspace, storage, overwrite = false) {
  const validated = inspectWorkspace(JSON.stringify(workspace), storage),
    changed = []
  try {
    for (const entry of validated.entries) {
      if (entry.conflict && !overwrite) continue
      changed.push([entry.key, storage.getItem(entry.key)])
      storage.setItem(entry.key, JSON.stringify(scrubExportValue(entry.value, true)))
    }
  } catch (cause) {
    for (const [key, value] of changed.reverse()) {
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, value)
    }
    throw cause
  }
  return changed.length
}
