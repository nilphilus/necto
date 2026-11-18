import { FILE_LIMIT, parseShared } from '../scenario-folder/format.js'
import { newId, parseBlueprint } from './model.js'

export async function parseBuilderImport(file) {
  if (file.size > FILE_LIMIT) throw new Error('Scenario Builder imports are limited to 2 MiB.')
  const text = await file.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON in scenario file.')
  }
  if (json?.format === 'necto-shared-scenario') {
    const { kind, scenario } = parseShared(text)
    if (kind !== 'builder') {
      throw new Error('Import this quick scenario from Settings → Workspace → Import team scenario file.')
    }
    return { ...scenario, id: newId() }
  }
  return { ...parseBlueprint(text), id: newId() }
}
