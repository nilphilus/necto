// Bounded Manhattan routing on a shared compressed grid. Nothing is persisted.
export const CARD_WIDTH=214, CARD_HEIGHT=112, ROUTE_CLEARANCE=18
const CROSSING_PENALTY = 100000
const inside=(value,low,high)=>value>low&&value<high
const unique=values=>[...new Set(values)].sort((a,b)=>a-b)
export function routeGeometry(points) {
 const simplified=[]
 for(const point of points){
  if(simplified.at(-1)?.x===point.x&&simplified.at(-1)?.y===point.y)continue
  while(simplified.length>1){const a=simplified.at(-2),b=simplified.at(-1);if(a.x===b.x&&b.x===point.x||a.y===b.y&&b.y===point.y)simplified.pop();else break}
  simplified.push(point)
 }
 const lengths=simplified.slice(1).map((point,i)=>Math.abs(point.x-simplified[i].x)+Math.abs(point.y-simplified[i].y))
 let remaining=lengths.reduce((sum,value)=>sum+value,0)/2, label=simplified[0]
 for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]){const a=simplified[i],b=simplified[i+1],ratio=lengths[i]?remaining/lengths[i]:0;label={x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio};break}remaining-=lengths[i]}
 return {points:simplified,d:simplified.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '),x:label.x,y:label.y}
}
class Heap {
 entries=[]
 push(item){const a=this.entries;a.push(item);let i=a.length-1;while(i){const parent=(i-1)>>1;if(a[parent].score<=item.score)break;a[i]=a[parent];i=parent}a[i]=item}
 pop(){const a=this.entries,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].score<a[child].score)child++;if(a[child].score>=last.score)break;a[i]=a[child];i=child}a[i]=last}return first}
 get size(){return this.entries.length}
}
function connectionPorts(cards, connections, side) {
  const neighbors = new Map()
  const own = side === 'from' ? 'from' : 'to'
  const other = side === 'from' ? 'to' : 'from'
  for (const edge of connections) {
    if (!cards.has(edge[own]) || !cards.has(edge[other])) continue
    if (!neighbors.has(edge[own])) neighbors.set(edge[own], [])
    neighbors.get(edge[own]).push(cards.get(edge[other]))
  }
  return new Map([...neighbors].map(([id, peers]) => {
    const card = cards.get(id)
    peers.sort((a, b) => a.portY - b.portY || a.x - b.x || String(a.id).localeCompare(String(b.id)))
    const slots = Math.min(peers.length, card.id === null ? 4 : 7)
    const spacing = Math.min(12, (card.id === null ? 30 : 68) / Math.max(slots - 1, 1))
    const ports = new Map(peers.map((peer, index) => {
      const slot = slots === 1 ? 0 : Math.round(index * (slots - 1) / (peers.length - 1))
      return [peer.id, card.portY + (slot - (slots - 1) / 2) * spacing]
    }))
    return [id, ports]
  }))
}

