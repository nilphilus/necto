import test from 'node:test'
import assert from 'node:assert/strict'
import {createEdgeRouter,routeGeometry,placeConnectionControls,CARD_WIDTH,CARD_HEIGHT} from './edgeRouting.js'
const card=(id,x,y)=>({step:{id},x,y})
function assertClear(route,nodes,from,to){
 assert.ok(route,'route exists')
 assert.deepEqual(route.points[0],{x:nodes.find(n=>n.step.id===from).x+CARD_WIDTH,y:nodes.find(n=>n.step.id===from).y+46})
 assert.deepEqual(route.points.at(-1),{x:nodes.find(n=>n.step.id===to).x,y:nodes.find(n=>n.step.id===to).y+46})
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i];assert.ok(a.x===b.x||a.y===b.y)
  for(const n of nodes){const hit=a.y===b.y?a.y>n.y&&a.y<n.y+CARD_HEIGHT&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+CARD_WIDTH:a.x>n.x&&a.x<n.x+CARD_WIDTH&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+CARD_HEIGHT;assert.equal(hit,false,`${from}->${to} crosses ${n.step.id}`)}
 }
 for(const n of nodes)assert.equal(route.x>n.x-14&&route.x<n.x+CARD_WIDTH+14&&route.y>n.y-14&&route.y<n.y+CARD_HEIGHT+14,false,'configuration button clears card')
}
test('A–C bypasses B in an A–B–C chain and its button follows the actual detour',()=>{
 const nodes=[card('a',170,84),card('b',450,84),card('c',730,84)],route=createEdgeRouter(nodes,300)
 for(const [from,to] of [['a','b'],['b','c'],['a','c']])assertClear(route(from,to),nodes,from,to)
 const skip=route('a','c');assert.ok(skip.points.some(p=>p.y<84||p.y>196));assert.notEqual(skip.y,130)
})
test('handles manual positions, reverse direction, vertical stacks and multiple obstacles',()=>{
 for(const nodes of [[card('a',730,84),card('b',450,84),card('c',170,84)],[card('a',170,40),card('b',170,200),card('c',170,360)],[card('a',170,84),card('b',450,30),card('d',450,180),card('c',730,270)]])assertClear(createEdgeRouter(nodes,550)('a','c'),nodes,'a','c')
})
test('Start routes avoid cards, and adding another edge does not change existing routes',()=>{
 const nodes=[card('a',170,84),card('b',450,84),card('c',730,84)],route=createEdgeRouter(nodes,300)
 const start=route(null,'c');assert.ok(start);assert.ok(start.points.some(p=>p.y<84||p.y>196));const before=route('a','c');route('b','c');assert.deepEqual(route('a','c'),before)
})
test('reports impossible/overlapping endpoints and exhausted search without drawing through nodes',()=>{
 const overlap=[card('a',170,84),card('b',300,84)];assert.equal(createEdgeRouter(overlap,300)('a','b'),null)
 const nodes=[card('a',170,84),card('b',450,84),card('c',730,84)];assert.equal(createEdgeRouter(nodes,300,{budget:0})('a','c'),null)
 assert.equal(createEdgeRouter(nodes,300)('missing','c'),null)
})
test('geometry removes redundant points and locates the button by distance along the routed line',()=>{
 const r=routeGeometry([{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:20,y:40}]);assert.deepEqual(r.points,[{x:0,y:0},{x:20,y:0},{x:20,y:40}]);assert.deepEqual({x:r.x,y:r.y},{x:20,y:10})
})
test('bounded router handles the maximum scenario size and 1000 connections deterministically',()=>{
 const nodes=Array.from({length:100},(_,i)=>card('n'+i,170+(i%10)*280,40+Math.floor(i/10)*160)),route=createEdgeRouter(nodes,1750)
 let routed=0
 for(let i=0;i<1000;i++){const a=i%100,b=(a+1+Math.floor(i/100))%100;const r=route('n'+a,'n'+b);if(r){assertClear(r,nodes,'n'+a,'n'+b);routed++}}
 assert.equal(routed,1000)
})

test('fan-out and fan-in use separate ports and independently clickable controls', () => {
 const nodes = [card('a', 170, 180), card('b', 450, 70), card('c', 450, 300), card('d', 730, 180)]
 const connections = [['a','b'], ['a','d'], ['a','c'], ['b','d'], ['c','d']].map(([from, to]) => ({ from, to }))
 const route = createEdgeRouter(nodes, 550, { connections })
 const edges = connections.map(edge => ({ ...edge, key: edge.from + edge.to, ...route(edge.from, edge.to) }))
 assert.equal(new Set(edges.filter(edge => edge.from === 'a').map(edge => edge.points[0].y)).size, 3)
 assert.equal(new Set(edges.filter(edge => edge.to === 'd').map(edge => edge.points.at(-1).y)).size, 3)
 const cards = nodes.map(node => ({ ...node, width: CARD_WIDTH, height: CARD_HEIGHT }))
 const controls = placeConnectionControls(edges, cards, 1)
 assert.equal(controls.size, connections.length)
 for (const [key, position] of controls) {
  for (const [other, next] of controls) {
   if (key !== other) assert.ok(Math.abs(position.x - next.x) >= 35 || Math.abs(position.y - next.y) >= 35)
  }
 }
})

test('overlapping lines get distinct controls when there is room and list access when there is not', () => {
 const line = routeGeometry([{ x: 50, y: 50 }, { x: 240, y: 50 }])
 const separated = placeConnectionControls([{ key: 'a', ...line }, { key: 'b', ...line }], [], 0.65)
 assert.equal(separated.size, 2)
 assert.ok(Math.abs(separated.get('a').x - separated.get('b').x) * 0.65 >= 35)

 const short = routeGeometry([{ x: 50, y: 50 }, { x: 70, y: 50 }])
 assert.equal(placeConnectionControls([{ key: 'a', ...short }, { key: 'b', ...short }], [], 1).size, 1)
})

test('keeps a route available when separate-lane search is exhausted', () => {
 const nodes = [card('a', 170, 84), card('b', 450, 84), card('c', 730, 84)]
 const connections = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }]
 const route = createEdgeRouter(nodes, 300, { connections, budget: 0 })
 assertClear(route('a', 'c'), nodes, 'a', 'c')
})
