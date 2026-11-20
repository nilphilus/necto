import { removeStepDraft, restoreStepDraft } from './stepUndo.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateExpression, parseExpression, validateExpression } from './expression.js'
import { newBlueprint, newStep, validateBlueprint, layers } from './model.js'
import { savedBlueprint } from './useBuilder.js'
import { executeBlueprint } from './runner.js'
import { prepareBlueprint } from './prepareBlueprint.js'
import { parseShared, serializeShared, sharedDefinition } from '../scenario-folder/format.js'
const binding = (name, stepId, responsePointer = '') => ({
  name,
  source: 'response',
  stepId,
  responsePointer,
})
const input = (expression, bindings = []) => ({
  location: 'query',
  name: 'result',
  source: 'expression',
  expression,
  bindings,
})
const op = (id) => ({
  key: 'GET /' + id,
  apiId: 'local',
  method: 'GET',
  path: '/' + id,
  name: id,
  parameters: [{ in: 'query', name: 'result', schema: { type: 'string' } }],
  resolve: (v) => v,
  servers: [],
})
const make = () => ({
  ...newBlueprint(),
  steps: ['a', 'b', 'join'].map((id) => ({ ...newStep(op(id), { fields: {}, body: '' }), id })),
})
const context = {
  operations: ['a', 'b', 'join'].map(op),
  configuration: { apiBaseUrl: 'https://example.invalid' },
  createSession: () => ({ fields: {}, body: '' }),
  valuesFor: () => new Map(),
}
test('switch, if, const, JSON values, typed arithmetic and nullish fallback', () => {
  assert.equal(
    evaluateExpression(
      'switch(invoice.status){case "draft":return "review";case "approved":return "send";default:return "skip";}',
      { invoice: { status: 'approved' } }
    ),
    'send'
  )
  assert.deepEqual(
    evaluateExpression(
      'const total = order.amount * 2; if(total > 10) { return {total: total, ids: [order.id], ok: !false}; } return null;',
      { order: { id: 7, amount: 8 } }
    ),
    { total: 16, ids: [7], ok: true }
  )
  assert.equal(
    evaluateExpression('return invoice.missing ?? "fallback";', { invoice: {} }),
    'fallback'
  )
  assert.equal(
    evaluateExpression('switch(value){case 1:break;default:return "other";} return "one";', {
      value: 1,
    }),
    'one'
  )
  assert.equal(
    evaluateExpression('return list.length + name.length;', { list: [1, 2], name: 'abc' }),
    5
  )
})
test('a body expression selects a typed value from an earlier response type descriptor', async () => {
  const blueprint = make()
  const target = { ...op('join'), key: 'POST /join', method: 'POST',
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } }
  blueprint.steps[2] = {
    ...newStep(target, { fields: {}, body: '{}' }), id: 'join',
    inputs: [{
      ...input("switch (response.type) { case 'integer': return 42; case 'string': return '42'; default: return null; }", [binding('response', 'a')]),
      location: 'body', pointer: '/value',
    }],
  }
  for (const [type, expected] of [['string', '42'], ['integer', 42], ['unknown', null]]) {
    const plan = prepareBlueprint(blueprint, { ...context, operations: [op('a'), op('b'), target] })
    let sent
    const result = await executeBlueprint(plan, {
      signal: new AbortController().signal,
      execute: async (operation, session) => {
        if (operation.path === '/join') sent = JSON.parse(session.body)
        return { ok: true, status: 200, json: { type } }
      },
    })
    assert.equal(result.status, 'completed')
    assert.deepEqual(sent, { value: expected })
  }
})
test('reject every host capability, function, mutation, loop and module syntax, including dead code', () => {
  for (const code of [
    'import x from "x";',
    'return import("x");',
    'return fetch("https://evil.invalid");',
    'return eval("1");',
    'return Function("return window")();',
    'return new Date();',
    'return (()=>1)();',
    'return (function(){return 1})();',
    'while(true){}',
    'for(;;){}',
    'return /x/;',
    'return 1n;',
    'let a=1;return a;',
    'const a=1;a++;return a;',
    'throw "secret";',
    'return window.document;',
    'return globalThis;',
    'return document;',
    'return localStorage;',
    'return navigator;',
    'return process;',
    'return 1; if(false){ fetch("x"); }',
    'return a.map(x=>x);',
    'return {...a};',
    'return `token:${a}`;',
    'return await a;',
  ]) {
    assert.throws(() => evaluateExpression(code, { a: [] }))
  }
  for (const code of [
    'return 1; if(false){ fetch("x"); }',
    'if(false){while(true){}} return 1;',
    'return a["constructor"]["constructor"]("return globalThis")();',
  ])
    assert.throws(() => parseExpression(code))
})
test('blocks prototypes and computed escape routes; no prototype pollution', () => {
  for (const code of [
    'return value.constructor;',
    'return value["con"+"structor"];',
    'return value["__proto__"];',
    'return {"__proto__":value};',
    'return {prototype:1};',
  ])
    assert.throws(() => evaluateExpression(code, { value: {} }))
  assert.throws(() =>
    evaluateExpression('return value;', JSON.parse('{"value":{"__proto__":{"polluted":true}}}'))
  )
  assert.equal({}.polluted, undefined)
  assert.throws(() => evaluateExpression('return value.toString;', { value: {} }))
})
test('input/output are detached JSON; getters, methods and non-JSON values never enter the interpreter', () => {
  let called = false
  const value = {
    get secret() {
      called = true
      return 1
    },
  }
  assert.throws(() => evaluateExpression('return item.secret;', { item: value }))
  assert.equal(called, false)
  for (const item of [() => 1, new Date(), new Map(), undefined, Infinity])
    assert.throws(() => evaluateExpression('return item;', { item }))
  const original = { item: { values: [1, 2] } }
  const result = evaluateExpression('return item;', original)
  result.values.push(3)
  assert.deepEqual(original.item.values, [1, 2])
})
test('enforces source, AST, data, result and finite arithmetic limits with payload-free errors', () => {
  for (const [code, values] of [
    ['return "' + 'x'.repeat(4100) + '";', {}],
    ['return ' + Array.from({ length: 300 }, () => 1).join('+') + ';', {}],
    ['return value;', { value: 'SECRET'.repeat(200000) }],
    ['return value;', { value: 'x'.repeat(30000) }],
    ['return 1/0;', {}],
    ['return value;', { value: Array(10001).fill(0) }],
    ['return missing;', { secret: 'DO_NOT_ECHO' }],
    ['return "PRIVATE_LITERAL" + {};', {}],
  ]) {
    assert.throws(
      () => evaluateExpression(code, values),
      (error) =>
        !error.message.includes('DO_NOT_ECHO') && !error.message.includes('PRIVATE_LITERAL')
    )
  }
  const deep = {}
  let next = deep
  for (let i = 0; i < 40; i++) {
    next.child = {}
    next = next.child
  }
  assert.throws(() => evaluateExpression('return value;', { value: deep }))
})
test('reports missing fields separately from syntax and limits without revealing computed keys', () => {
  const withRange = { item: { key: 'ignored', range: { min: 3, max: 6 } } }
  const withoutRange = { item: { key: 'PRIVATE_RESPONSE_VALUE' } }
  assert.equal(evaluateExpression('return item.range.min;', withRange), 3)
  assert.throws(() => evaluateExpression('return item.range.min;', withoutRange), {
    code: 'missing', path: 'item.range',
  })
  assert.throws(() => evaluateExpression('return {min: item.range.min};', { item: { range: {} } }), {
    code: 'missing', path: 'item.range.min',
  })
  assert.throws(() => evaluateExpression('return item[item.key];', withoutRange), (error) =>
    error.code === 'missing' && error.path === 'item[computed]' && !error.message.includes('PRIVATE_RESPONSE_VALUE'))
  assert.throws(() => evaluateExpression('return item.;', withoutRange), { code: 'syntax' })
  assert.throws(() => evaluateExpression('return "' + 'x'.repeat(4100) + '";', {}), { code: 'limit' })
  assert.equal(evaluateExpression('const range = item.range; return range ?? null;', withoutRange), null)
  assert.equal(evaluateExpression('if (item.range) return 1; return 0;', withoutRange), 0)
  assert.equal(evaluateExpression('return item.range === item.other;', withoutRange), true)
  assert.equal(evaluateExpression('return item.range && 1 || 0;', withoutRange), 0)
})

