export function layoutConnections(nodes, edges, { width, height }, focusId = '') {
  const columnStep = width + 100
  const rowStep = height + 36
  const neighbors = new Map(nodes.map(node => [node.id, new Set()]))
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const { from, to } of edges) {
    if (from === to || !neighbors.has(from) || !neighbors.has(to)) continue
    neighbors.get(from).add(to)
    neighbors.get(to).add(from)
  }
  const roots = nodes.filter(node => neighbors.get(node.id).size)
    .sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId) ||
      neighbors.get(b.id).size - neighbors.get(a.id).size)
  const visited = new Set()
  const positions = []
  let top = 44
  for (const root of roots) {
    if (visited.has(root.id)) continue
    visited.add(root.id)
    const layers = [[root.id]]
    for (let depth = 0; depth < layers.length; depth++) {
      const next = []
      for (const id of layers[depth]) {
        for (const neighbor of neighbors.get(id)) {
          if (visited.has(neighbor)) continue
          visited.add(neighbor)
          next.push(neighbor)
        }
      }
      if (next.length) {
        const previousRows = new Map(layers[depth].map((id, row) => [id, row]))
        const centers = new Map(next.map(id => {
          const rows = [...neighbors.get(id)].filter(parent => previousRows.has(parent)).map(parent => previousRows.get(parent))
          return [id, rows.reduce((sum, row) => sum + row, 0) / rows.length]
        }))
        layers.push(next.sort((a, b) => centers.get(a) - centers.get(b)))
      }
    }
    const rows = Math.max(...layers.map(layer => layer.length))
    layers.forEach((layer, column) => {
      const offset = Math.min(2, (rows - layer.length) / 2)
      layer.forEach((id, row) => positions.push({ ...byId.get(id),
        x: 36 + column * columnStep, y: top + (row + offset) * rowStep }))
    })
    top += rows * rowStep + 32
  }
  const isolated = nodes.filter(node => !visited.has(node.id))
  const columns = Math.min(3, Math.ceil(Math.sqrt(isolated.length)))
  isolated.forEach((node, index) => positions.push({ ...node,
    x: 36 + (index % columns) * columnStep, y: top + Math.floor(index / columns) * rowStep }))
  return positions
}

export function routeConnection(from, to, { width, height }, lane) {
  const y1 = from.y + height / 2 + lane
  const y2 = to.y + height / 2 + lane
  if (from.id === to.id) {
    const x = from.x + width
    const reach = lane > 0 ? 76 : 48
    return `M ${x} ${y1 - 12} C ${x + reach} ${y1 - 26}, ${x + reach} ${y1 + 26}, ${x} ${y1 + 12}`
  }
  const leftToRight = from.x < to.x
  const sameColumn = from.x === to.x
  const x1 = from.x + (leftToRight || sameColumn ? width : 0)
  const x2 = to.x + (leftToRight ? 0 : width)
  const bend = sameColumn ? x1 + 46 + lane : (x1 + x2) / 2
  return sameColumn
    ? `M ${x1} ${y1} H ${bend} V ${y2} H ${x2}`
    : `M ${x1} ${y1} C ${bend} ${y1}, ${bend} ${y2}, ${x2} ${y2}`
}
