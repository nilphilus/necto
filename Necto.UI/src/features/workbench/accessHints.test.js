import test from 'node:test'
import assert from 'node:assert/strict'
import { accessHints } from './accessHints.js'
test('access hints preserve role alternatives and do not promise access',()=>{
 const hint=accessHints({requiresAuthorization:true,rules:[{policy:'Read',anyRole:['Reader','Admin']},{policy:'Tenant'}]})
 assert.equal(hint.rules.length,2);assert.match(hint.rules[0],/Any role: Reader, Admin/)
 assert.equal(accessHints({requiresAuthorization:false,anonymousOverride:true,rules:[{policy:'Read'}]}).rules.length,0)
 assert.equal(accessHints('bad'),null)
})
