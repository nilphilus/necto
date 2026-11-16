const views = ['api', 'scenarios', 'entities', 'endpoints', 'agent', 'builder']

export function readRoute(pathname, basePath) {
  const path = pathname.slice(basePath.length).replace(/\/$/, '')
  if (!path || views.includes(path)) return { view: path === 'api' ? '' : path }
  const parts = path.split('/')
  try {
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'endpoint' && parts[2]) {
      return { view: '', operationKey: decodeURIComponent(parts[2]) }
    }
    if (parts.length === 4 && parts[0] === 'scenarios' && parts[1] && parts[2] === 'steps' &&
      /^(?:[1-9]\d?|100)$/.test(parts[3])) {
      return { view: '', scenarioId: decodeURIComponent(parts[1]), index: Number(parts[3]) - 1 }
    }
  } catch {
    // An invalid percent escape cannot identify an operation or scenario.
  }
  return { view: '', invalid: true }
}

export function routePath(route, basePath) {
  if (route.scenarioId) {
    return `${basePath}scenarios/${encodeURIComponent(route.scenarioId)}/steps/${route.index + 1}`
  }
  if (route.operationKey) return `${basePath}api/endpoint/${encodeURIComponent(route.operationKey)}`
  return basePath + (route.view || 'api')
}
