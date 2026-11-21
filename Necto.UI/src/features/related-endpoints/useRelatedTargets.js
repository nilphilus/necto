import { computed } from 'vue'
import { contextKey, presetInputs, supportedParameters } from '../request-runner/request.js'
import { createRelatedDrafts } from './drafts.js'

export function useRelatedTargets(current, { targetsFor, sourcesFor, createDraft, valuesFor }) {
  const draftFor = createRelatedDrafts()

  return computed(() => {
    const { operation, session } = current.value ?? {}
    const result = session?.result
    if (!result) return []

    const selected = result.selectedPath
      ? targetsFor(operation, result) : []
    const selectedByTarget = new Map(selected.map(target => [target.operation.key, target.candidates]))

    return targetsFor(operation, { ...result, selectedPath: undefined }).map(target => {
      const destination = target.operation
      const values = valuesFor(destination)
      const sourceParameters = supportedParameters(destination).filter(parameter =>
        (parameter.required || parameter.in === 'path') &&
        !values.has(contextKey(parameter)) &&
        sourcesFor(destination, parameter.in, parameter.name).length > 0
      )
      const candidates = target.candidates.filter(choice =>
        choice.location === 'body' ||
        !values.has(contextKey({ in: choice.location, name: choice.name }))
      )

      return {
        ...target,
        drafts: draftFor(result, destination.key),
        presetInputs: presetInputs(destination, createDraft(destination).body, values),
        sourceParameters,
        selectedCandidates: selectedByTarget.get(destination.key) ?? [],
        candidates,
      }
    }).sort((a, b) =>
      Number(b.preferred) - Number(a.preferred) ||
      Number(Boolean(a.operation.deprecated)) - Number(Boolean(b.operation.deprecated)))
  })
}
