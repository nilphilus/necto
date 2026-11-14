import { shallowRef, toValue, watch } from 'vue'
const update = shallowRef({ keys: new Set() })
// Notify only after the entire storage transaction commits. No credentials cross this channel.
export function notifyWorkspaceImport(keys) { update.value = { keys: new Set(keys) } }
export function onWorkspaceImport(key, refresh) {
  return watch(update, batch => {
    const current = toValue(key)
    if (current && batch.keys.has(current)) refresh(current)
  }, { flush: 'sync' })
}
