import test from 'node:test'
import assert from 'node:assert/strict'
import { tableShape, tablePreferenceKey, rememberColumns } from './previewPreferences.js'
test('table preferences depend on endpoint/path/shape, not values or object selection',()=>{
 const a=[{id:42,total:100}],b=[{total:200,id:43}],op={key:'GET /invoices'}
 assert.equal(tableShape(a),tableShape(b))
 assert.notEqual(tableShape(a),tableShape([{id:'string',total:100}]))
 assert.notEqual(tablePreferenceKey(op,[],a),tablePreferenceKey({key:'GET /other'},[],a))
 assert.notEqual(tablePreferenceKey(op,[],a),tablePreferenceKey(op,['lines'],a))
 const p={tables:{}},key=tablePreferenceKey(op,[],a);rememberColumns(p,key,['id'])
 assert.deepEqual(p.tables[tablePreferenceKey(op,[],b)],['id'])
 assert.equal(JSON.stringify(p).includes('42'),false)
 assert.equal(tableShape([1,2]),'');assert.equal(tableShape({id:1}),'')
})
test('column preferences retain empty selections and cap stored shapes',()=>{
 const p={};for(let i=0;i<12;i++)rememberColumns(p,'shape'+i,[])
 assert.equal(Object.keys(p.tables).length,8);assert.deepEqual(p.tables.shape11,[])
})
