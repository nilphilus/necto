import { resolveMappingLinks } from '../related-endpoints/mappings.js'

export function responseSelector(source) {
  const path = source.objectPath ?? (source.eachItem ? [null] : [])
  const parts = source.property === null ? path : [...path, source.property]
  return '$' + parts.map(part => part === null ? '[*]' : `[${JSON.stringify(part)}]`).join('')
}

export function buildEndpointGraph(operations, mappings = []) {
  const nodes = operations.map(operation => ({ id: operation.key, operation, incoming: 0, outgoing: 0 }))
  const byKey = new Map(nodes.map(node => [node.id, node]))
  const pairs = new Map()
  for (const { from, to, source, location, name, match } of resolveMappingLinks(operations, [{ apiId: 'local', mappings }])) {
    const id = JSON.stringify([from.key, to.key])
    const edge = pairs.get(id) ?? { id, from: from.key, to: to.key, values: new Map() }
    const value = { selector: responseSelector(source), location, name, match, source }
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
