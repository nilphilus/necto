import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tableColumns,tableCell} from './collectionTable.js'
test('table samples bounded scalar columns and rejects primitive or mixed arrays',()=>{assert.deepEqual(tableColumns([{id:1,metadata:{x:1}},{id:2,name:'B'}]),['id','name']);assert.deepEqual(tableColumns([1,2]),[]);assert.deepEqual(tableColumns([{id:1},null]),[]);assert.equal(tableColumns([Object.fromEntries(Array.from({length:10000},(_,i)=>['c'+i,i]))]).length,12);assert.equal(tableCell('x'.repeat(1000)).length,181)})