export function placeConnectionControls(edges, cards, zoom) {
  const controls = new Map()
  const spacing = 35 / zoom
  const radius = 16 / zoom
  function available(x, y) {
    if (cards.some(card => inside(x, card.x - radius, card.x + card.width + radius) &&
        inside(y, card.y - radius, card.y + card.height + radius))) return false
    for (const point of controls.values()) {
      if (Math.abs(x - point.x) < spacing && Math.abs(y - point.y) < spacing) return false
    }
    return true
  }

  for (const edge of edges) {
    const candidates = [{ x: edge.x, y: edge.y }, ...edge.points.slice(1, -1)]
    for (let index = 1; index < edge.points.length; index++) {
      const before = edge.points[index - 1], after = edge.points[index]
      const length = Math.abs(after.x - before.x) + Math.abs(after.y - before.y)
      const samples = Math.min(24, Math.max(1, Math.ceil(2 * length / spacing)))
      for (let sample = 0; sample < samples; sample++) {
        const ratio = (sample + 0.5) / samples
        candidates.push({ x: before.x + (after.x - before.x) * ratio, y: before.y + (after.y - before.y) * ratio })
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - edge.x, a.y - edge.y) - Math.hypot(b.x - edge.x, b.y - edge.y))
    const position = candidates.find(({ x, y }) => x >= radius && y >= radius && available(x, y))
    if (position) controls.set(edge.key, position)
  }
  return controls
}
export function createEdgeRouter(nodes,height,{connections=[],budget=connections.length ? 125000 : 500000}={}) {
 const start={id:null,x:24,y:height/2-24,width:84,height:48,portY:height/2}
 const cards=[start,...nodes.map(node=>({id:node.step.id,x:node.x,y:node.y,width:CARD_WIDTH,height:CARD_HEIGHT,portY:node.y+46}))]
 const byId=new Map(cards.map(card=>[card.id,card]))
 const outgoing = connectionPorts(byId, connections, 'from')
 const incoming = connectionPorts(byId, connections, 'to')
 const occupiedX = { coordinates: [], ranges: new Map() }
 const occupiedY = { coordinates: [], ranges: new Map() }

 function firstAfter(coordinates, value) {
  let low = 0, high = coordinates.length
  while (low < high) {
   const middle = (low + high) >>> 1
   if (coordinates[middle] <= value) low = middle + 1
   else high = middle
  }
  return low
 }

 function segmentCost(a, b, record = false) {
  const vertical = a.x === b.x
  const lanes = vertical ? occupiedX : occupiedY
  const perpendicular = vertical ? occupiedY : occupiedX
  const lane = vertical ? a.x : a.y
  const start = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x)
  const end = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x)
  if (start === end) return 0
  const used = lanes.ranges.get(lane)
  if (record) {
   if (used) used.push([start, end])
   else {
    lanes.ranges.set(lane, [[start, end]])
    lanes.coordinates.splice(firstAfter(lanes.coordinates, lane), 0, lane)
   }
   return 0
  }

  let penalty = used?.reduce((sum, [low, high]) =>
   sum + 4 * Math.max(0, Math.min(end, high) - Math.max(start, low)), 0) ?? 0
  const { coordinates, ranges } = perpendicular
  // Count each crossing once when grid segments meet on the crossed lane.
  for (let index = firstAfter(coordinates, start); coordinates[index] <= end; index++) {
   for (const [low, high] of ranges.get(coordinates[index])) {
    if (low <= lane && lane <= high) penalty += CROSSING_PENALTY
   }
  }
  return end - start + penalty
 }
 function finish(geometry) {
  if (connections.length) for (let index = 1; index < geometry.points.length; index++) {
   segmentCost(geometry.points[index - 1], geometry.points[index], true)
  }
  return geometry
 }
 const rects=cards.map(card=>({...card,left:card.x-ROUTE_CLEARANCE,right:card.x+card.width+ROUTE_CLEARANCE,top:card.y-ROUTE_CLEARANCE,bottom:card.y+card.height+ROUTE_CLEARANCE}))
 const boundsX = rects.flatMap(rect => [rect.left, rect.right])
 const boundsY = rects.flatMap(rect => [rect.top, rect.bottom])
 // Leave a lane beyond the obstacle boundaries so a route can go around
 // existing detours that already occupy the top or bottom edge of the grid.
 const outerLanes = bounds => [
  Math.max(2, Math.min(...bounds) - ROUTE_CLEARANCE),
  Math.max(...bounds) + ROUTE_CLEARANCE,
 ]
 const xs = unique([...boundsX, ...outerLanes(boundsX)])
 const ys = unique([...boundsY, ...outerLanes(boundsY), ...rects.map(rect => rect.portY),
  ...[...outgoing.values(), ...incoming.values()].flatMap(ports => [...ports.values()])])
 const nx=xs.length,ny=ys.length,xIndex=new Map(xs.map((x,i)=>[x,i])),yIndex=new Map(ys.map((y,i)=>[y,i]))
 const blocked=new Uint8Array(nx*ny),horizontal=new Uint8Array((nx-1)*ny),vertical=new Uint8Array(nx*(ny-1))
 for(const r of rects){
  const xx=xs.map((x,i)=>inside(x,r.left,r.right)?i:-1).filter(i=>i>=0),yy=ys.map((y,i)=>inside(y,r.top,r.bottom)?i:-1).filter(i=>i>=0)
  for(const y of yy){for(const x of xx)blocked[y*nx+x]=1;for(let x=0;x<nx-1;x++)if(inside((xs[x]+xs[x+1])/2,r.left,r.right))horizontal[y*(nx-1)+x]=1}
  for(const x of xx)for(let y=0;y<ny-1;y++)if(inside((ys[y]+ys[y+1])/2,r.top,r.bottom))vertical[y*nx+x]=1
 }
 function clearSegment(a,b,ignore){
  return rects.every(r=>r.id===ignore||(a.y===b.y?! (inside(a.y,r.top,r.bottom)&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right):a.x===b.x?! (inside(a.x,r.left,r.right)&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom):false))
 }
 function preferredRoute(fromId,toId){
  const from=byId.get(fromId),to=byId.get(toId);if(!from||!to)return null
  const a={x:from.x+from.width,y:outgoing.get(fromId)?.get(toId) ?? from.portY},b={x:to.x,y:incoming.get(toId)?.get(fromId) ?? to.portY},s={x:a.x+ROUTE_CLEARANCE,y:a.y},t={x:b.x-ROUTE_CLEARANCE,y:b.y}
  if(!clearSegment(a,s,fromId)||!clearSegment(t,b,toId))return null
  if(s.x<=t.x&&s.y===t.y&&clearSegment(s,t,undefined)&&segmentCost(s,t)===t.x-s.x)
   return finish(routeGeometry([a,b]))
  // Prefer a short clear route. Search the grid if cheap routes reuse a lane.
  let fallback, fallbackCost = Infinity
  for(const x of unique([s.x,t.x,(s.x+t.x)/2])){
   const p={x,y:s.y},q={x,y:t.y}
   if(!clearSegment(s,p,undefined)||!clearSegment(p,q,undefined)||!clearSegment(q,t,undefined))continue
   const cost = segmentCost(s,p) + segmentCost(p,q) + segmentCost(q,t)
   const distance = Math.abs(s.x - x) + Math.abs(s.y - t.y) + Math.abs(t.x - x)
   if(cost===distance)return finish(routeGeometry([a,s,p,q,t,b]))
   if(cost<fallbackCost){fallback=routeGeometry([a,s,p,q,t,b]);fallbackCost=cost}
  }
  const sx=xIndex.get(s.x),sy=yIndex.get(s.y),tx=xIndex.get(t.x),ty=yIndex.get(t.y)
  const source=sy*nx+sx,target=ty*nx+tx
  if(blocked[source]||blocked[target]||budget<=0)return fallback ? finish(fallback) : null
  const heap=new Heap(),cost=new Map(),parents=new Map(),initial=source*3
  const heuristic=id=>Math.abs(xs[id%nx]-t.x)+Math.abs(ys[Math.floor(id/nx)]-t.y)
  heap.push({key:initial,g:0,score:heuristic(source)});cost.set(initial,0)
  let visits=0,found
  while(heap.size&&visits++<10000&&budget-->0){
   const current=heap.pop();if(cost.get(current.key)!==current.g)continue
   const id=Math.floor(current.key/3),direction=current.key%3,x=id%nx,y=Math.floor(id/nx)
   if(id===target){found=current.key;break}
   const options=[]
   if(x>0&&!horizontal[y*(nx-1)+x-1])options.push([id-1,1])
   if(x<nx-1&&!horizontal[y*(nx-1)+x])options.push([id+1,1])
   if(y>0&&!vertical[(y-1)*nx+x])options.push([id-nx,2])
   if(y<ny-1&&!vertical[y*nx+x])options.push([id+nx,2])
   for(const [next,axis] of options){
    if(blocked[next])continue
    const key=next*3+axis,g=current.g+segmentCost({x:xs[x],y:ys[y]},{x:xs[next%nx],y:ys[Math.floor(next/nx)]})+(direction&&direction!==axis?16:0)
    if(g>=(cost.get(key)??Infinity))continue
    cost.set(key,g);parents.set(key,current.key);heap.push({key,g,score:g+heuristic(next)})
   }
  }
  if(found===undefined||cost.get(found)>=fallbackCost)return fallback ? finish(fallback) : null
  const points=[]
  for(let key=found;key!==undefined;key=parents.get(key)){const id=Math.floor(key/3);points.push({x:xs[id%nx],y:ys[Math.floor(id/nx)]})}
  return finish(routeGeometry([a,...points.reverse(),b]))
 }
 if (!connections.length) return preferredRoute
 let basicRoute
 return (fromId, toId) => {
  const preferred = preferredRoute(fromId, toId)
  if (preferred) return preferred
  // Keep connections visible on dense maps after the lane search budget runs out.
  basicRoute ??= createEdgeRouter(nodes, height)
  const basic = basicRoute(fromId, toId)
  return basic ? finish(basic) : null
 }

}

