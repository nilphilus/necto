export function responseSelector(source) {
  const path = source.objectPath ?? (source.eachItem ? [null] : [])
  const parts = source.property === null ? path : [...path, source.property]
  return '$' + parts.map(part => part === null ? '[*]' : `[${JSON.stringify(part)}]`).join('')
}

export function buildEndpointGraph(operations, mappings = []) {
  const nodes = operations.map(operation => ({ id: operation.key, operation, incoming: 0, outgoing: 0 }))
  const byKey = new Map(nodes.map(node => [node.id, node]))
  const byOperationId = new Map()
  for (const operation of operations) {
    if (operation.id) byOperationId.set(operation.id, byOperationId.has(operation.id) ? null : operation)
  }
  const pairs = new Map()
  for (const mapping of mappings) {
    const { source, target } = mapping
    const from = byOperationId.get(source?.operationId), to = byOperationId.get(target?.operationId)
    if (!from || !to || (source.property !== null && typeof source.property !== 'string')) continue
    let location = target.location
    if (location === 'parameter') {
      location = to.parameters.find(parameter => parameter.name === target.name &&
        ['path', 'query', 'header'].includes(parameter.in))?.in
    }
    if (location === 'body' ? !to.requestBody : !['path', 'query', 'header'].includes(location) ||
      !to.parameters.some(parameter => parameter.in === location && parameter.name === target.name)) continue
    const id = JSON.stringify([from.key, to.key])
    const edge = pairs.get(id) ?? { id, from: from.key, to: to.key, values: new Map() }
    const value = { selector: responseSelector(source), location, name: target.name,
      match: mapping.match ?? 'explicit', source }
    edge.values.set(JSON.stringify([value.selector, location, value.name]), value)
    pairs.set(id, edge)
  }
  const edges = [...pairs.values()].map(edge => ({ ...edge, values: [...edge.values.values()] }))
  for (const edge of edges) {
    byKey.get(edge.from).outgoing++
    byKey.get(edge.to).incoming++
  }
  return { nodes, edges }
}

export function layoutEndpoints(nodes) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  return nodes.map((node, index) => ({ ...node, x: 40 + (index % columns) * 315, y: 40 + Math.floor(index / columns) * 175 }))
}
