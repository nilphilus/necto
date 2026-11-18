import { sensitiveName } from './privacy.js'

function safeUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return value
    url.username = ''
    url.password = ''
    for (const name of new Set(url.searchParams.keys()))
      if (sensitiveName(name)) url.searchParams.set(name, '[redacted]')
    return url.href
  } catch {
    return value
  }
}
export function scrubExportValue(value, includeBodies, key = '') {
  if (sensitiveName(key)) return undefined
  if (Array.isArray(value))
    return value
      .filter(
        (item) => !(Array.isArray(item) && sensitiveName(String(item[0])))
      )
      .map((item) => scrubExportValue(item, includeBodies))
      .filter((item) => item !== undefined)
  if (typeof value === 'string' && /^https?:/i.test(value))
    return safeUrl(value)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([name]) =>
          !sensitiveName(name) &&
          !['binaryFile', 'files'].includes(name) &&
          (includeBodies || !['formFields'].includes(name))
      )
      .map(([name, item]) => [
        name,
        name === 'body' && !includeBodies
          ? ''
          : scrubExportValue(item, includeBodies, name)
      ])
      .filter(([, item]) => item !== undefined)
  )
}

export function workspaceExportEntry(key, value, includeBodies) {
  let safeKey = key
  if (key.startsWith('necto:request-samples:')) {
    const scope = JSON.parse(key.slice('necto:request-samples:'.length))
    safeKey = 'necto:request-samples:' + JSON.stringify([safeUrl(scope[0]), ...scope.slice(1)])
  } else {
    const match = key.match(/https?:.*/)
    safeKey = match ? key.slice(0, match.index) + safeUrl(match[0]) : key
  }
  return { key: safeKey, value: scrubExportValue(value, includeBodies) }
}

export function workspaceExport(entries, includeBodies) {
  return {
    format: 'necto-workspace',
    version: 1,
    exportedAt: new Date().toISOString(),
    includesBodies: includeBodies,
    entries,
  }
}
