import { FILE_LIMIT,FOLDER_NAME,FILE_SUFFIX,parseShared,scenarioKey } from './format.js'
const missing=error=>error?.name==='NotFoundError'
export function scenarioFolderPath(root) {
 return root.name===FOLDER_NAME ? FOLDER_NAME : `${root.name}/${FOLDER_NAME}`
}
export async function scenarioDirectory(root,create=false) {
 if(root.name===FOLDER_NAME)return root
 try{return await root.getDirectoryHandle(FOLDER_NAME,{create})}catch(error){if(!create&&missing(error))return null;throw error}
}
export function managedFileName(name) {
 if(typeof name!=='string'||name.length>255||!name.endsWith(FILE_SUFFIX)||/[\/\\\x00-\x1f\x7f:]/.test(name))throw new Error('Invalid shared scenario filename. Use a portable filename inside the scenario subfolder.')
 return name
}
export async function readScenarioFile(directory,name) {
 managedFileName(name)
 const handle=await directory.getFileHandle(name),file=await handle.getFile()
 if(file.size>FILE_LIMIT)throw new Error(`${name}: file exceeds 2 MiB.`)
 return {text:await file.text(),size:file.size}
}
export async function scanDirectory(root, { onFileError } = {}) {
 const directory=await scenarioDirectory(root)
 if(!directory)return []
 const entries=[],ids=new Set();let total=0,visited=0,managed=0
 for await(const [name,handle] of directory.entries()){
  if(++visited>1000)throw new Error('The scenario subfolder has too many entries. Keep it dedicated to scenario files.')
  if(handle.kind!=='file'||!name.endsWith(FILE_SUFFIX))continue
  if(++managed>100)throw new Error('A scenario folder supports at most 100 managed files.')
  const file=await readScenarioFile(directory,name);total+=file.size
  if(total>20*1024*1024)throw new Error('Scenario folder files exceed the 20 MiB read budget.')
  let parsed
  try { parsed = parseShared(file.text) }
  catch (error) {
   const message = `${name}: ${error.message}`
   if (!onFileError) throw new Error(message)
   onFileError(message)
   continue
  }
  const key=scenarioKey(parsed.kind,parsed.scenario.id)
  if(ids.has(key))throw new Error(`${name}: duplicate scenario ID. Keep one file per scenario.`)
  ids.add(key);entries.push({name,text:file.text,...parsed})
 }
 return entries.sort((a,b)=>a.scenario.name.localeCompare(b.scenario.name))
}
async function unchangedFile(directory,name,handle,expected,phase) {
 const current=await directory.getFileHandle(name)
 if(typeof handle.isSameEntry!=='function'||!await handle.isSameEntry(current))throw new Error('The scenario file was replaced or moved. Nothing was overwritten.')
 const file=await handle.getFile()
 if(file.size>FILE_LIMIT||await file.text()!==expected)throw new Error(`The scenario file changed ${phase}. Nothing was overwritten.`)
}
export async function writeScenarioFile(directory,name,text,expected,guard=()=>{}) {
 managedFileName(name)
 if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')
 let handle,exists=true
 try{handle=await directory.getFileHandle(name)}catch(error){if(!missing(error))throw error;exists=false}
 if(expected!==undefined&&!exists)throw new Error('The scenario file was removed from disk. Reload and review the folder before saving.')
 if(exists){if(expected===undefined)throw new Error('The scenario file already exists. Nothing was overwritten.');await unchangedFile(directory,name,handle,expected,'on disk')}
 guard()
 if(!handle)handle=await directory.getFileHandle(name,{create:true})
 let writer
 try{
  writer=await handle.createWritable({mode:'exclusive'})
  await unchangedFile(directory,name,handle,expected??'','before writing')
  guard();await writer.write(text)
  await unchangedFile(directory,name,handle,expected??'','during writing')
  guard();await writer.close()
 }catch(error){try{await writer?.abort()}catch{/* Preserve the original write error. */}throw error}
}
