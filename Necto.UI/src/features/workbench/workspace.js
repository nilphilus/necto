import { validateConnectionCollection } from '../external-apis/connections.js'
import { validateScenarioCollection } from '../scenarios/definition.js'
import { validateBuilderCollection } from '../scenario-builder/definition.js'
import { validateSampleCollection } from '../request-runner/samples.js'
import { validatePresetCollection } from '../presets/presetCollection.js'
import { sensitiveName } from './privacy.js'
function safeUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return value
    url.username = ''
    url.password = ''
    for (const name of new Set(url.searchParams.keys()))
      if (sensitiveName(name)) url.searchParams.set(name, '[redacted]')
    return url.href
  } catch {
    return value
  }
}
const allowed = (key) =>
  /^necto:(scenario-builder|scenarios|samples|request-samples|environments|external-apis|servers):/.test(key)
function scrub(value, includeBodies, key = '') {
  if (sensitiveName(key)) return undefined
  if (Array.isArray(value))
    return value
      .filter(
        (item) => !(Array.isArray(item) && sensitiveName(String(item[0])))
      )
      .map((item) => scrub(item, includeBodies))
      .filter((item) => item !== undefined)
  if (typeof value === 'string' && /^https?:/i.test(value))
    return safeUrl(value)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([name]) =>
          !sensitiveName(name) &&
          !['binaryFile', 'files'].includes(name) &&
          (includeBodies || !['formFields'].includes(name))
      )
      .map(([name, item]) => [
        name,
        name === 'body' && !includeBodies
          ? ''
          : scrub(item, includeBodies, name)
      ])
      .filter(([, item]) => item !== undefined)
  )
}
export function exportWorkspace(storage, includeBodies = false) {
  const entries = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!allowed(key)) continue
    const value = scrub(JSON.parse(storage.getItem(key)), includeBodies)
    let safeKey = key
    if (key.startsWith('necto:request-samples:')) {
      const scope = JSON.parse(key.slice('necto:request-samples:'.length))
      safeKey = 'necto:request-samples:' + JSON.stringify([safeUrl(scope[0]), ...scope.slice(1)])
    } else {
      const match = key.match(/https?:.*/)
      safeKey = match ? key.slice(0, match.index) + safeUrl(match[0]) : key
    }
    entries.push({ key: safeKey, value })
  }
  return {
    format: 'necto-workspace',
    version: 1,
    exportedAt: new Date().toISOString(),
    includesBodies: includeBodies,
    entries
  }
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
      storage.setItem(entry.key, JSON.stringify(scrub(entry.value, true)))
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
