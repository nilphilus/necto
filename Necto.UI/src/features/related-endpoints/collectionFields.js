import { applyChoice } from './mappings.js'
import { applyBodyPresets, contextKey, supportedParameters } from '../request-runner/request.js'
import { bodyContent, isJson } from '../workbench/body.js'
import { isPrefix } from '../payload-search/search.js'
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

function appendArrayFields(fields, operation, body, schema, sources, presetPaths) {
  const limit = fields.length + 100
  let remaining = 10000
  const byTarget = new Map()
  for (const source of sources) {
    if (!source.objectPath?.includes(null)) continue
    const key = JSON.stringify([source.objectPath, source.name])
    if (!byTarget.has(key)) byTarget.set(key, [])
    byTarget.get(key).push(source)
  }

  for (const group of byTarget.values()) {
    const { objectPath, name } = group[0]
    function visit(value, schemas, path) {
      if (--remaining < 0 || fields.length >= limit) return
      if (path.length === objectPath.length) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return
        const contracts = schemas.map(schema => bodyFieldContract(operation, schema))
        const propertySchemas = contracts.flatMap(contract => contract.properties.get(name) ?? [])
        if (!propertySchemas.length) return
        const bodyPath = [...path, name]
        if (presetPaths.some(preset => isPrefix(preset, bodyPath) || isPrefix(bodyPath, preset))) return
        const label = bodyPath.reduce((text, part) => typeof part === 'number' ? text + '[' + part + ']' :
          /^[a-zA-Z_$][\w$]*$/.test(part) ? text + (text ? '.' : '') + part : text + '[' + JSON.stringify(part) + ']', '')
        fields.push({
          ...field('body', label, group, !Object.hasOwn(value, name) || value[name] === '',
            contracts.some(contract => contract.required.has(name)), propertySchemas),
          key: JSON.stringify(['body', bodyPath]), bodyPath, mappingName: name, mappingPath: objectPath,
        })
        return
      }
      const segment = objectPath[path.length]
      if (segment === null && Array.isArray(value)) {
        const items = schemas.map(schema => operation.resolve(operation.resolve(schema)?.items)).filter(Boolean)
        if (!items.length) return
        for (let index = 0; index < value.length && remaining > 0 && fields.length < limit; index++) {
          visit(value[index], items, [...path, index])
        }
      } else if (segment !== null && value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, segment)) {
        const properties = schemas.flatMap(schema => bodyFieldContract(operation, schema).properties.get(segment) ?? [])
        if (properties.length) visit(value[segment], properties, [...path, segment])
      }
    }
    visit(body, [schema], [])
    if (fields.length >= limit || remaining <= 0) break
  }
}

export function collectionFields(operation, session, values, sourcesFor) {
  const usableSources = (location, name) => sourcesFor(operation, location, name).filter(source =>
    !requiresCollectedValue(source.operation, name ?? source.name))
  const fields = supportedParameters(operation).flatMap(parameter => {
    const key = contextKey(parameter)
    const sources = values.has(key) ? [] : usableSources(parameter.in, parameter.name)
    const value = session.fields[`${parameter.in}:${parameter.name}`]
    return sources.length ? [field(parameter.in, parameter.name, sources, value === undefined || value === '',
      parameter.required === true || parameter.in === 'path', [operation.resolve(parameter.schema)].filter(Boolean))] : []
  })
  const media = bodyContent(operation, session)
  if (!isJson(media?.[0] ?? '')) return fields
  const bodySources = usableSources('body').filter(source => typeof source.name === 'string')
  if (!bodySources.length) return fields
  let body
  try { body = JSON.parse(session.body.trim() || '{}') }
  catch { return fields }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fields

  const presetPaths = applyBodyPresets(operation, session.body, values, session.mediaType).sources.map(source => source.path)
  const supplied = new Set(presetPaths.filter(path => path.length === 1).map(path => path[0]))
  const byName = new Map()
  for (const source of bodySources) {
    if (source.objectPath || supplied.has(source.name)) continue
    if (!byName.has(source.name)) byName.set(source.name, [])
    byName.get(source.name).push(source)
  }
  const { required, properties } = bodyFieldContract(operation, media[1].schema)
  const bodySelected = operation.requestBody.required || Boolean(session.body.trim())
  for (const [name, sources] of byName)
    fields.push(field('body', name, sources, !Object.hasOwn(body, name) || body[name] === '', bodySelected && required.has(name), properties.get(name) ?? []))
  appendArrayFields(fields, operation, body, media[1].schema, bodySources, presetPaths)
  return fields
}

function requiresCollectedValue(operation, name) {
  if (!operation || typeof name !== 'string') return false
  const matches = input => input.toLowerCase() === name.toLowerCase()
  if (supportedParameters(operation).some(parameter =>
    (parameter.required || parameter.in === 'path') && matches(parameter.name))) return true
  if (!operation.requestBody?.required) return false
  const media = Object.entries(operation.requestBody.content ?? {})
    .filter(([type]) => isJson(type))
  return media.length > 0 && media.every(([, content]) => {
    const { required } = bodyFieldContract(operation, content.schema)
    return [...required].some(matches)
  })
}

export function applyCollectedValues(session, selections) {
  const draft = { fields: { ...session.fields }, body: session.body, bindings: [...(session.bindings ?? [])] }
  for (const selection of selections) {
    applyChoice(draft, selection.location, selection)
    rememberBinding(draft, selection.bodyPath ? { ...selection, name: selection.bodyPath[0] } : selection)
  }
  Object.assign(session, draft, { error: '', resultStale: Boolean(session.result) })
}
