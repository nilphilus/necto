import { notifyWorkspaceImport } from '../workbench/workspaceUpdates.js'
import { sharedOrigin } from './origin.js'

export function teamCollection({ keyForWorkspace, property, canonical }) {
  function importDefinition({ storage, workspace, definition, confirmReplace, guard, byteLimit }) {
    const collectionKey = keyForWorkspace(workspace)
    const before = storage.getItem(collectionKey)
    const stored = before ? JSON.parse(before) : { version: 1, [property]: [] }
    if (stored.version !== 1 || !Array.isArray(stored[property]))
      throw new Error(
        'The saved browser collection is invalid. Export or repair it before importing.'
      )
    const existing = stored[property].map((item) => {
      const definition = canonical(item),
        origin = sharedOrigin(item._sharedSource)
      return origin ? { ...definition, _sharedSource: origin } : definition
    })
    if (new Set(existing.map((item) => item.id)).size !== existing.length)
      throw new Error('The browser collection contains duplicate IDs.')
    const previous = existing.find((item) => item.id === definition.id)
    if (
      previous &&
      JSON.stringify(canonical(previous)) !== JSON.stringify(canonical(definition)) &&
      !confirmReplace(
        `Replace the saved browser definition “${previous.name}”? Unsaved drafts are kept. No request will run.`
      )
    )
      return false
    const next = [...existing.filter((item) => item.id !== definition.id), definition]
    if (next.length > 100)
      throw new Error('A browser scenario collection supports at most 100 definitions.')
    const text = JSON.stringify({ version: 1, [property]: next })
    if (new TextEncoder().encode(text).length > byteLimit)
      throw new Error(
        'The browser collection would exceed 2 MiB. Remove or export some saved definitions first.'
      )
    guard()
    if (storage.getItem(collectionKey) !== before)
      throw new Error('Saved scenarios changed in another tab. Try importing again.')
    storage.setItem(collectionKey, text)
    notifyWorkspaceImport([collectionKey])
    return true
  }

  function updateOrigin({ storage, workspace, source, origin }) {
    const collectionKey = keyForWorkspace(workspace)
    try {
      const raw = storage.getItem(collectionKey)
      if (!raw) return
      const stored = JSON.parse(raw),
        item = stored[property]?.find((item) => item.id === source.id)
      if (item && JSON.stringify(canonical(item)) === JSON.stringify(canonical(source))) {
        item._sharedSource = origin
        storage.setItem(collectionKey, JSON.stringify(stored))
        notifyWorkspaceImport([collectionKey])
      }
    } catch {
      /* The disk save remains valid if optional browser provenance cannot be persisted. */
    }
  }

  return { importDefinition, updateOrigin }
}
