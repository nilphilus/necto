import test from 'node:test'
import assert from 'node:assert/strict'
import{operationTasks,validateOperationTasks}from'./operationTasks.js'
test('author roles are scoped to visible unique local operations and paginated',()=>{
 const entry={operationId:'Create',entityId:'Billing.Invoice',entityName:'Invoice',role:'Create'},op={id:'Create',name:'Create invoice',apiId:'local'}
 assert.equal(operationTasks([entry],[op], 'invoice').items[0].role,'Create')
 assert.equal(operationTasks([entry],[{...op,apiId:'other'}]).total,0);assert.equal(operationTasks([entry],[op,{...op}]).total,0)
 assert.equal(operationTasks(Array.from({length:60},()=>entry),[op],'',2).items.length,25)
 assert.throws(()=>validateOperationTasks([{...entry,role:'Guess'}]),/Unsupported/)
 assert.equal(validateOperationTasks([entry])[0],entry)
})
