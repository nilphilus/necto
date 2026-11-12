import { readResponseAt } from './scenario.js'

const colors = ['#17664c', '#2854a0', '#984717', '#744296', '#a33558', '#087077', '#786113', '#4e5a91']

function previewValue(value) {
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value !== null && typeof value === 'object') return '{ … }'
  if (typeof value === 'string' && value.length > 240) return JSON.stringify(value.slice(0, 240)) + '…'
  return JSON.stringify(value)
}

export function traceSteps(steps) {
  const cards = steps.map(step => ({ step, request: step.request, inputs: [], outputs: [] }))
  const sources = new Map()
  for (const card of cards) {
    if (!card.request) continue
    for (const { sourceStep, path, location, name } of card.step.bindings) {
      const id = JSON.stringify([sourceStep, path])
      let source = sources.get(id)
      if (!source) {
        const origin = cards[sourceStep]
        const value = readResponseAt(origin.step.response.json, path)
        source = { id, path, value: previewValue(value), color: colors[sources.size % colors.length] }
        sources.set(id, source)
        origin.outputs.push(source)
      }
      const target = name === null ? location : `${location}: ${name}`
      card.inputs.push({ ...source, target })
    }
  }
  return cards
}
