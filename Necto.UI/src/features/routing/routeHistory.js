const MAX_ENTRIES = 40
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024

function responseWeight(result) {
  if (!result) return 0
  const text = result.rawText ?? result.text ?? ''
  // Charge for UTF-16 text and the parsed JSON alongside it.
  const textWeight = typeof text === 'string' ? text.length * (result.json === undefined ? 2 : 6) : 0
  return textWeight + (result.binary?.size ?? 0)
}

export function trimRouteHistory(entries, { maxEntries = MAX_ENTRIES, maxBytes = MAX_RESPONSE_BYTES } = {}) {
  const retainedSessions = new Set()
  let bytes = 0, count = 0
  for (const [key, entry] of [...entries].reverse()) {
    const sessions = [...new Set(entry.steps.map(step => step.session))].filter(session => !retainedSessions.has(session))
    const weight = sessions.reduce((total, session) =>
      total + responseWeight(session?.result) + responseWeight(session?.result?.reception), 0)
    if (count >= maxEntries || bytes + weight > maxBytes) {
      entries.delete(key)
      continue
    }
    for (const session of sessions) retainedSessions.add(session)
    count++
    bytes += weight
  }
}
