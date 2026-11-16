import { pointerParts, readPointer } from './pointers.js'

export function expectedValue(condition) {
  if (typeof condition.value !== 'string' || condition.value.length > 16384) throw new Error('Expected values are limited to 16 KiB.')
  if (condition.valueType === 'text') return condition.value
  if (!['number', 'boolean', 'json'].includes(condition.valueType)) throw new Error('Choose an expected value type.')
  let value
  try { value = JSON.parse(condition.value) } catch { throw new Error('Enter a valid expected value for the selected type.') }
  if (condition.valueType === 'number' && (typeof value !== 'number' || !Number.isFinite(value)) || condition.valueType === 'boolean' && typeof value !== 'boolean') throw new Error('Expected value does not match the selected type.')
  const pending = [{ value, depth: 0 }]; let visited = 0
  while (pending.length) {
    const item = pending.pop()
    if (typeof item.value === 'number' && !Number.isFinite(item.value)) throw new Error('Expected JSON numbers must be finite.')
    if (++visited > 4096 || item.depth > 32) throw new Error('Expected JSON is too large or too deeply nested.')
    if (item.value && typeof item.value === 'object') for (const value of Object.values(item.value)) pending.push({ value, depth: item.depth + 1 })
  }
  return value
}
export function validateWaiting(step) {
  if (step.delayMs !== undefined && (!Number.isInteger(step.delayMs) || step.delayMs < 0 || step.delayMs > 600000)) throw new Error('Delay must be a whole number from 0 to 600000 ms.')
  if (step.waitFor !== undefined) {
    const condition = step.waitFor
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) throw new Error('Invalid response wait condition.')
    pointerParts(condition.pointer); expectedValue(condition)
    if (!Number.isInteger(condition.retryCount) || condition.retryCount < 0 || condition.retryCount > 100) throw new Error('Retry count must be a whole number from 0 to 100 (after the first request).')
    if (!Number.isInteger(condition.intervalMs) || condition.intervalMs < 100 || condition.intervalMs > 600000) throw new Error('Retry interval must be a whole number from 100 to 600000 ms.')
  }
}
function equalJson(actual, expected) {
  if (actual === expected) return true
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return false
  const keys = Object.keys(expected)
  if (Array.isArray(actual)) { if (actual.length !== expected.length) return false }
  else {
    let count = 0
    for (const key in actual) if (Object.hasOwn(actual, key) && ++count > keys.length) return false
    if (count !== keys.length) return false
  }
  return keys.every(key => Object.hasOwn(actual, key) && equalJson(actual[key], expected[key]))
}
export function waitMatches(response, condition) {
  if (response?.json === undefined) throw new Error('Wait for response value requires a JSON response.')
  // A missing field is not ready; it is distinct from an explicit JSON null.
  let actual
  try { actual = readPointer(response.json, condition.pointer) } catch { return false }
  return equalJson(actual, expectedValue(condition))
}
export function waitOptions(step) {
  return { ...(step.delayMs !== undefined ? { delayMs: step.delayMs } : {}), ...(step.waitFor ? { waitFor: {
    pointer: step.waitFor.pointer, valueType: step.waitFor.valueType, value: step.waitFor.value,
    retryCount: step.waitFor.retryCount, intervalMs: step.waitFor.intervalMs,
  } } : {}) }
}
export function abortableDelay(ms, signal) {
  signal.throwIfAborted()
  if (!ms) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', aborted); resolve() }
    const timer = setTimeout(done, ms)
    const aborted = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(signal.reason ?? new Error('Canceled.')) }
    signal.addEventListener('abort', aborted, { once: true })
  })
}
