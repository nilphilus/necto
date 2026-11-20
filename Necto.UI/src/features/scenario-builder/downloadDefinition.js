import { savedBlueprint } from './definition.js'

export function downloadBuilderDefinition(scenario) {
  const text = JSON.stringify(savedBlueprint(scenario), null, 2)
  if (new Blob([text]).size > 2 * 1024 * 1024) throw new Error('Builder exports are limited to 2 MB.')
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'necto-scenario-builder.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
