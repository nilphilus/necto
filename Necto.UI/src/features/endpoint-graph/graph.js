import { resolveMappingLinks } from '../related-endpoints/mappings.js'
import { layoutConnections } from '../graph-layout.js'

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

export const endpointSize = { width: 265, height: 110 }

export function layoutEndpoints(nodes, edges = [], focusId = '') {
  const focus = nodes.find(node => node.id === focusId)
  if (!focus) return layoutConnections(nodes, edges, endpointSize)

  const producers = new Set(edges.filter(edge => edge.to === focusId).map(edge => edge.from))
  const consumers = new Set(edges.filter(edge => edge.from === focusId).map(edge => edge.to))
  const peers = nodes.filter(node => node.id !== focusId)
  const columns = [
    peers.filter(node => producers.has(node.id) && !consumers.has(node.id)),
    [focus],
    peers.filter(node => consumers.has(node.id)),
  ].filter(column => column.length)
  const rows = Math.max(...columns.map(column => column.length))
  return columns.flatMap((column, index) => {
    const offset = Math.min(2, (rows - column.length) / 2)
    return column.map((node, row) => ({ ...node,
      x: 36 + index * (endpointSize.width + 100),
      y: 44 + (row + offset) * (endpointSize.height + 36),
    }))
  })
}
