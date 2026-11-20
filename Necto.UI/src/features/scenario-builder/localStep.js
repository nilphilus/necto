export function isLocalStep(step) {
  return step?.method === 'LOCAL' && step.operationKey === ''
}

export const localOperation = {
  key: '',
  apiId: 'local',
  method: 'LOCAL',
  path: '',
  name: 'Local step',
  parameters: [],
  requestBody: { content: { 'application/json': {} } },
  resolve: value => value,
}

export function localStepInput(source, stepId = '') {
  const target = { location: 'body', pointer: '', source }
  return source === 'random'
    ? { ...target, stepId, responsePointer: '', itemPointer: '' }
    : { ...target, expression: 'return null;', bindings: [] }
}
