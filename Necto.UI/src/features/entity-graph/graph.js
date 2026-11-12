import { resolveMappingLinks } from '../related-endpoints/mappings.js'

const refPrefix = '#/components/schemas/'

function readEntityGraph(spec, operations) {
  const schemas = spec?.components?.schemas ?? {}
  const nodes = new Map()
  const edges = new Map()
  const decode = ref => {
    try { return decodeURIComponent(ref.slice(refPrefix.length)).replaceAll('~1', '/').replaceAll('~0', '~') }
    catch { return null }
  }
  const resolve = schema => schema?.$ref?.startsWith(refPrefix) ? schemas[decode(schema.$ref)] : undefined
  function objectSchema(schema, seen = new Set()) {
    if (!schema || seen.has(schema)) return false
    seen.add(schema)
    return Boolean(schema.properties || schema.type === 'object' ||
      (Array.isArray(schema.type) && schema.type.includes('object')) ||
      objectSchema(resolve(schema), seen) ||
      ['allOf', 'anyOf', 'oneOf'].some(key => schema[key]?.some(child => objectSchema(child, seen))))
  }
  function addNode(id, name, schema) {
    if (!nodes.has(id)) nodes.set(id, { id, name, schema, endpoints: new Map() })
    return id
  }
  for (const [name, schema] of Object.entries(schemas)) {
    if (objectSchema(schema)) addNode(`schema:${name}`, name, schema)
  }
  function references(schema, deep = false, found = new Set(), seen = new Set()) {
    if (!schema || typeof schema !== 'object' || seen.has(schema)) return found
    seen.add(schema)
    if (schema.$ref?.startsWith(refPrefix)) {
      const id = `schema:${decode(schema.$ref)}`
      if (nodes.has(id)) found.add(id)
      if (deep === true || !nodes.has(id)) references(resolve(schema), deep, found, seen)
    }
    if (schema.items) references(schema.items, deep, found, seen)
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      for (const child of schema[key] ?? []) references(child, deep, found, seen)
    }
    if (deep) {
      for (const child of Object.values(schema.properties ?? {})) references(child, true, found, seen)
      references(schema.additionalProperties, true, found, seen)
    }
    return found
  }
  function edge(from, to, kind, label, operationIds = []) {
    if (!nodes.has(from) || !nodes.has(to)) return
    const key = JSON.stringify([from, to, kind, label])
    const entry = edges.get(key) ?? { id: key, from, to, kind, label, operations: new Set() }
    for (const id of operationIds) entry.operations.add(id)
    edges.set(key, entry)
  }
  function properties(schema, seen = new Set()) {
    if (!schema || seen.has(schema)) return {}
    seen.add(schema)
    return Object.assign({}, properties(resolve(schema), seen),
      ...(schema.allOf ?? []).map(child => properties(child, seen)), schema.properties)
  }
  const roots = new Map()
  for (const operation of operations) {
    const responseRoots = new Set(), requestRoots = new Set()
    const sections = [
      ['request', operation.requestBody, requestRoots],
      ...operation.parameters.map(parameter => [`${parameter.in} ${parameter.name}`,
        { content: { parameter: { schema: parameter.schema } } }, requestRoots]),
      ...Object.entries(operation.responses ?? {}).filter(([status]) => /^2\d\d$/.test(status))
        .map(([status, response]) => [`response ${status}`, operation.resolve(response), responseRoots]),
    ]
    for (const [role, section, rootSet] of sections) {
      for (const [media, content] of Object.entries(section?.content ?? {})) {
        const schema = content.schema
        const direct = references(schema)
        let shape = schema
        while (shape?.type === 'array' && shape.items) shape = shape.items
        if (!direct.size && objectSchema(shape)) {
          direct.add(addNode(`inline:${operation.key}:${role}:${media}`, `${operation.name} · ${role}`, shape))
        }
        for (const id of direct) rootSet.add(id)
        const used = new Set([...direct, ...references(schema, true)])
        for (const id of used) {
          const node = nodes.get(id)
          const endpoint = node.endpoints.get(operation.key) ?? { operation, roles: new Set() }
          endpoint.roles.add(role)
          node.endpoints.set(operation.key, endpoint)
        }
      }
    }
    roots.set(operation.key, { response: responseRoots, request: requestRoots })
  }
  for (const node of nodes.values()) {
    for (const kind of ['allOf', 'anyOf', 'oneOf']) {
      for (const schema of node.schema[kind] ?? []) {
        for (const target of references(schema)) edge(node.id, target, 'schema', kind)
      }
    }
    for (const [property, schema] of Object.entries(properties(node.schema))) {
      for (const target of references(schema, 'inline')) edge(node.id, target, 'schema', property)
    }
  }
  function sourceOwners(rootIds, source) {
    const owners = new Set()
    let path = source.objectPath ?? []
    // Response roots already represent the items of a root array.
    if (source.eachItem && path[0] === null) path = path.slice(1)
    for (const root of rootIds) {
      let candidates = [{ schema: nodes.get(root).schema, owner: root }]
      for (const part of path) {
        candidates = candidates.flatMap(({ schema, owner }) => {
          const resolved = resolve(schema) ?? schema
          const child = part === null ? resolved?.items : properties(resolved)[part]
          if (!child) return []
          const named = [...references(child)]
          return [{ schema: child, owner: named[0] ?? owner }]
        })
      }
      for (const { schema, owner } of candidates) {
        if (source.property === null || Object.hasOwn(properties(schema), source.property)) owners.add(owner)
      }
    }
    return owners
  }
  return { roots, sourceOwners,
    nodes: [...nodes.values()].map(node => ({ ...node, endpoints: [...node.endpoints.values()]
      .map(endpoint => ({ ...endpoint, roles: [...endpoint.roles] })) })).sort((a, b) => a.name.localeCompare(b.name)),
    edges: [...edges.values()].map(entry => ({ ...entry, operations: [...entry.operations] })),
  }
}

