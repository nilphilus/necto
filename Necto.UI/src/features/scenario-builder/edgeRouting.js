// Bounded Manhattan routing on a shared compressed grid. Nothing is persisted.
export const CARD_WIDTH=214, CARD_HEIGHT=112, ROUTE_CLEARANCE=18
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
export function createEdgeRouter(nodes,height,{budget=500000}={}) {
 const start={id:null,x:24,y:height/2-24,width:84,height:48,portY:height/2}
 const cards=[start,...nodes.map(node=>({id:node.step.id,x:node.x,y:node.y,width:CARD_WIDTH,height:CARD_HEIGHT,portY:node.y+46}))]
 const byId=new Map(cards.map(card=>[card.id,card]))
 const rects=cards.map(card=>({...card,left:card.x-ROUTE_CLEARANCE,right:card.x+card.width+ROUTE_CLEARANCE,top:card.y-ROUTE_CLEARANCE,bottom:card.y+card.height+ROUTE_CLEARANCE}))
 const xs=unique(rects.flatMap(r=>[r.left,r.right])),ys=unique(rects.flatMap(r=>[r.top,r.bottom,r.portY]))
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
 return function route(fromId,toId){
  const from=byId.get(fromId),to=byId.get(toId);if(!from||!to)return null
  const a={x:from.x+from.width,y:from.portY},b={x:to.x,y:to.portY},s={x:a.x+ROUTE_CLEARANCE,y:a.y},t={x:b.x-ROUTE_CLEARANCE,y:b.y}
  if(!clearSegment(a,s,fromId)||!clearSegment(t,b,toId))return null
  if(s.x<=t.x&&s.y===t.y&&clearSegment(s,t,undefined))return routeGeometry([a,b])
  // Try cheap two-bend candidates before using the grid search.
  for(const x of unique([s.x,t.x,(s.x+t.x)/2])){
   const p={x,y:s.y},q={x,y:t.y}
   if(clearSegment(s,p,undefined)&&clearSegment(p,q,undefined)&&clearSegment(q,t,undefined))return routeGeometry([a,s,p,q,t,b])
  }
  const sx=xIndex.get(s.x),sy=yIndex.get(s.y),tx=xIndex.get(t.x),ty=yIndex.get(t.y)
  const source=sy*nx+sx,target=ty*nx+tx
  if(blocked[source]||blocked[target]||budget<=0)return null
  const heap=new Heap(),cost=new Map(),parents=new Map(),initial=source*3
  const heuristic=id=>Math.abs(xs[id%nx]-t.x)+Math.abs(ys[Math.floor(id/nx)]-t.y)
  heap.push({key:initial,g:0,score:heuristic(source)});cost.set(initial,0)
  let visits=0,found
  while(heap.size&&visits++<10000&&budget-->0){
   const current=heap.pop();if(cost.get(current.key)!==current.g)continue
   const id=Math.floor(current.key/3),direction=current.key%3,x=id%nx,y=Math.floor(id/nx)
   if(id===target){found=current.key;break}
   const options=[]
   if(x>0&&!horizontal[y*(nx-1)+x-1])options.push([id-1,1,xs[x]-xs[x-1]])
   if(x<nx-1&&!horizontal[y*(nx-1)+x])options.push([id+1,1,xs[x+1]-xs[x]])
   if(y>0&&!vertical[(y-1)*nx+x])options.push([id-nx,2,ys[y]-ys[y-1]])
   if(y<ny-1&&!vertical[y*nx+x])options.push([id+nx,2,ys[y+1]-ys[y]])
   for(const [next,axis,distance] of options){
    if(blocked[next])continue
    const key=next*3+axis,g=current.g+distance+(direction&&direction!==axis?16:0)
    if(g>=(cost.get(key)??Infinity))continue
    cost.set(key,g);parents.set(key,current.key);heap.push({key,g,score:g+heuristic(next)})
   }
  }
  if(found===undefined)return null
  const points=[]
  for(let key=found;key!==undefined;key=parents.get(key)){const id=Math.floor(key/3);points.push({x:xs[id%nx],y:ys[Math.floor(id/nx)]})}
  return routeGeometry([a,...points.reverse(),b])
 }
}
