// This is an AST interpreter, never JavaScript execution in the host realm.
// Adding syntax or operators expands the security boundary: keep the whitelist small.
import { parse } from 'acorn'
export const EXPRESSION_LIMITS = Object.freeze({
  source: 4096,
  astNodes: 512,
  depth: 32,
  bindings: 16,
  instructions: 2500,
  inputBytes: 1024 * 1024,
  outputBytes: 65536,
  values: 10000,
})
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const identifier = (name) =>
  typeof name === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(name) && !forbidden.has(name)
const binary = new Set(['+', '-', '*', '/', '%', '===', '!==', '<', '<=', '>', '>='])
const nodes = new Set([
  'Program',
  'BlockStatement',
  'ReturnStatement',
  'IfStatement',
  'SwitchStatement',
  'SwitchCase',
  'BreakStatement',
  'EmptyStatement',
  'VariableDeclaration',
  'VariableDeclarator',
  'Identifier',
  'Literal',
  'MemberExpression',
  'ObjectExpression',
  'Property',
  'ArrayExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'BinaryExpression',
  'UnaryExpression',
])
class ExpressionError extends Error {
  constructor(code, message, path) {
    super(`Expression failed: ${message}`)
    this.code = code
    this.path = path
  }
}
const syntax = () => { throw new ExpressionError('syntax', 'invalid or unsupported syntax.') }
const limit = () => { throw new ExpressionError('limit', 'execution or size limit exceeded.') }
const invalid = () => { throw new ExpressionError('runtime', 'invalid operation or non-JSON value.') }
const invalidBindings = () => { throw new ExpressionError('binding', 'invalid inputs. Check that each binding has a unique name and a valid source.') }

const missingValues = new WeakMap()
function missingValue(path) {
  const marker = Object.create(null)
  missingValues.set(marker, path)
  return marker
}
const unwrap = (value) => missingValues.has(value) ? undefined : value

function requireValue(value) {
  if (missingValues.has(value)) {
    const path = missingValues.get(value)
    throw new ExpressionError('missing', `missing value at ${path} (undefined).`, path)
  }
  return value
}

function memberPath(node) {
  if (node.type === 'Identifier') return node.name
  if (node.type !== 'MemberExpression') return '(value)'
  const parent = memberPath(node.object)
  if (!node.computed) return `${parent}.${node.property.name}`
  if (node.property.type === 'Literal') {
    const key = node.property.value
    if (identifier(key)) return `${parent}.${key}`
    if (Number.isSafeInteger(key) && key >= 0) return `${parent}[${key}]`
  }
  return `${parent}[computed]`
}

export function expressionContext(step, input) {
  const target = input.location === 'body' ? input.pointer || '(whole body)' : input.name
  return `Step "${step.id}", ${input.location}: ${target}`
}
function validateNodeSyntax(node) {
  switch (node.type) {
    case 'Identifier':
      if (!identifier(node.name)) syntax()
      break
    case 'Literal':
      if (node.regex || node.bigint !== undefined) syntax()
      if (typeof node.value === 'number' && !Number.isFinite(node.value)) syntax()
      break
    case 'VariableDeclaration':
      if (node.kind !== 'const') syntax()
      break
    case 'VariableDeclarator':
      if (node.id.type !== 'Identifier' || !node.init) syntax()
      break
    case 'MemberExpression':
      if (node.optional) syntax()
      break
    case 'Property':
      if (node.kind !== 'init' || node.method || node.computed) syntax()
      break
    case 'BinaryExpression':
      if (!binary.has(node.operator)) syntax()
      break
    case 'UnaryExpression':
      if (!['!', '-', '+'].includes(node.operator)) syntax()
      break
    case 'LogicalExpression':
      if (!['&&', '||', '??'].includes(node.operator)) syntax()
      break
    case 'BreakStatement':
      if (node.label) syntax()
      break
    case 'ArrayExpression':
      if (node.elements.some((element) => !element)) syntax()
      break
  }
}
export function parseExpression(code) {
  if (typeof code !== 'string' || !code.trim()) syntax()
  if (code.length > EXPRESSION_LIMITS.source) limit()
  let ast
  try {
    ast = parse(code, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true })
  } catch (cause) {
    if (cause instanceof RangeError) limit()
    syntax()
  }
  const stack = [{ node: ast, depth: 0 }]
  let count = 0
  while (stack.length) {
    const { node, depth } = stack.pop()
    if (++count > EXPRESSION_LIMITS.astNodes || depth > EXPRESSION_LIMITS.depth) limit()
    if (!nodes.has(node.type)) syntax()
    validateNodeSyntax(node)
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) stack.push({ node: child, depth: depth + 1 })
      } else if (value?.type) stack.push({ node: value, depth: depth + 1 })
    }
  }
  return ast
}
export function validateExpression(input) {
  parseExpression(input.expression)
  if (!Array.isArray(input.bindings)) invalidBindings()
  if (input.bindings.length > EXPRESSION_LIMITS.bindings) limit()
  const names = new Set()
  for (const binding of input.bindings) {
    if (
      !binding ||
      !identifier(binding.name) ||
      names.has(binding.name) ||
      !['response', 'variable'].includes(binding.source)
    )
      invalidBindings()
    names.add(binding.name)
    if (binding.source === 'variable') {
      if (typeof binding.variableId !== 'string' || !binding.variableId) invalidBindings()
    } else if (
      typeof binding.stepId !== 'string' ||
      !binding.stepId ||
      typeof binding.responsePointer !== 'string' ||
      binding.responsePointer.length > 2048 ||
      (binding.responsePointer !== '' &&
        (!binding.responsePointer.startsWith('/') || /~(?![01])/u.test(binding.responsePointer)))
    )
      invalidBindings()
  }
}
export const expressionSnapshot = (input) => ({
  expression: input.expression,
  bindings: input.bindings.map((binding) => ({
    name: binding.name,
    source: binding.source,
    ...(binding.source === 'variable'
      ? { variableId: binding.variableId }
      : { stepId: binding.stepId, responsePointer: binding.responsePointer }),
  })),
})

