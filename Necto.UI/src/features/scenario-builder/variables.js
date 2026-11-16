import { expectedValue } from './waiting.js'
import { pointerParts } from './pointers.js'
import { validateGenerator } from './generation.js'
export const variableProducer = (input, blueprint) => input.source === 'response' ? input.stepId : input.source === 'variable' ? blueprint.variables?.find(variable => variable.id === input.variableId && variable.source === 'response')?.stepId : undefined
export const staticVariableValue = variable => expectedValue(variable)
export function validateVariables(blueprint) {
  const variables = blueprint.variables ?? []
  if (!Array.isArray(variables) || variables.length > 100 || blueprint.version < 4 && variables.length) throw new Error('Shared variables require version 4 (maximum 100).')
  const ids = new Set(), names = new Set(), stepIds = new Set(blueprint.steps.map(step => step.id))
  for (const variable of variables) {
    if (!variable || typeof variable.id !== 'string' || !variable.id || ids.has(variable.id) || typeof variable.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(variable.name) || names.has(variable.name.toLowerCase()) || !['static','generate','human','response'].includes(variable.source)) throw new Error('Variables need unique IDs and names (letters, digits and underscore; start with a letter or underscore).')
    ids.add(variable.id); names.add(variable.name.toLowerCase())
    if (variable.source === 'static') staticVariableValue(variable)
    if (variable.source === 'generate') validateGenerator(variable)
    if (variable.source === 'human' && (typeof variable.prompt !== 'string' || !variable.prompt.trim() || !['text','number','boolean','json'].includes(variable.valueType))) throw new Error(`Enter a question and type for ${variable.name}.`)
    if (variable.source === 'response') { if (!stepIds.has(variable.stepId)) throw new Error(`Choose an existing source step for ${variable.name}.`); pointerParts(variable.responsePointer) }
  }
  for (const step of blueprint.steps) for (const input of step.inputs ?? []) if (input.source === 'variable' && !ids.has(input.variableId)) throw new Error(`Unknown shared variable in ${step.label}.`)
}
export function variableSnapshot(variable) {
  return { id: variable.id, name: variable.name, source: variable.source,
    ...(variable.source === 'static' ? { valueType: variable.valueType, value: variable.value } : variable.source === 'human' ? { valueType: variable.valueType, prompt: variable.prompt } : variable.source === 'generate' ? { generator: variable.generator, ...(variable.generator === 'regex' ? { pattern: variable.pattern } : {}) } : { stepId: variable.stepId, responsePointer: variable.responsePointer }) }
}
