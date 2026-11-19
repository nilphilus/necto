import { reactive } from 'vue'

export function createRelatedDrafts() {
  const byResponse = new WeakMap()

  return (response, targetKey) => {
    let byTarget = byResponse.get(response)
    if (!byTarget) {
      byTarget = new Map()
      byResponse.set(response, byTarget)
    }
    if (!byTarget.has(targetKey)) byTarget.set(targetKey, reactive(Object.create(null)))
    return byTarget.get(targetKey)
  }
}
