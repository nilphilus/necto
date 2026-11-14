import { tableColumns } from './collectionTable.js'
// Bounded structural fingerprint only: never store response values or row IDs.
export function tableShape(value) {
  const columns = tableColumns(value, 100).sort()
  if (!columns.length) return ''
  return JSON.stringify(columns.map(name => [name, [...new Set(value.slice(0,25).flatMap(row => row[name] == null ? [] : [typeof row[name]]))].sort()]))
}
export function tablePreferenceKey(operation, path, value) {
  const shape=tableShape(value)
  return shape ? JSON.stringify([operation?.key ?? '', path ?? [], shape]) : ''
}
export function rememberColumns(preferences, key, columns) {
  if (!preferences || !key) return
  preferences.tables ??= {}
  // Refresh insertion order, retaining at most eight compatible table shapes.
  delete preferences.tables[key]
  preferences.tables[key] = columns.slice(0,100)
  for (const old of Object.keys(preferences.tables).slice(0,-8)) delete preferences.tables[old]
}