test('run and preflight failures identify the step, target and missing response source', async () => {
  const blueprint = make()
  blueprint.steps[2].inputs = [input('return row.range.min;', [binding('row', 'a')])]
  const calls = []
  const execute = async (operation) => {
    calls.push(operation.path)
    return { ok: true, status: 200, json: { key: 'PRIVATE_RESPONSE_VALUE' } }
  }
  const plan = prepareBlueprint(blueprint, context)
  const result = await executeBlueprint(plan, { signal: new AbortController().signal, execute })
  assert.equal(result.status, 'failed')
  assert.match(plan[2].error, /Step "join", query: result.*missing value at row\.range.*Source step "a"/)
  assert.match(result.error, /No request was sent for this step/)
  assert.ok(!result.error.includes('PRIVATE_RESPONSE_VALUE'))
  assert.ok(!calls.includes('/join'))

  blueprint.steps[2].inputs = [input('return row;', [binding('row', 'a', '/range/max')])]
  const missingBinding = await executeBlueprint(prepareBlueprint(blueprint, context), {
    signal: new AbortController().signal, execute,
  })
  assert.match(missingBinding.error, /query: result.*Missing value for "row" in step "a" at \/range\/max/)
  blueprint.steps[2].inputs[0].expression = 'return row.;'
  assert.throws(() => prepareBlueprint(blueprint, context), /Step "join", query: result.*unsupported syntax/)
})

