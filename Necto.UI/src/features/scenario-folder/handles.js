const DATABASE='necto-scenario-folders'
function database(){return new Promise((resolve,reject)=>{
 let failed=false
 const request=indexedDB.open(DATABASE,1)
 request.onupgradeneeded=()=>request.result.createObjectStore('handles')
 request.onblocked=()=>{failed=true;reject(new Error('Folder preferences are blocked by another browser tab.'))}
 request.onerror=()=>{failed=true;reject(request.error)}
 request.onsuccess=()=>{if(failed)request.result.close();else resolve(request.result)}
})}
async function transaction(mode,action){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('handles',mode),request=action(tx.objectStore('handles'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
export const folderHandles={get:key=>transaction('readonly',store=>store.get(key)),set:(key,handle)=>transaction('readwrite',store=>store.put(handle,key)),remove:key=>transaction('readwrite',store=>store.delete(key))}