function crossingCount(routes) {
 const horizontal = [], vertical = []
 for (const [index, route] of routes.entries()) {
  if (!route) continue
  for (let i = 1; i < route.points.length; i++) {
   const a = route.points[i - 1], b = route.points[i]
   if (a.y === b.y) horizontal.push({ index, lane: a.y, low: Math.min(a.x, b.x), high: Math.max(a.x, b.x) })
   else vertical.push({ index, lane: a.x, low: Math.min(a.y, b.y), high: Math.max(a.y, b.y) })
  }
 }

 let count = 0
 for (const h of horizontal) for (const v of vertical) {
  if (h.index !== v.index && inside(v.lane, h.low, h.high) && inside(h.lane, v.low, v.high)) count++
 }
 return count
}

export function routeConnections(nodes, height, connections) {
 const route = createEdgeRouter(nodes, height, { connections })
 const routes = connections.map(({ from, to }) => route(from, to))
 // On small graphs, let a previously constrained edge reserve space first.
 // Large maps retain the single bounded search.
 if (connections.length > 24 || routes.reduce((total, route) => total + (route?.points.length ?? 0), 0) > 1024) return routes
 const crossings = crossingCount(routes)
 if (!crossings) return routes

 const reverseRoute = createEdgeRouter(nodes, height, { connections })
 const alternative = [...connections].reverse().map(({ from, to }) => reverseRoute(from, to)).reverse()
 const preservesRoutes = routes.every((geometry, index) => !geometry || alternative[index])
 return preservesRoutes && crossingCount(alternative) < crossings ? alternative : routes
}
