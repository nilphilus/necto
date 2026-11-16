export function memoryFolder(name='team-repo') {
 const files=new Map(),directories=new Map(),identities=new Map()
 const root={kind:'directory',name,permission:'granted',permissionRequests:0,
  async queryPermission(){return this.permission},
  async requestPermission(){this.permissionRequests++;return this.permission},
  async getDirectoryHandle(name,{create=false}={}){
   if(!directories.has(name)){
    if(!create)throw new DOMException('Missing directory','NotFoundError')
    directories.set(name,memoryFolder(name))
   }
   return directories.get(name)
  },
  async getFileHandle(name,{create=false}={}){
   if(!files.has(name)){
    if(!create)throw new DOMException('Missing file','NotFoundError')
    files.set(name,'');identities.set(name,Symbol(name))
   }
   if(!identities.has(name))identities.set(name,Symbol(name))
   return {kind:'file',name,identity:identities.get(name),async isSameEntry(other){return this.identity===other.identity},
    async getFile(){return new Blob([files.get(name)])},
    async createWritable(){
     root.onWrite?.(name);let next
     return {async write(text){next=text},async close(){files.set(name,next)},async abort(){root.aborts=(root.aborts??0)+1}}
    }
   }
  },
  async *entries(){for(const name of files.keys())yield [name,await root.getFileHandle(name)]},
  files,directories
 }
 return root
}
export function memoryStorage(){const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key),entries}}
