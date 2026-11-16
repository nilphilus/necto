import test from 'node:test'
import assert from 'node:assert/strict'
import { constraintLabels } from './constraints.js'
test('contract constraint labels retain zero values and never execute patterns',()=>{
 assert.deepEqual(constraintLabels({minimum:0,maxLength:12,pattern:'^(a+)+$'}),['Minimum: 0','Maximum length: 12','Pattern: ^(a+)+$'])
 assert.equal(constraintLabels({pattern:'x'.repeat(1000)})[0].length,309)
})
