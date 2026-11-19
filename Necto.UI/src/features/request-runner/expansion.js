import { childEntries, pageRange, PREVIEW_PAGE_SIZE } from './preview.js'
export const EXPANSION_NODE_BUDGET = 500
export const EXPANSION_DEPTH_LIMIT = 16
// Visit only the visible page of each expanded container, never the full payload.
export function expansionPlan(value, path = [], pages = new Map(), budget = EXPANSION_NODE_BUDGET) {
 const paths = new Set(), queue = [{value,path,depth:0}]
 let remaining = Math.max(0,budget-1), limited = false
 for(let index=0;index<queue.length;index++) {
  const node=queue[index]
  if(!node.value||typeof node.value!=='object')continue
  const array=Array.isArray(node.value),keys=array?null:Object.keys(node.value),count=array?node.value.length:keys.length
  const range=pageRange(count,pages.get(JSON.stringify(node.path))??1,PREVIEW_PAGE_SIZE)
  const cost=range.end-range.start
  if(node.depth>=EXPANSION_DEPTH_LIMIT||cost>remaining){limited=true;continue}
  paths.add(JSON.stringify(node.path));remaining-=cost
  for(const [key,child] of childEntries(node.value,range,keys))if(child&&typeof child==='object')queue.push({value:child,path:[...node.path,key],depth:node.depth+1})
 }
 return {paths,limited}
}

// Use the same page, depth and node limits as expansion itself.
export function hasExpandableArray(value, path, pages) {
  const queue = [{ value, path, depth: 0 }]
  let remaining = EXPANSION_NODE_BUDGET - 1
  for (const node of queue) {
    if (!node.value || typeof node.value !== 'object' || node.depth >= EXPANSION_DEPTH_LIMIT) continue
    const array = Array.isArray(node.value)
    const keys = array ? null : Object.keys(node.value)
    const range = pageRange(array ? node.value.length : keys.length,
      pages.get(JSON.stringify(node.path)) ?? 1, PREVIEW_PAGE_SIZE)
    const cost = range.end - range.start
    if (cost > remaining) continue
    if (array && cost) return true
    remaining -= cost
    for (const [key, child] of childEntries(node.value, range, keys)) {
      if (child && typeof child === 'object') queue.push({ value: child, path: [...node.path, key], depth: node.depth + 1 })
    }
  }
  return false
}