// Copy only plain JSON data using descriptors: no getters, prototypes or host objects.
function jsonCopy(value, budget, depth = 0) {
  requireValue(value)
  if (++budget.nodes > EXPRESSION_LIMITS.values || depth > EXPRESSION_LIMITS.depth) limit()
  const spend = (amount) => {
    budget.bytes += amount
    if (budget.bytes > budget.max) limit()
  }
  if (value === null) {
    spend(4)
    return null
  }
  if (typeof value === 'string') {
    spend(value.length * 3 + 2)
    return value
  }
  if (typeof value === 'boolean') {
    spend(5)
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid()
    spend(24)
    return value
  }
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(value))
  )
    invalid()
  const array = Array.isArray(value),
    out = array ? [] : Object.create(null),
    keys = []
  if (array && value.length > EXPRESSION_LIMITS.values - budget.nodes) limit()
  for (const key in value)
    if (Object.hasOwn(value, key)) {
      if (keys.length >= EXPRESSION_LIMITS.values - budget.nodes) limit()
      keys.push(key)
    }
  if (array && value.length !== keys.length) invalid()
  spend(2)
  for (const key of keys) {
    if (forbidden.has(key)) invalid()
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid()
    spend(key.length * 3 + 4)
    Object.defineProperty(out, key, {
      value: jsonCopy(descriptor.value, budget, depth + 1),
      enumerable: true,
      writable: false,
      configurable: false,
    })
  }
  return out
}
const budget = (max) => ({ nodes: 0, bytes: 0, max })
export function evaluateExpression(code, values) {
  try {
    const ast = parseExpression(code),
      input = jsonCopy(values, budget(EXPRESSION_LIMITS.inputBytes))
    const root = new Map(Object.entries(input))
    let remaining = EXPRESSION_LIMITS.instructions
    const tick = () => {
      if (--remaining < 0) limit()
    }
    const bounded = (value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) invalid()
      if (typeof value === 'string' && value.length > EXPRESSION_LIMITS.outputBytes) limit()
      return value
    }
    const scalar = (value) => {
      if (value !== null && !['string', 'boolean', 'number', 'undefined'].includes(typeof value))
        invalid()
      return value
    }
    function expr(node, scope) {
      tick()
      switch (node.type) {
        case 'Literal':
          return bounded(node.value)
        case 'Identifier':
          if (!scope.has(node.name))
            throw new ExpressionError('runtime', `unknown input or variable "${node.name}".`)
          return scope.get(node.name)
        case 'ArrayExpression':
          return node.elements.map((item) => expr(item, scope))
        case 'ObjectExpression': {
          const out = Object.create(null)
          for (const property of node.properties) {
            const key = property.key.type === 'Identifier' ? property.key.name : property.key.value
            if ((typeof key !== 'string' && typeof key !== 'number') || forbidden.has(String(key)))
              invalid()
            out[key] = expr(property.value, scope)
          }
          return out
        }
        case 'MemberExpression': {
          const object = expr(node.object, scope),
            key = node.computed ? requireValue(expr(node.property, scope)) : node.property.name
          if ((typeof key !== 'string' && typeof key !== 'number') || forbidden.has(String(key)))
            invalid()
          if ((Array.isArray(object) || typeof object === 'string') && key === 'length')
            return object.length
          requireValue(object)
          if (object === null) {
            const path = memberPath(node)
            throw new ExpressionError('missing', `cannot read ${path} because its parent is null.`, path)
          }
          if (!object || typeof object !== 'object') invalid()
          return Object.hasOwn(object, key) ? object[key] : missingValue(memberPath(node))
        }
        case 'ConditionalExpression':
          return unwrap(expr(node.test, scope)) ? expr(node.consequent, scope) : expr(node.alternate, scope)
        case 'LogicalExpression': {
          const left = expr(node.left, scope)
          const value = unwrap(left)
          return node.operator === '&&'
            ? value
              ? expr(node.right, scope)
              : left
            : node.operator === '||'
              ? value
                ? left
                : expr(node.right, scope)
              : value === null || value === undefined
                ? expr(node.right, scope)
                : left
        }
        case 'UnaryExpression': {
          const value = expr(node.argument, scope)
          if (node.operator === '!') return !unwrap(value)
          requireValue(value)
          if (typeof value !== 'number') invalid()
          return bounded(node.operator === '-' ? -value : +value)
        }
        case 'BinaryExpression': {
          const left = expr(node.left, scope),
            right = expr(node.right, scope)
          if (node.operator === '===') return scalar(unwrap(left)) === scalar(unwrap(right))
          if (node.operator === '!==') return scalar(unwrap(left)) !== scalar(unwrap(right))
          scalar(requireValue(left))
          scalar(requireValue(right))
          let result
          switch (node.operator) {
            case '+':
              if (typeof left === 'string' && typeof right === 'string') {
                if (left.length + right.length > EXPRESSION_LIMITS.outputBytes) limit()
                return left + right
              }
              if (typeof left !== 'number' || typeof right !== 'number') invalid()
              result = left + right
              break
            case '-':
            case '*':
            case '/':
            case '%':
              if (typeof left !== 'number' || typeof right !== 'number') invalid()
              result =
                node.operator === '-'
                  ? left - right
                  : node.operator === '*'
                    ? left * right
                    : node.operator === '/'
                      ? left / right
                      : left % right
              break
            default:
              if (typeof left !== typeof right || !['number', 'string'].includes(typeof left))
                invalid()
              return node.operator === '<'
                ? left < right
                : node.operator === '<='
                  ? left <= right
                  : node.operator === '>'
                    ? left > right
                    : left >= right
          }
          return bounded(result)
        }
        default:
          invalid()
      }
    }
    function sequence(body, scope) {
      for (const node of body) {
        const flow = statement(node, scope)
        if (flow) return flow
      }
    }
    function statement(node, scope) {
      tick()
      switch (node.type) {
        case 'EmptyStatement':
          return
        case 'BlockStatement':
          return sequence(node.body, new Map(scope))
        case 'ReturnStatement':
          if (!node.argument) invalid()
          return { kind: 'return', value: expr(node.argument, scope) }
        case 'VariableDeclaration':
          for (const item of node.declarations) {
            if (scope.has(item.id.name)) invalid()
            scope.set(item.id.name, expr(item.init, scope))
          }
          return
        case 'IfStatement':
          return unwrap(expr(node.test, scope))
            ? statement(node.consequent, scope)
            : node.alternate
              ? statement(node.alternate, scope)
              : undefined
        case 'BreakStatement':
          return { kind: 'break' }
        case 'SwitchStatement': {
          const value = unwrap(expr(node.discriminant, scope))
          let start = node.cases.findIndex((item) => item.test && unwrap(expr(item.test, scope)) === value)
          if (start < 0) start = node.cases.findIndex((item) => !item.test)
          if (start < 0) return
          const local = new Map(scope)
          for (let i = start; i < node.cases.length; i++) {
            const flow = sequence(node.cases[i].consequent, local)
            if (flow) return flow.kind === 'break' ? undefined : flow
          }
          return
        }
        default:
          invalid()
      }
    }
    const result = sequence(ast.body, root)
    if (result?.kind !== 'return')
      throw new ExpressionError('runtime', 'no return value was reached.')
    const copy = jsonCopy(result.value, budget(EXPRESSION_LIMITS.outputBytes))
    // Return detached ordinary JSON to the request builder, never interpreter internals.
    return JSON.parse(JSON.stringify(copy))
  } catch (cause) {
    if (cause instanceof ExpressionError) throw cause
    invalid()
  }
}