export function buildEntityGraph(spec, operations, mappings = [], apis = []) {
  const contexts = [{ id: 'local', document: spec }, ...apis]
  const registries = new Map()
  const nodes = new Map(), edges = new Map()
  const scoped = (apiId, id) => apiId === 'local' ? id : JSON.stringify([apiId, id])
  for (const api of contexts) {
    const graph = readEntityGraph(api.document, operations.filter(operation => (operation.apiId ?? 'local') === api.id))
    registries.set(api.id, graph)
    for (const node of graph.nodes) {
      const id = scoped(api.id, node.id)
      nodes.set(id, { ...node, id, apiId: api.id,
        name: api.id === 'local' ? node.name : `${node.name} · ${api.name} [${api.id}]`,
        endpoints: new Map(node.endpoints.map(entry => [entry.operation.key, { ...entry, roles: new Set(entry.roles) }])) })
    }
    for (const edge of graph.edges) {
      const from = scoped(api.id, edge.from), to = scoped(api.id, edge.to)
      const id = JSON.stringify([from, to, edge.kind, edge.label])
      edges.set(id, { ...edge, id, from, to })
    }
  }
  for (const { from: producer, to: consumer, source, name } of resolveMappingLinks(operations, [{ apiId: 'local', mappings }])) {
    const sourceApi = producer.apiId ?? 'local', targetApi = consumer.apiId ?? 'local'
    const sourceGraph = registries.get(sourceApi), targetGraph = registries.get(targetApi)
    const sourceRoots = sourceGraph?.roots.get(producer.key), targetRoots = targetGraph?.roots.get(consumer.key)
    if (!sourceRoots || !targetRoots) continue
    const targets = targetRoots.response.size ? targetRoots.response : targetRoots.request
    for (const owner of sourceGraph.sourceOwners(sourceRoots.response, source)) {
      const from = scoped(sourceApi, owner)
      for (const target of targets) {
        const to = scoped(targetApi, target), label = `${source.property ?? 'value'} → ${name ?? 'body'}`
        const id = JSON.stringify([from, to, 'mapping', label])
        const entry = edges.get(id) ?? { id, from, to, kind: 'mapping', label, operations: [] }
        entry.operations = [...new Set([...entry.operations, producer.key, consumer.key])]
        edges.set(id, entry)
      }
      const node = nodes.get(from)
      const entry = node.endpoints.get(consumer.key) ?? { operation: consumer, roles: new Set() }
      entry.roles.add(`mapped input: ${name ?? 'body'}`)
      node.endpoints.set(consumer.key, entry)
    }
  }
  return { nodes: [...nodes.values()].map(node => ({ ...node, endpoints: [...node.endpoints.values()]
    .map(entry => ({ ...entry, roles: [...entry.roles] })) })).sort((a, b) => a.name.localeCompare(b.name)), edges: [...edges.values()] }
}

export function layoutGraph(nodes) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  return nodes.map((node, index) => ({ ...node, x: 45 + (index % columns) * 260, y: 45 + Math.floor(index / columns) * 135 }))
}
