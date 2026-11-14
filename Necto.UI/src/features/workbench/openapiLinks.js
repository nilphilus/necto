import { pointerPath } from './assertions.js'
export function openApiMappingLinks(operations) {
  const links = []
  for (const from of operations)
    for (const [status, raw] of Object.entries(from.responses ?? {})) {
      const response = from.resolve(raw)
      for (const rawLink of Object.values(response?.links ?? {})) {
        const link = from.resolve(rawLink)
        if (!link) continue
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
        for (const entry of entries) {
          if (
            typeof entry.value !== 'string' ||
            !entry.value.startsWith('$response.body#')
          )
            continue
          let path
          try {
            path = pointerPath(entry.value.slice('$response.body#'.length))
          } catch {
            continue
          }
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
            location = candidates[0].in
            name = candidates[0].name
          }
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
            match: 'OpenAPI Link'
          })
        }
      }
    }
  return links
}
