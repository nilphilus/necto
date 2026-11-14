export const SEARCH_PAGE_SIZE = 25
export const MAX_QUERY_LENGTH = 200

export function pathLabel(path) {
  const label = '$' + path.map(part => `[${JSON.stringify(part)}]`).join('')
  return label.length > 240 ? label.slice(0, 100) + ' … ' + label.slice(-120) : label
}

export function isPrefix(prefix, path) {
  return prefix.length <= path.length && prefix.every((part, index) => part === path[index])
}

export function valueAtPath(value, path) {
  for (const part of path) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined
    value = value[part]
  }
  return value
}

export function selectableOwner(document, path, selectors = []) {
  const candidates = selectors.filter(selector => selector.length <= path.length && selector.every((part, index) =>
    part === null ? Number.isInteger(path[index]) : part === path[index])).sort((a, b) => b.length - a.length)
  for (const selector of candidates) {
    const candidate = path.slice(0, selector.length)
    const value = valueAtPath(document, candidate)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return candidate
  }
  return null
}

const excerpt = (value, offset) => {
  const start = Math.max(0, offset - 45)
  return (start ? '…' : '') + value.slice(start, start + 140) + (value.length > start + 140 ? '…' : '')
}

// Walk the parsed JSON iteratively. Only the requested result window retains paths.
export async function searchPayload(document, { query, scope = 'all', caseSensitive = false, exact = false, field = '',
  page = 1, size = SEARCH_PAGE_SIZE, knownTotal, shouldCancel = () => false,
  onProgress = () => {}, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
  if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) throw new Error(`Use a search term of at most ${MAX_QUERY_LENGTH} characters.`)
  if (!['all', 'keys', 'values'].includes(scope)) throw new Error('Unknown search scope.')
  size = Math.max(1, Math.min(100, Math.trunc(size) || SEARCH_PAGE_SIZE))
  page = Math.max(1, Math.trunc(Number(page)) || 1)
  if (knownTotal !== undefined) page = Math.min(page, Math.max(1, Math.ceil(knownTotal / size)))
  if (!query.trim() || knownTotal === 0) return { matches: [], total: 0, page: 1, pages: 1, scanned: 0 }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(exact ? `^(?:${escaped})$` : escaped, caseSensitive ? 'u' : 'iu')
  const match = text => {
    const hit = pattern.exec(text)
    return hit && (!exact || hit[0].length === text.length) ? hit : null
  }
  const start = (page - 1) * size, end = start + size
  const matches = []
  const stack = [{ value: document, part: undefined, key: null, entered: false, index: 0 }]
  let total = 0, scanned = 0, batch = 0
  let lastProgress = performance.now(), batchStarted = lastProgress
  while (stack.length) {
    if (shouldCancel()) return { cancelled: true }
    const frame = stack.at(-1)
    if (!frame.entered) {
      frame.entered = true
      scanned++; batch++
      const scalar = frame.value === null || typeof frame.value !== 'object'
      const text = scalar ? typeof frame.value === 'string' ? frame.value : JSON.stringify(frame.value) : null
      const matchesField = !field || frame.key === field
      const keyHit = matchesField && scope !== 'values' && frame.key !== null ? match(frame.key) : null
      const valueHit = matchesField && scope !== 'keys' && text !== null ? match(text) : null
      if (keyHit || valueHit) {
        if (total >= start && total < end) matches.push({
          path: stack.slice(1).map(entry => entry.part),
          kind: keyHit && valueHit ? 'key and value' : keyHit ? 'key' : 'value',
          offset: valueHit?.index ?? 0, length: valueHit?.[0].length ?? 0,
          snippet: excerpt(valueHit ? text : frame.key, valueHit?.index ?? keyHit.index),
        })
        total++
        if (knownTotal !== undefined && total >= end) break
      }
      if (scalar) stack.pop()
      else frame.keys = Array.isArray(frame.value) ? null : Object.keys(frame.value)
    } else {
      const count = frame.keys ? frame.keys.length : frame.value.length
      if (frame.index >= count) stack.pop()
      else {
        const part = frame.keys ? frame.keys[frame.index] : frame.index
        frame.index++
        stack.push({ value: frame.value[part], part, key: frame.keys ? part : null, entered: false, index: 0 })
      }
    }
    if (batch >= 5000 || (batch % 256 === 0 && performance.now() - batchStarted >= 8)) {
      const now = performance.now()
      if (now - lastProgress >= 100) { onProgress(scanned); lastProgress = now }
      await yieldControl()
      batch = 0; batchStarted = performance.now()
    }
  }
  if (shouldCancel()) return { cancelled: true }
  const count = knownTotal ?? total
  const pages = Math.max(1, Math.ceil(count / size))
  if (page > pages) return searchPayload(document, { query, scope, caseSensitive, exact, field, page: pages, size,
    knownTotal: count, shouldCancel, onProgress, yieldControl })
  return { matches, total: count, page, pages, scanned }
}
