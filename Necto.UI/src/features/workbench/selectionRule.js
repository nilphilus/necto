import { jsonEqual } from './equality.js'
import { atPointer, pointerPath } from './assertions.js'
export function validateSelectionRule(rule) {
  if (!rule) return
  if (
    !Array.isArray(rule.arrayPath) ||
    rule.arrayPath.length > 32 ||
    rule.arrayPath.some(
      (part) => typeof part !== 'string' && !Number.isSafeInteger(part)
    ) ||
    typeof rule.field !== 'string' ||
    typeof rule.expected !== 'string'
  )
    throw new Error('Invalid object selection rule.')
  pointerPath(rule.field)
  JSON.parse(rule.expected)
}
export function selectionRulePath(response, path, rule) {
  if (!rule) return path
  validateSelectionRule(rule)
  if (
    !rule.arrayPath.every((part, index) => part === path[index]) ||
    !Number.isInteger(path[rule.arrayPath.length])
  )
    throw new Error(
      'Selection rule must replace an array index in its response binding.'
    )
  let collection = response
  for (const part of rule.arrayPath) collection = collection?.[part]
  if (!Array.isArray(collection))
    throw new Error('Selection rule source is not an array.')
  const expected = JSON.parse(rule.expected),
    matches = []
  for (let index = 0; index < collection.length; index++)
    if (jsonEqual(atPointer(collection[index], rule.field), expected))
      matches.push(index)
  if (matches.length !== 1)
    throw new Error(
      `Object selection rule matched ${matches.length} items; exactly one is required.`
    )
  return [
    ...rule.arrayPath,
    matches[0],
    ...path.slice(rule.arrayPath.length + 1)
  ]
}
