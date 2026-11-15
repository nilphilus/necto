import test from 'node:test'
import assert from 'node:assert/strict'
import { responseCollection } from './responseCollection.js'
const operation = { resolve: value=>value, responses: { 200: { content: { 'application/json': { schema: { 'x-necto-collection':'rows','x-necto-total-count':'count' } } } } } }
test('wrapper metadata focuses the collection without changing paths or API totals',()=>{
 const result={status:200,contentType:'application/json; charset=utf-8',json:{rows:[{id:42}],count:500}}
 assert.deepEqual(responseCollection(operation,result),{path:['rows'],total:500});assert.equal(result.json.rows[0].id,42)
 assert.equal(responseCollection(operation,{...result,json:{rows:{},count:500}}),null)
 assert.equal(responseCollection(operation,{...result,json:{rows:[],count:-1}}).total,null)
})
