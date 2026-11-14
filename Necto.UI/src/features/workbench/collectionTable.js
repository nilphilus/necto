export function tableColumns(value, limit = 12) {
  if (!Array.isArray(value) || !value.length) return []
  if (value.slice(0, 25).some(row => !row || typeof row !== 'object' || Array.isArray(row))) return []
  const columns = new Set()
  for (const row of value.slice(0, 25)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return []
    for (const name of Object.keys(row).slice(0, 100)) {
      if (row[name] === null || typeof row[name] !== 'object') columns.add(name)
      if (columns.size >= limit) return [...columns]
    }
  }
  return [...columns]
}
export function tableCell(value) {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'object') return Array.isArray(value) ? `[${value.length} items]` : '{object}'
  return String(value).slice(0, 180) + (String(value).length > 180 ? '…' : '')
}
