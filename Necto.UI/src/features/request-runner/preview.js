export const PREVIEW_PAGE_SIZE = 25
export const TEXT_PAGE_SIZE = 20000
export const STRING_PAGE_SIZE = 2000

export function pageRange(total, requestedPage, size) {
  const pages = Math.max(1, Math.ceil(total / size))
  const page = Math.max(1, Math.min(pages, Math.trunc(Number(requestedPage)) || 1))
  const start = (page - 1) * size
  return { page, pages, start, end: Math.min(total, start + size), total }
}

export function childEntries(value, range, keys) {
  const array = Array.isArray(value)
  const entries = []
  for (let index = range.start; index < range.end; index++) {
    const key = array ? index : keys[index]
    entries.push([key, value[key]])
  }
  return entries
}
