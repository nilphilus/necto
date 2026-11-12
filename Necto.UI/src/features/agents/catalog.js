// Export API metadata only. Never serialize drafts, presets, response history or scenario data.
export function agentCatalog(spec, configuration, operations, mappings, external = []) {
  const apis = [{ id: 'local', name: spec.info?.title ?? 'Local API', document: spec, configuration }, ...external]
  return { apis: apis.map(api => ({
    id: api.id, name: api.name, document: api.document,
    mappings: mappings.filter(mapping => mapping.source.apiId === api.id),
    operations: operations.filter(operation => operation.apiId === api.id).map(operation => {
      const config = operation.configuration ?? configuration
      let baseUrl = null, urlError = null
      try {
        const server = config.overrideServer ? null : operation.server
        const url = server?.url.replace(/\{([^}]+)\}/g, (_, name) => {
          if (server.variables?.[name]?.default === undefined) throw new Error(`Missing server variable: ${name}`)
          return server.variables[name].default
        })
        const resolved = new URL(url || config.apiBaseUrl || '/', config.openApiUrl)
        if (!['http:', 'https:'].includes(resolved.protocol) || resolved.username || resolved.password) throw new Error('Expected an HTTP(S) API URL without credentials')
        baseUrl = resolved.href
      } catch (error) { urlError = error.message }
      const pathItem = operation.resolve?.(api.document.paths?.[operation.path]) ?? api.document.paths?.[operation.path]
      return { key: operation.key, apiId: api.id, operationId: operation.id, method: operation.method,
        path: operation.path, name: operation.name, description: operation.description,
        baseUrl, urlError, parameters: operation.parameters, requestBody: operation.requestBody,
        responses: operation.responses, definition: pathItem?.[operation.method.toLowerCase()] }
    }),
  })) }
}
