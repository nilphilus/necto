import { executionOptions } from '../workbench/executionOptions.js'
import { payloadSnapshot, formFields } from '../workbench/body.js'
import { initialBody } from './request.js'

export function applySample(operation, session, sample) {
  session.fields = { ...sample.fields }
  Object.assign(session, payloadSnapshot(sample), executionOptions(sample), { binaryFile: undefined, assertions: (sample.assertions ?? []).map(check => ({ ...check })) })
  session.body = sample.body ?? initialBody(operation)
  session.bindings = []
  session.sampleName = sample.name
}

export function readSamples(storage, key) {
  const raw = storage.getItem(key)
  if (raw === null) return { samples: [], defaultName: '' }
  const saved = JSON.parse(raw)
  if (!Array.isArray(saved?.samples)) throw new Error('Invalid saved samples.')
  return saved
}
