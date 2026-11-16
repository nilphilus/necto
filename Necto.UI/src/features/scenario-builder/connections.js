import { variableProducer } from './variables.js'
import { waitOptions } from './waiting.js'
export const connectionKey = (from, to) => JSON.stringify([from, to])
export const hasTiming = edge => edge.delayMs !== undefined || edge.waitFor !== undefined
export function allConnections(blueprint) {
  const edges = new Map()
  const add = edge => edges.set(connectionKey(edge.from, edge.to), edge)
  if (blueprint.version >= 3) for (const edge of blueprint.connections ?? []) add(edge)
  else for (const step of blueprint.steps) for (const from of step.dependsOn) add({ from, to: step.id })
  for (const step of blueprint.steps) for (const input of step.inputs) {
    const from = variableProducer(input, blueprint)
    if (!from) continue
    const key = connectionKey(from, step.id)
    if (!edges.has(key)) add({ from, to: step.id })
  }
  for (const step of blueprint.steps) if (![...edges.values()].some(edge => edge.to === step.id)) add({ from: null, to: step.id })
  return [...edges.values()]
}
export function upgradeBlueprint(source) {
  const connections = allConnections(source).filter(edge => edge.from !== null || hasTiming(edge)).map(edge => ({ from: edge.from, to: edge.to, ...waitOptions(edge) }))
  if (source.version < 3) for (const step of source.steps) if (hasTiming(step)) {
    let edge = connections.find(edge => edge.to === step.id)
    if (!edge) { edge = { from: null, to: step.id }; connections.push(edge) }
    Object.assign(edge, waitOptions(step))
  }
  const steps = source.steps.map(step => {
    const { delayMs, waitFor, ...rest } = step
    return { ...rest, dependsOn: [], inputs: step.inputs.map(input => ({ ...input })) }
  })
  return { ...source, version: 5, variables: (source.variables ?? []).map(variable => ({ ...variable })), steps, connections }
}
export function connectionSummary(edge, steps) {
  return `${steps.find(step => step.id === edge.from)?.label ?? 'Start'} → ${steps.find(step => step.id === edge.to)?.label ?? 'Missing step'}`
}
