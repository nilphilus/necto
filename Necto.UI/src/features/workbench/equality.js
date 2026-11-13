export function jsonEqual(left, right) {
  const stack = [[left, right]]
  let budget = 100000
  while (stack.length) {
    if (--budget < 0) return false
    const [a, b] = stack.pop()
    if (Object.is(a, b)) continue
    if (
      !a ||
      !b ||
      typeof a !== 'object' ||
      typeof b !== 'object' ||
      Array.isArray(a) !== Array.isArray(b)
    )
      return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false
      stack.push([a[key], b[key]])
    }
  }
  return true
}
