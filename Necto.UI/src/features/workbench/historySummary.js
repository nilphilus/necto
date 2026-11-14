import { sensitiveName } from './privacy.js'
const short = value => String(value).replace(/[\r\n\t]/g, ' ').slice(0, 64)
export function historySummary(entry, operation) {
  try {
    const url = new URL(entry.snapshot?.request?.url ?? entry.url)
    const route = (operation.path ?? '').split('/').filter(Boolean)
    const actual = url.pathname.split('/').filter(Boolean)
    const prefix = actual.slice(0, Math.max(0, actual.length - route.length))
    const target = url.host + (prefix.length ? '/' + prefix.join('/') : '')
    const parameters = operation.parameters ?? []
    const names = [...new Set([...parameters.filter(p => p.in === 'query').map(p => p.name), ...url.searchParams.keys()])]
    for (const name of names) {
      const value = url.searchParams.get(name)
      if (value && !sensitiveName(name) && !/\[redacted\]/i.test(value))
        return { input: short(name) + '=' + short(value), target }
    }
    for (let index = 0; index < route.length; index++) {
      const match = route[index].match(/^\{([^}]+)\}$/)
      if (match && !sensitiveName(match[1])) {
        const value = actual[actual.length - route.length + index]
        if (value) return { input: short(match[1]) + '=' + short(decodeURIComponent(value)), target }
      }
    }
    return { input: '', target }
  } catch { return { input: '', target: '' } }
}