test('bindings are bounded, unique and typed', () => {
  for (const bindings of [
    [binding('same', 'a'), binding('same', 'b')],
    [binding('__proto__', 'a')],
    [binding('x', 'a', '/~bad')],
    Array.from({ length: 17 }, (_, i) => binding('v' + i, 'a')),
    [{ name: 'x', source: 'variable', variableId: '' }],
  ])
    assert.throws(() => validateExpression(input('return null;', bindings)))
})
test('expression responses and response variables form a join; missing references and cycles fail before requests', () => {
  const b = make()
  b.variables = [
    { id: 'shared', name: 'shared', source: 'response', stepId: 'b', responsePointer: '/id' },
  ]
  b.steps[2].inputs = [
    input('return left + right;', [
      binding('left', 'a', '/id'),
      { name: 'right', source: 'variable', variableId: 'shared' },
    ]),
  ]
  validateBlueprint(b)
  assert.deepEqual(
    layers(b).map((layer) => layer.map((step) => step.id)),
    [['a', 'b'], ['join']]
  )
  const bad = structuredClone(b)
  bad.steps[0].inputs = [input('return x;', [binding('x', 'join')])]
  assert.throws(() => validateBlueprint(bad), /cycle/)
  b.steps[2].inputs[0].bindings[1].variableId = 'missing'
  assert.throws(() => validateBlueprint(b), /Unknown/)
  b.steps[2].inputs[0].bindings[1] = { ...binding('right', 'missing') }
  assert.throws(() => validateBlueprint(b), /dependency/)
})
test('save/shared import retains only expression definitions and rejects old version opt-in', () => {
  const b = make()
  b.steps[2].inputs = [{ ...input('return x.id;', [binding('x', 'a')]), runtime: 'PRIVATE_RUN' }]
  const saved = savedBlueprint(b)
  assert.equal(saved.version, 7)
  assert.ok(!JSON.stringify(saved).includes('PRIVATE_RUN'))
  assert.deepEqual(parseShared(serializeShared('builder', b)).scenario, saved)
  const old = { ...b, version: 5 }
  assert.throws(() => validateBlueprint(old), /version 6/)
  const sensitive = op('join')
  sensitive.parameters[0].name = 'apiKey'
  b.steps[2].inputs[0].name = 'apiKey'
  assert.throws(() => sharedDefinition('builder', b, [op('a'), op('b'), sensitive]), /sensitive/)
})
test('runner waits for all expression producers, evaluates once and passes typed output', async () => {
  const b = make()
  b.steps[2].inputs = [
    input('switch(left.status){case "ready":return left.id + right.id;default:return 0;}', [
      binding('left', 'a'),
      binding('right', 'b'),
    ]),
  ]
  const plan = prepareBlueprint(b, context),
    calls = []
  const result = await executeBlueprint(plan, {
    signal: new AbortController().signal,
    execute: async (op, session) => {
      calls.push(op.path)
      if (op.path === '/join') assert.equal(session.fields['query:result'], '5')
      return { ok: true, status: 200, json: { id: op.path === '/a' ? 2 : 3, status: 'ready' } }
    },
  })
  assert.equal(result.status, 'completed')
  assert.equal(calls[2], '/join')
})
test('failure blocks the consumer request; presets override expressions; cancellation stops dispatch', async () => {
  const b = make()
  b.steps[2].inputs = [input('return missing;', [binding('x', 'a')])]
  let calls = []
  const execute = async (operation) => {
    calls.push(operation.path)
    return { ok: true, status: 200, json: { id: 1 } }
  }
  let plan = prepareBlueprint(b, context)
  assert.equal(
    (await executeBlueprint(plan, { signal: new AbortController().signal, execute })).status,
    'failed'
  )
  assert.ok(!calls.includes('/join'))
  calls = []
  plan = prepareBlueprint(b, { ...context, valuesFor: () => new Map([['query:result', 'preset']]) })
  assert.equal(plan[2].inputs.length, 0)
  assert.equal(
    (await executeBlueprint(plan, { signal: new AbortController().signal, execute })).status,
    'completed'
  )
  calls = []
  const controller = new AbortController()
  controller.abort()
  plan = prepareBlueprint(b, context)
  assert.equal(
    (await executeBlueprint(plan, { signal: controller.signal, execute })).status,
    'cancelled'
  )
  assert.equal(calls.length, 0)
})

