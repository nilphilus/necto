export function tableColumns(value, limit = 12) {
  if (!Array.isArray(value) || !value.length) return [];
  if (
    value
      .slice(0, 25)
      .some((row) => !row || typeof row !== 'object' || Array.isArray(row))
  )
    return [];
  const columns = new Set();
  for (const row of value.slice(0, 25)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    for (const name of Object.keys(row).slice(0, 100)) {
      if (row[name] === null || typeof row[name] !== 'object')
        columns.add(name);
      if (columns.size >= limit) return [...columns];
    }
  }
  return [...columns];
}
export function tableCell(value) {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object')
    return Array.isArray(value) ? `[${value.length} items]` : '{object}';
  return String(value).slice(0, 180) + (String(value).length > 180 ? '…' : '');
}

// Bound each discovery pass; never walk the full response during render.
export function discoverTableColumns(value, start = 0, count = 25, limit = 100) {
  if (!Array.isArray(value)) return []
  const columns = new Set()
  for (let index = start; index < Math.min(value.length, start + Math.min(count, 250)); index++) {
    const row = value[index]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    for (const key of Object.keys(row).slice(0, 100)) {
      if (row[key] === null || typeof row[key] !== 'object') columns.add(key)
      if (columns.size >= limit) return [...columns]
    }
  }
  return [...columns]
}
export function contractTableColumns(operation, status, contentType) {
  if (!operation?.resolve) return []
  const raw = operation.responses?.[status] ?? operation.responses?.[`${String(status)[0]}XX`] ?? operation.responses?.default
  const response = operation.resolve(raw), media = response?.content?.[contentType?.split(';')[0].trim()]
  const schema = operation.resolve(media?.schema), item = operation.resolve(schema?.items)
  return Object.entries(item?.properties ?? {}).slice(0, 100).filter(([, property]) => {
    const type = operation.resolve(property)?.type
    return type && ![type].flat().some(value => ['object', 'array'].includes(value))
  }).map(([key]) => key)
}
