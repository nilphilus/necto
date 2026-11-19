import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateExpression } from './expression.js'
import { expressionCompletions, formatExpressionCode } from './expressionEditing.js'

test('formats a switch and preserves comments and evaluated values', async () => {
  const code = "/* keep */switch(response.type){case 'integer':return 42;default:return '42';}"
  const formatted = await formatExpressionCode(code)
  assert.match(formatted, /\/\* keep \*\//)
  assert.match(formatted, /\n  case 'integer':\n    return 42;/)
  for (const type of ['integer', 'string']) {
    assert.equal(evaluateExpression(formatted, { response: { type } }),
      evaluateExpression(code, { response: { type } }))
  }
  await assert.rejects(formatExpressionCode("return fetch('/');"))
  await assert.rejects(formatExpressionCode('return 1; /*'))
})

test('completes aliases, local names, and nested JSON fields at the cursor', () => {
  const bindings = [{ name: 'response' }]
  const hints = () => ['/items/0/type', '/items/0/title', '/items/0/constructor', '/other']
  const names = code => expressionCompletions(code, code.length, bindings, hints).map(item => item.name)
  assert.deepEqual(names('return res'), ['response'])
  assert.deepEqual(names('const total = 4; return to'), ['total'])
  assert.deepEqual(names('return response.items[0].t'), ['type', 'title'])
  assert.deepEqual(names('return "response.items[0].t'), [])
  assert.deepEqual(names('// response.items[0].t'), [])
  const code = 'return response.items[0].titld;'
  const [completion] = expressionCompletions(code, code.indexOf('titld') + 3, bindings, hints)
  assert.equal(code.slice(completion.start, completion.end), 'titld')
  assert.equal(completion.name, 'title')
})