test('step removal drops whole consuming expressions and undo restores their complete definitions', () => {
  const b = make()
  b.steps[2].inputs = [
    input('return left.id + right.id;', [binding('left', 'a'), binding('right', 'b')]),
  ]
  const removed = removeStepDraft(b, 'a')
  assert.equal(removed.next.steps[1].inputs.length, 0)
  validateBlueprint(removed.next)
  const restored = restoreStepDraft(removed.next, removed.snapshot)
  assert.deepEqual(restored.steps[2].inputs, b.steps[2].inputs)
  validateBlueprint(restored)
})
test('shared human variables used inside expressions are resolved once and not persisted as answers', async () => {
  const b = make()
  b.variables = [
    { id: 'human', name: 'factor', source: 'human', prompt: 'Factor?', valueType: 'number' },
  ]
  b.steps[2].inputs = [
    input('return amount * factor;', [
      binding('amount', 'a', '/id'),
      { name: 'factor', source: 'variable', variableId: 'human' },
    ]),
  ]
  const plan = prepareBlueprint(b, context)
  let asked = 0
  const result = await executeBlueprint(plan, {
    signal: new AbortController().signal,
    ask: async () => {
      asked++
      return [3]
    },
    execute: async (operation, session) => {
      if (operation.path === '/join') assert.equal(session.fields['query:result'], '6')
      return { ok: true, status: 200, json: { id: 2 } }
    },
  })
  assert.equal(result.status, 'completed')
  assert.equal(asked, 1)
  assert.equal(b.variables[0].value, undefined)
})

test('scenario-wide expression quotas bound preflight across many individually valid inputs', () => {
  const b = make()
  b.steps[0].inputs = Array.from({ length: 100 }, (_, i) => ({
    ...input('return 1;'),
    name: 'field' + i,
  }))
  b.steps[1].inputs = [input('return 1;')]
  assert.throws(() => validateBlueprint(b), /budget/)
})
