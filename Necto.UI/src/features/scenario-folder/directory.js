import { FILE_LIMIT,FOLDER_NAME,FILE_SUFFIX,parseShared,scenarioKey } from './format.js'
const missing=error=>error?.name==='NotFoundError'
export async function scenarioDirectory(root,create=false) {
 try{return await root.getDirectoryHandle(FOLDER_NAME,{create})}catch(error){if(!create&&missing(error))return null;throw error}
}
export async function readScenarioFile(directory,name) {
 const handle=await directory.getFileHandle(name),file=await handle.getFile()
 if(file.size>FILE_LIMIT)throw new Error(`${name}: file exceeds 2 MiB.`)
 return {text:await file.text(),size:file.size}
}
export async function scanDirectory(root) {
 const directory=await scenarioDirectory(root)
 if(!directory)return []
 const entries=[],ids=new Set();let total=0,visited=0
 for await(const [name,handle] of directory.entries()){
  if(++visited>1000)throw new Error('The scenario subfolder has too many entries. Keep it dedicated to scenario files.')
  if(handle.kind!=='file'||!name.endsWith(FILE_SUFFIX))continue
  if(entries.length>=100)throw new Error('A scenario folder supports at most 100 managed files.')
  const file=await readScenarioFile(directory,name);total+=file.size
  if(total>20*1024*1024)throw new Error('Scenario folder files exceed the 20 MiB read budget.')
  let parsed;try{parsed=parseShared(file.text)}catch(error){throw new Error(`${name}: ${error.message}`)}
  const key=scenarioKey(parsed.kind,parsed.scenario.id)
  if(ids.has(key))throw new Error(`${name}: duplicate scenario ID. Keep one file per scenario.`)
  ids.add(key);entries.push({name,text:file.text,...parsed})
 }
 return entries.sort((a,b)=>a.scenario.name.localeCompare(b.scenario.name))
}
export async function writeScenarioFile(directory,name,text,expected,guard=()=>{}) {
 let handle,exists=true
 try{handle=await directory.getFileHandle(name)}catch(error){if(!missing(error))throw error;exists=false}
 if(expected!==undefined&&!exists)throw new Error('The scenario file was removed from disk. Reload and review the folder before saving.')
 if(exists){const current=await readScenarioFile(directory,name);if(expected===undefined||current.text!==expected)throw new Error('The scenario file changed on disk. Reload and import its current version before saving. Nothing was overwritten.')}
 guard()
 if(!handle)handle=await directory.getFileHandle(name,{create:true})
 let writer
 try{
  writer=await handle.createWritable({mode:'exclusive'})
  const current=await readScenarioFile(directory,name)
  if(current.text!==(expected??''))throw new Error('The scenario file changed before writing. Nothing was overwritten.')
  guard();await writer.write(text);guard();await writer.close()
 }catch(error){try{await writer?.abort()}catch{/* Preserve the original write error. */}throw error}
}
