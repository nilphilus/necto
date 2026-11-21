import { watch } from 'vue'

function operationOrigins(entries, config, serverProfiles) {
  const origins = new Set([new URL(config.openApiUrl).origin, new URL(config.apiBaseUrl || '/', config.openApiUrl).origin])
  for (const operation of entries) {
    for (const server of [operation.server, ...(operation.servers ?? []), serverProfiles?.[operation.apiId ?? 'local']].filter(Boolean)) {
      try {
        const url = server.url.replace(/\{([^}]+)\}/g, (_, name) => server.values?.[name] ?? server.variables?.[name]?.default ?? '')
        origins.add(new URL(url, config.openApiUrl).origin)
      } catch { /* Invalid servers are reported when building requests. */ }
    }
  }
  return [...origins]
}

export function registerWorkspaceApis({ spec, configuration, operations, connections, contexts, authentication }) {
  watch([spec, configuration, operations, connections, contexts], () => {
    const activeIds = new Set(['local', ...connections.value.map(entry => entry.id)])
    for (const id of authentication.apis.keys()) if (!activeIds.has(id)) authentication.remove(id)
    if (configuration.value) {
      const local = operations.value.filter(operation => operation.apiId === 'local')
      authentication.register({ id: 'local', name: spec.value?.info?.title ?? 'Local API', document: spec.value,
        configuration: configuration.value, schemes: local[0]?.securitySchemes ?? spec.value?.components?.securitySchemes ?? {},
        origins: operationOrigins(local, configuration.value, configuration.value?.serverProfiles) })
    }
    for (const entry of connections.value) {
      const context = contexts.value.find(api => api.id === entry.id)
      const config = context?.configuration ?? { openApiUrl: entry.openApiUrl, endpointMappingsUrl: entry.endpointMappingsUrl,
        apiBaseUrl: entry.apiBaseUrl || new URL('/', entry.openApiUrl).href, overrideServer: Boolean(entry.apiBaseUrl) }
      const scoped = operations.value.filter(operation => operation.apiId === entry.id)
      authentication.register({ id: entry.id, name: entry.name, configuration: config, document: context?.document,
        schemes: scoped[0]?.securitySchemes ?? context?.document?.components?.securitySchemes ?? {}, origins: operationOrigins(scoped, config, configuration.value?.serverProfiles) })
    }
  })
}
