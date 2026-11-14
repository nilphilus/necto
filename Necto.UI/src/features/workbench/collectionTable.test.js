import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableColumns, tableCell, discoverTableColumns, contractTableColumns } from './collectionTable.js';
test('table samples bounded scalar columns and rejects primitive or mixed arrays', () => {
  assert.deepEqual(
    tableColumns([
      { id: 1, metadata: { x: 1 } },
      { id: 2, name: 'B' }
    ]),
    ['id', 'name']
  );
  assert.deepEqual(tableColumns([1, 2]), []);
  assert.deepEqual(tableColumns([{ id: 1 }, null]), []);
  assert.equal(
    tableColumns([
      Object.fromEntries(Array.from({ length: 10000 }, (_, i) => ['c' + i, i]))
    ]).length,
    12
  );
  assert.equal(tableCell('x'.repeat(1000)).length, 181);
});

test('column discovery reaches sparse fields in bounded passes and uses the actual response contract', () => {
  const rows = Array.from({length: 600}, (_, index) => ({id: index, ...(index === 26 ? {late: true} : {}), ...(index === 300 ? {later: 'x'} : {})}))
  assert.deepEqual(discoverTableColumns(rows, 25, 10000), ['id','late'])
  assert.deepEqual(discoverTableColumns(rows, 275, 250), ['id','later'])
  assert.deepEqual(contractTableColumns({resolve:x=>x,responses:{200:{content:{'application/json':{schema:{type:'array',items:{properties:{id:{type:'integer'},optional:{type:['string','null']},nested:{type:'object'}}}}}}}}},200,'application/json; charset=utf-8'), ['id','optional'])
})
