import { pointerParts, readPointer } from './pointers.js'
export function validateRandom(source) {
 if(typeof source.stepId!=='string'||!source.stepId)throw new Error('Pick random needs a source step.')
 pointerParts(source.responsePointer);pointerParts(source.itemPointer)
}
export const randomSnapshot=source=>({stepId:source.stepId,responsePointer:source.responsePointer,itemPointer:source.itemPointer})
// Rejection sampling avoids modulo bias. Never fall back to Math.random.
export function randomIndex(length,fill=values=>globalThis.crypto.getRandomValues(values)) {
 if(!Number.isInteger(length)||length<1||length>0xffffffff)throw new Error('Pick random needs a non-empty array.')
 const range=2**32,limit=Math.floor(range/length)*length,word=new Uint32Array(1)
 for(let attempt=0;attempt<16;attempt++){
  try{fill(word)}catch{throw new Error('Secure random selection is unavailable.')}
  if(word[0]<limit)return word[0]%length
 }
 throw new Error('Pick random could not obtain a random index. Try again.')
}
export function pickRandom(json,source,index=randomIndex) {
 const array=readPointer(json,source.responsePointer)
 if(!Array.isArray(array)||!array.length)throw new Error('Pick random needs a non-empty JSON array at the selected response path.')
 const selected=index(array.length)
 if(!Number.isInteger(selected)||selected<0||selected>=array.length||!Object.hasOwn(array,selected))throw new Error('Pick random could not select an array item.')
 return readPointer(array[selected],source.itemPointer)
}
