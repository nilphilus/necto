import { tokenizer } from 'acorn'
import { parseExpression } from './expression.js'
import { pointerParts } from './pointers.js'

const keywords = ['case', 'const', 'default', 'else', 'false', 'if', 'null', 'return', 'switch', 'true']
const identifier = /^[A-Za-z_$][\w$]*$/
const blocked = new Set(['__proto__', 'constructor', 'prototype'])

function tokensBefore(text) {
  let endsInComment = false
  const lexer = tokenizer(text, {
    ecmaVersion: 2022,
    onComment: (_, __, ___, end) => { if (end === text.length) endsInComment = true },
  })
  try {
    const tokens = [...lexer]
    if (endsInComment) return null
    return tokens
  } catch {
    return null
  }
}

export function expressionCompletions(code, cursor, bindings, pathsFor, memberOnly = false) {
  const before = code.slice(0, cursor)
  const access = /(?:^|[^\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*)\.([\w$]*)$/.exec(before)
  if (memberOnly && !access) return []
  const tokens = tokensBefore(before)
  if (!tokens) return []

  const candidates = new Map()
  const fragment = access ? access[2] : /[\w$]*$/.exec(before)[0]
  if (access) {
    const [alias, ...parents] = access[1].split(/[.\[\]]+/).filter(Boolean)
    const binding = bindings.find(item => item.name === alias)
    if (!binding) return []
    for (const hint of pathsFor(binding)) {
      let path
      try { path = pointerParts(hint) } catch { continue }
      const member = path[parents.length]
      if (member && identifier.test(member) && !blocked.has(member) &&
          parents.every((part, index) => part === path[index])) candidates.set(member, 'JSON field')
    }
  } else {
    for (const binding of bindings) candidates.set(binding.name, 'Input')
    for (let index = 0; index < tokens.length - 1; index++) {
      if (tokens[index].type.label === 'const' && tokens[index + 1].type.label === 'name') {
        candidates.set(tokens[index + 1].value, 'Local variable')
      }
    }
    for (const word of keywords) candidates.set(word, 'Keyword')
  }
  const end = cursor + /^[\w$]*/.exec(code.slice(cursor))[0].length
  return [...candidates].filter(([name]) => identifier.test(name) && !blocked.has(name) &&
    name.startsWith(fragment) && name !== fragment)
    .slice(0, 12).map(([name, kind]) => ({ name, kind, start: cursor - fragment.length, end }))
}

function structure(tree) {
  return JSON.stringify(tree, (key, value) => ['start', 'end', 'raw'].includes(key) ? undefined : value)
}

export async function formatExpressionCode(code) {
  const original = parseExpression(code)
  const [{ format }, babel, estree] = await Promise.all([
    import('prettier/standalone'), import('prettier/plugins/babel'), import('prettier/plugins/estree'),
  ])
  const formatted = (await format(code, {
    parser: 'babel', plugins: [babel.default, estree.default], singleQuote: true,
    semi: true, trailingComma: 'none', printWidth: 80,
  })).trimEnd()
  if (structure(parseExpression(formatted)) !== structure(original)) {
    throw new Error('Formatting would change this expression.')
  }
  return formatted
}
