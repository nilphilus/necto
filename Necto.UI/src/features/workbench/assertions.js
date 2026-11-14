import { jsonEqual } from './equality.js'
export const assertionKinds = {
  status: 'HTTP status',
  exists: 'Field exists',
  equals: 'Field equals',
  nonempty: 'Not empty',
  duration: 'Response time below (ms)'
}
export function pointerPath(pointer = '') {
  if (!pointer) return []
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer))
    throw new Error('Use a JSON Pointer, for example /lines/0/id.')
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
}
export function atPointer(value, pointer) {
  for (const part of pointerPath(pointer)) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part))
      return undefined
    value = value[part]
  }
  return value
}
export function validateAssertions(checks = []) {
  if (!Array.isArray(checks) || checks.length > 50)
    throw new Error('A request supports at most 50 checks.')
  for (const check of checks) {
    if (
      !Object.hasOwn(assertionKinds, check.kind) ||
      typeof (check.path ?? '') !== 'string'
    )
      throw new Error('Invalid request check.')
    pointerPath(check.path)
    if (
      ['status', 'duration'].includes(check.kind) &&
      (!Number.isFinite(Number(check.expected)) || Number(check.expected) < 0)
    )
      throw new Error('Enter a valid numeric expectation.')
    if (check.kind === 'equals') {
      try {
        JSON.parse(check.expected)
      } catch {
        throw new Error(
          'The expected value must be JSON, for example 42 or "PLN".'
        )
      }
    }
  }
}
export function evaluateAssertions(checks = [], result) {
  validateAssertions(checks)
  return checks.map((check) => {
    const actual =
      check.kind === 'status'
        ? result.status
        : check.kind === 'duration'
          ? result.elapsed
          : atPointer(result.json, check.path)
    const passed =
      check.kind === 'status'
        ? actual === Number(check.expected)
        : check.kind === 'duration'
          ? actual < Number(check.expected)
          : check.kind === 'exists'
            ? actual !== undefined
            : check.kind === 'nonempty'
              ? actual !== undefined &&
                actual !== null &&
                (typeof actual === 'string' || Array.isArray(actual)
                  ? actual.length > 0
                  : typeof actual === 'object'
                    ? Object.keys(actual).length > 0
                    : true)
              : jsonEqual(actual, JSON.parse(check.expected))
    return {
      ...check,
      passed,
      label: `${assertionKinds[check.kind]}${check.path ? ' ' + check.path : ''}`,
      actual:
        actual === undefined
          ? '(missing)'
          : JSON.stringify(actual)?.slice(0, 200)
    }
  })
}
