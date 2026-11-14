import { pointerPath } from './assertions.js'
export function openApiMappingLinks(operations) {
  const links = []
  for (const from of operations)
    for (const [status, raw] of Object.entries(from.responses ?? {})) {
      const response = from.resolve(raw)
      for (const [linkName, rawLink] of Object.entries(response?.links ?? {})) {
        const link = from.resolve(rawLink)
        if (!link || link.server || Boolean(link.operationId) === Boolean(link.operationRef)) continue
        const matches = operations.filter(
          (operation) =>
            operation.apiId === from.apiId &&
            (link.operationId
              ? operation.id === link.operationId
              : link.operationRef ===
                '#/paths/' +
                  operation.path.replaceAll('~', '~0').replaceAll('/', '~1') +
                  '/' +
                  operation.method.toLowerCase())
        )
        if (matches.length !== 1) continue
        const to = matches[0]
        const entries = [
          ...Object.entries(link.parameters ?? {}).map(([name, value]) => ({
            name,
            value,
            location: 'parameter'
          })),
          ...(link.requestBody !== undefined
            ? [{ name: null, value: link.requestBody, location: 'body' }]
            : [])
        ]
        if (!entries.length) links.push({ from, to, navigationOnly: true,
          source: { responseStatus: status }, origin: 'openapi', linkName, description: link.description, match: 'OpenAPI Link' })
        for (const entry of entries) {
          const expression = typeof entry.value === 'string' && entry.value.startsWith('$response.body#')
          const constant = !expression && !(typeof entry.value === 'string' && (entry.value.startsWith('$') || entry.value.includes('{$')))
          if (!expression && !constant) continue
          let path = []
          if (expression) try { path = pointerPath(entry.value.slice('$response.body#'.length)) } catch { continue }
          let location = entry.location,
            name = entry.name
          if (location === 'parameter') {
            const qualified = name.match(/^(path|query|header)\.(.+)$/)
            const candidates = to.parameters.filter(
              (parameter) =>
                parameter.name === (qualified?.[2] ?? name) &&
                (!qualified || parameter.in === qualified[1])
            )
            if (candidates.length !== 1) continue
            if (!['path','query','header'].includes(candidates[0].in)) continue
            location = candidates[0].in
            name = candidates[0].name
          }
          if (location === 'body' && !to.requestBody) continue
          const property = path.pop() ?? null
          links.push({
            from,
            to,
            location,
            name,
            source: {
              operationId: from.id,
              objectPath: path.map((part) =>
                /^\d+$/.test(part) ? Number(part) : part
              ),
              property,
              responseStatus: status
            },
            ...(constant ? { constant: entry.value } : {}),
            origin: 'openapi',
            linkName,
            description: link.description,
            match: 'OpenAPI Link'
          })
        }
      }
    }
  return links
}
