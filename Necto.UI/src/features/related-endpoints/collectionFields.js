import { applyChoice } from './mappings.js'
import { applyBodyPresets, contextKey, supportedParameters } from '../request-runner/request.js'
import { bodyContent, isJson } from '../workbench/body.js'
import { rememberBinding } from '../scenarios/scenario.js'

const field = (location, name, sources, missing, required, schemas) => ({
  key: JSON.stringify([location, name]), location, name, sources, missing, required, schemas,
})

function bodyFieldContract(operation, schema) {
  const required = new Set(), seen = new Set(), pending = [schema]
  const properties = new Map()
  while (pending.length) {
    const current = operation.resolve(pending.pop())
    if (!current || seen.has(current)) continue
    seen.add(current)
    if (Array.isArray(current.required)) for (const name of current.required) required.add(name)
    for (const [name, property] of Object.entries(current.properties ?? {})) {
      const resolved = operation.resolve(property)
      if (!resolved) continue
      if (!properties.has(name)) properties.set(name, [])
      properties.get(name).push(resolved)
    }
    if (Array.isArray(current.allOf)) for (const part of current.allOf) pending.push(part)
  }
  return { required, properties }
}

export function collectionFields(operation, session, values, sourcesFor) {
  const fields = supportedParameters(operation).flatMap(parameter => {
    const key = contextKey(parameter)
    const sources = values.has(key) ? [] : sourcesFor(operation, parameter.in, parameter.name)
    const value = session.fields[`${parameter.in}:${parameter.name}`]
    return sources.length ? [field(parameter.in, parameter.name, sources, value === undefined || value === '',
      parameter.required === true || parameter.in === 'path', [operation.resolve(parameter.schema)].filter(Boolean))] : []
  })
  const media = bodyContent(operation, session)
  if (!isJson(media?.[0] ?? '')) return fields
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
  const { required, properties } = bodyFieldContract(operation, media[1].schema)
  const bodySelected = operation.requestBody.required || Boolean(session.body.trim())
  for (const [name, sources] of byName)
    fields.push(field('body', name, sources, !Object.hasOwn(body, name) || body[name] === '', bodySelected && required.has(name), properties.get(name) ?? []))
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
