import { exportWorkspace, inspectWorkspace } from './workspace.js'
const clone = value => JSON.parse(JSON.stringify(value))
function type(key) { return key.split(':')[1] }
function records(entry) {
  const value = entry.value, kind = type(entry.key)
  if (kind === 'scenarios') return value.scenarios.map(item => ({ id: item.id, label: item.name, value: item }))
  if (kind === 'samples') return value.samples.map(item => ({ id: item.name, label: item.name, value: item }))
  if (kind === 'environments') return (value.presets ?? value.environments).map(([name, item]) => ({ id: name, label: name, value: item }))
  if (kind === 'external-apis') return value.connections.map(item => ({ id: item.id, label: item.name, value: item }))
  return Object.entries(value).map(([name, item]) => ({ id: name, label: name, value: item }))
}
const defaults = { scenarios: { version: 1, scenarios: [] }, samples: { samples: [], defaultName: '' }, environments: { version: 2, presets: [], active: [], colors: {} }, 'external-apis': { connections: [], show: false }, servers: {} }
export function planTransfer(workspace, storage) {
  const validated = inspectWorkspace(JSON.stringify(workspace), storage)
  return validated.entries.flatMap(entry => {
    const existing = storage.getItem(entry.key)
    const destination = existing ? records({ key: entry.key, value: JSON.parse(existing) }) : []
    const safeEntry = exportWorkspace({ length: 1, key: () => entry.key, getItem: () => JSON.stringify(entry.value) }, true).entries[0]
    return records(safeEntry).map(record => ({ ...clone(record), key: entry.key, existingLabel: destination.find(item => item.id === record.id)?.label, kind: type(entry.key), conflict: destination.some(item => item.id === record.id), action: destination.some(item => item.id === record.id) ? 'keep' : 'add' }))
  })
}
export function applyTransfer(items, storage) {
  const updates = new Map(), changed = []
  for (const item of items) {
    if (item.action === 'keep') continue
    if (!['add','replace','copy'].includes(item.action)) throw new Error('Invalid import action.')
    if (item.action === 'copy' && !['scenarios','samples','environments'].includes(item.kind)) throw new Error('This item cannot be copied into a different API identity.')
    if (!updates.has(item.key)) updates.set(item.key, JSON.parse(storage.getItem(item.key) ?? JSON.stringify(defaults[item.kind])))
    const destination = updates.get(item.key), current = records({ key: item.key, value: destination })
    let id = item.id, label = item.label, value = clone(item.value)
    const existing = current.find(record => record.id === id)
    if (item.action === 'add' && existing) throw new Error('An item changed since the import preview. Review it again.')
    if (item.action === 'copy') {
      let count = 1
      while (current.some(record => record.label === `${item.label} (imported ${count})`)) count++
      label = `${item.label} (imported ${count})`
      id = item.kind === 'scenarios' ? crypto.randomUUID() : label
      if (item.kind !== 'environments') value = { ...value, ...(item.kind === 'scenarios' ? { id } : {}), name: label }
    }
    const upsert = (list, match, next) => { const index = list.findIndex(match); if (index < 0) list.push(next); else list[index] = next }
    if (item.kind === 'scenarios') upsert(destination.scenarios, record => record.id === id, value)
    else if (item.kind === 'samples') upsert(destination.samples, record => record.name === id, value)
    else if (item.kind === 'environments') {
      if (destination.version !== 2) throw new Error('Open and save legacy presets in Settings before importing into them.')
      upsert(destination.presets, record => record[0] === id, [id, value])
    } else if (item.kind === 'external-apis') upsert(destination.connections, record => record.id === id, value)
    else Object.defineProperty(destination, id, { value, enumerable: true, configurable: true, writable: true })
    changed.push(label)
  }
  const workspace = { format: 'necto-workspace', version: 1, entries: [...updates].map(([key, value]) => ({ key, value })) }
  inspectWorkspace(JSON.stringify(workspace), storage)
  const previous = []
  try { for (const [key, value] of updates) { previous.push([key, storage.getItem(key)]); storage.setItem(key, JSON.stringify(value)) } }
  catch (cause) { for (const [key, value] of previous.reverse()) { if (value === null) storage.removeItem(key); else storage.setItem(key, value) }; throw cause }
  return changed
}
export function exportScenario(storage, id, apiUrl, includeBodies = false) {
  const workspace = exportWorkspace(storage, includeBodies)
  workspace.entries = workspace.entries.filter(entry => entry.key === `necto:scenarios:${apiUrl}`)
  for (const entry of workspace.entries) entry.value.scenarios = entry.value.scenarios.filter(scenario => scenario.id === id)
  if (!workspace.entries.some(entry => entry.value.scenarios.length)) throw new Error('This scenario is no longer saved.')
  return workspace
}
