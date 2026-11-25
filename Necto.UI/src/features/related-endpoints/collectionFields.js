import { applyChoice } from './mappings.js'
import { applyBodyPresets, contextKey, supportedParameters } from '../request-runner/request.js'
import { bodyContent, isJson } from '../workbench/body.js'
import { rememberBinding } from '../scenarios/scenario.js'

const field = (location, name, sources, missing) => ({
  key: JSON.stringify([location, name]), location, name, sources, missing,
})

export function collectionFields(operation, session, values, sourcesFor) {
  const fields = supportedParameters(operation).flatMap(parameter => {
    const key = contextKey(parameter)
    const sources = values.has(key) ? [] : sourcesFor(operation, parameter.in, parameter.name)
    const value = session.fields[`${parameter.in}:${parameter.name}`]
    return sources.length ? [field(parameter.in, parameter.name, sources, value === undefined || value === '')] : []
  })
  if (!isJson(bodyContent(operation, session)?.[0] ?? '')) return fields
  const bodySources = sourcesFor(operation, 'body').filter(source => typeof source.name === 'string')
  if (!bodySources.length) return fields
  let body
  try { body = JSON.parse(session.body.trim() || '{}') }
  catch { return fields }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fields

  const supplied = new Set(applyBodyPresets(operation, session.body, values).sources
    .filter(source => source.path.length === 1).map(source => source.path[0]))
  const byName = new Map()
  for (const source of bodySources) {
    if (supplied.has(source.name)) continue
    if (!byName.has(source.name)) byName.set(source.name, [])
    byName.get(source.name).push(source)
  }
  for (const [name, sources] of byName)
    fields.push(field('body', name, sources, !Object.hasOwn(body, name) || body[name] === ''))
  return fields
}

export function applyCollectedValues(session, selections) {
  const draft = { fields: { ...session.fields }, body: session.body, bindings: [...(session.bindings ?? [])] }
  for (const selection of selections) {
    applyChoice(draft, selection.location, selection)
    rememberBinding(draft, selection)
  }
  Object.assign(session, draft, { error: '', resultStale: Boolean(session.result) })
}
