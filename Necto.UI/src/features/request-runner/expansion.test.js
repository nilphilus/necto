import test from 'node:test'
import assert from 'node:assert/strict'
import { expansionPlan,hasExpandableChildren,EXPANSION_DEPTH_LIMIT } from './expansion.js'
test('expansion follows nested children and only current pages of large lists',()=>{
 let reads=0
 const rows=Array.from({length:10000},(_,id)=>({id,children:[{value:id}]}))
 const guarded=new Proxy(rows,{get(target,key){if(/^\d+$/.test(String(key)))reads++;return Reflect.get(target,key)}})
 const plan=expansionPlan({rows:guarded})
 assert.ok(plan.paths.has('["rows",0,"children",0]'));assert.ok(!plan.paths.has('["rows",25]'));assert.ok(reads<=25);assert.equal(plan.limited,false)
 const later=expansionPlan({rows},[],new Map([['["rows"]',2]]))
 assert.ok(later.paths.has('["rows",25]'));assert.ok(!later.paths.has('["rows",0]'))
})
test('wide and deep documents stop at the expansion budget without changing payload data',()=>{
 const value=Array.from({length:25},()=>Array.from({length:25},()=>({child:{value:1}})))
 const plan=expansionPlan(value,[],new Map(),100)
 assert.equal(plan.limited,true);assert.ok(plan.paths.size<100)
 let deep={value:1};for(let i=0;i<50;i++)deep={child:deep}
 const nested=expansionPlan(deep);assert.equal(nested.limited,true);assert.ok(nested.paths.size<=EXPANSION_DEPTH_LIMIT)
 assert.equal(value[24][24].child.value,1)
})

test('bulk controls require a nonempty object or array on the current page', () => {
 const value = { scalar: 1, emptyObject: {}, emptyArray: [], child: { message: 'Invalid' }, list: ['Required'] }
 const keys = Object.keys(value)
 assert.equal(hasExpandableChildren(value, { start: 0, end: 3 }, keys), false)
 assert.equal(hasExpandableChildren(value, { start: 3, end: 4 }, keys), true)
 assert.equal(hasExpandableChildren(value, { start: 4, end: 5 }, keys), true)
 assert.equal(hasExpandableChildren([42, null, {}, []], { start: 0, end: 4 }), false)
})
