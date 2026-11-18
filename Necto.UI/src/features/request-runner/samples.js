import { workspaceIdentity } from '../workbench/workspaceIdentity.js'
import { validateAssertions } from '../workbench/assertions.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { payloadSnapshot, validatePayloadSnapshot } from '../workbench/body.js'
import { initialBody } from './request.js'

export function applySample(operation, session, sample) {
  session.fields = { ...sample.fields }
  Object.assign(session, payloadSnapshot(sample), executionOptions(sample), {
    binaryFile: undefined,
    assertions: (sample.assertions ?? []).map((check) => ({ ...check })),
  })
  session.body = sample.body ?? initialBody(operation)
  session.bindings = []
  session.exampleKey = undefined
  session.sampleName = sample.name
}

export function readSamples(storage, key) {
  const raw = storage.getItem(key)
  if (raw === null) return { samples: [], defaultName: '' }
  const saved = JSON.parse(raw)
  if (!Array.isArray(saved?.samples)) throw new Error('Invalid saved samples.')
  return saved
}

export function validateSampleCollection(value) {
  if (!Array.isArray(value.samples) || typeof value.defaultName !== 'string')
    throw new Error('Invalid saved request collection.')
  for (const sample of value.samples) {
    if (
      typeof sample.name !== 'string' ||
      !sample.fields ||
      typeof sample.fields !== 'object' ||
      Array.isArray(sample.fields) ||
      Object.values(sample.fields).some((field) => typeof field !== 'string') ||
      (sample.body !== undefined && typeof sample.body !== 'string')
    )
      throw new Error('Invalid saved request.')
    executionOptions(sample)
    validatePayloadSnapshot(sample)
    validateAssertions(sample.assertions)
  }
}

export function createSampleDrafts({ createSession, getConfiguration, storage }) {
  function sampleStorageKey(operation) {
    return (
      'necto:request-samples:' +
      JSON.stringify([
        workspaceIdentity(operation.configuration ?? getConfiguration()),
        operation.key,
      ])
    )
  }

  function createDraft(operation) {
    const session = createSession(operation)
    try {
      const { samples, defaultName } = readSamples(storage, sampleStorageKey(operation))
      const sample = samples.find((item) => item.name === defaultName)
      if (sample) applySample(operation, session, sample)
    } catch {
      // The sample controls report storage errors when the operation is opened.
    }
    return session
  }

  return { sampleStorageKey, createDraft }
}
