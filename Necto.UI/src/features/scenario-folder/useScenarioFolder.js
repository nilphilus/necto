import { computed, reactive, toValue, watch, onScopeDispose } from 'vue'
import { workspaceIdentity } from '../workbench/workspaceIdentity.js'
import { notifyWorkspaceImport } from '../workbench/workspaceUpdates.js'
import { canonicalScenario, sharedDefinition, parseShared, serializeShared, sharedFileName, scenarioKey, FILE_LIMIT } from './format.js'
import { scanDirectory, scenarioDirectory, readScenarioFile, writeScenarioFile } from './directory.js'
import { contentRevision, sharedOrigin } from './origin.js'
import { folderHandles } from './handles.js'
export function useScenarioFolder(configuration,operations,locked,options={}) {
 const platform=options.platform??globalThis,storage=options.storage??platform.localStorage,handles=options.handles??folderHandles
 const supported=typeof platform.showDirectoryPicker==='function'&&platform.isSecureContext!==false
 const state=reactive({supported,connected:false,ready:false,restoring:false,pending:false,name:'',entries:[],error:'',notice:'',remembered:false})
 const key=computed(()=>workspaceIdentity(toValue(configuration)))
 let directory,epoch=0,baselines=new Map()
 onScopeDispose(()=>{epoch++;directory=undefined;baselines.clear()})
 const assertCurrent=(token,current)=>{if(token!==epoch||current!==key.value)throw new Error('The API workspace changed. Reopen the folder for the current API.')}
 async function permission(handle,prompt=false){if(!handle.queryPermission)return;let value=await handle.queryPermission({mode:'readwrite'});if(value!=='granted'&&prompt)value=await handle.requestPermission({mode:'readwrite'});if(value!=='granted')throw new Error('Folder access needs permission. Use Reconnect to allow access again.')}
 async function perform(action){
  if(state.pending||state.restoring)return null
  state.error='';state.notice=''
  if(toValue(locked)){state.error='Wait for active requests or scenario runs before changing folder data.';return null}
  if(!key.value){state.error='Load an API before using a scenario folder.';return null}
  const token=epoch,current=key.value;state.pending=true
  try{return await action(()=>assertCurrent(token,current),current)}catch(error){if(token===epoch&&error.name!=='AbortError')state.error=error.message;return null}finally{state.pending=false}
 }
 watch(key,async current=>{
  const token=++epoch;directory=undefined;baselines=new Map();Object.assign(state,{connected:false,ready:false,name:'',entries:[],error:'',notice:'',remembered:false,restoring:false})
  if(!current||!supported)return
  state.restoring=true
  try{
   const remembered=await handles.get(current);if(token!==epoch||!remembered)return
   directory=remembered;Object.assign(state,{connected:true,remembered:true,name:remembered.name})
   // Restoring a preference never prompts for filesystem access.
   if(remembered.queryPermission&&await remembered.queryPermission({mode:'readwrite'})!=='granted')return
   const entries=await scanDirectory(remembered);assertCurrent(token,current);state.entries=entries;state.ready=true
  }catch(error){if(token===epoch&&directory)state.error=error.message}
  finally{if(token===epoch)state.restoring=false}
 },{immediate:true})
 function stopRestore(){if(state.restoring&&!state.pending){epoch++;state.restoring=false}}
 async function choose(){stopRestore();return perform(async(guard,current)=>{
  if(!supported)throw new Error('This browser cannot select local folders. Import or download team files instead.')
  const selected=await platform.showDirectoryPicker({id:'necto-scenarios',mode:'readwrite'});guard();await permission(selected,true);guard()
  directory=selected;baselines.clear();Object.assign(state,{connected:true,ready:false,name:selected.name,entries:[]})
  try{await handles.set(current,selected);guard();state.remembered=true}catch(error){guard();state.remembered=false;state.notice='Folder connected for this session; this browser could not remember it.'}
  const entries=await scanDirectory(selected);guard();state.entries=entries;state.ready=true
  state.notice||='Folder connected. After git pull, use Reload folder.'
  return true
 })}
 async function reload(){return perform(async guard=>{
  if(!directory)throw new Error('Choose a scenario folder first.')
  await permission(directory,true);guard();state.ready=false
  const entries=await scanDirectory(directory);guard();state.entries=entries;state.ready=true;state.notice='Folder reloaded. Import a file to update its saved browser definition.';return true
 })}
 async function disconnect(){stopRestore();return perform(async(guard,current)=>{
  let forgotten=true;try{await handles.remove(current)}catch{forgotten=false}
  guard();directory=undefined;baselines.clear();Object.assign(state,{connected:false,ready:false,name:'',entries:[],remembered:false});state.notice=forgotten?'Folder disconnected. Files and browser scenarios were kept.':'Disconnected for this session. This browser could not remove the remembered folder preference. Files were kept.';return true
 })}
 function browserCollection(kind,current){return 'necto:'+(kind==='builder'?'scenario-builder:':'scenarios:')+current}
 function importDefinition(file,current,guard){
  const collectionKey=browserCollection(file.kind,current),property=file.kind==='builder'?'blueprints':'scenarios',before=storage.getItem(collectionKey)
  const stored=before?JSON.parse(before):{version:1,[property]:[]}
  if(stored.version!==1||!Array.isArray(stored[property]))throw new Error('The saved browser collection is invalid. Export or repair it before importing.')
  const existing=stored[property].map(item=>{const definition=canonicalScenario(file.kind,item),origin=sharedOrigin(item._sharedSource);return origin?{...definition,_sharedSource:origin}:definition})
  if(new Set(existing.map(item=>item.id)).size!==existing.length)throw new Error('The browser collection contains duplicate IDs.')
  const previous=existing.find(item=>item.id===file.scenario.id)
  if(previous&&JSON.stringify(canonicalScenario(file.kind,previous))!==JSON.stringify(canonicalScenario(file.kind,file.scenario))&&!platform.confirm(`Replace the saved browser definition “${previous.name}”? Unsaved drafts are kept. No request will run.`))return false
  const next=[...existing.filter(item=>item.id!==file.scenario.id),file.scenario]
  if(next.length>100)throw new Error('A browser scenario collection supports at most 100 definitions.')
  const text=JSON.stringify({version:1,[property]:next})
  if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('The browser collection would exceed 2 MiB. Remove or export some saved definitions first.')
  guard();if(storage.getItem(collectionKey)!==before)throw new Error('Saved scenarios changed in another tab. Try importing again.')
  storage.setItem(collectionKey,text);notifyWorkspaceImport([collectionKey]);return true
 }
 async function importEntry(entry){return perform(async(guard,current)=>{
  if(!directory)throw new Error('Reconnect the scenario folder first.')
  await permission(directory,true);guard()
  const subdirectory=await scenarioDirectory(directory);if(!subdirectory)throw new Error('The scenario folder was removed. Reload folder.')
  const file=await readScenarioFile(subdirectory,entry.name);guard()
  if(file.text!==entry.text)throw new Error('The file changed since it was listed. Reload folder before importing.')
  const parsed=parseShared(file.text);parsed.scenario._sharedSource={kind:parsed.kind,id:parsed.scenario.id,revision:await contentRevision(file.text)};guard()
  if(!importDefinition(parsed,current,guard))return null
  baselines.set(scenarioKey(parsed.kind,parsed.scenario.id),{text:file.text,name:entry.name})
  state.notice=`Imported “${parsed.scenario.name}”. Available in saved ${parsed.kind==='builder'?'Builder scenarios':'scenarios'}. Unsaved drafts were kept.`
  return parsed
 })}
 async function importFile(file){return perform(async(guard,current)=>{
  if(!file)return null
  if(file.size>FILE_LIMIT)throw new Error('A shared scenario file is limited to 2 MiB.')
  const text=await file.text(),parsed=parseShared(text);parsed.scenario._sharedSource={kind:parsed.kind,id:parsed.scenario.id,revision:await contentRevision(text)};guard()
  if(!importDefinition(parsed,current,guard))return null
  state.notice=`Imported “${parsed.scenario.name}” into this browser. No request was sent.`;return parsed
 })}
 function bindOrigin(kind,source,origin) {
  source._sharedSource=origin
  const collectionKey=browserCollection(kind,key.value),property=kind==='builder'?'blueprints':'scenarios'
  try {
   const raw=storage.getItem(collectionKey);if(!raw)return
   const stored=JSON.parse(raw),item=stored[property]?.find(item=>item.id===source.id)
   if(item&&JSON.stringify(canonicalScenario(kind,item))===JSON.stringify(canonicalScenario(kind,source))){item._sharedSource=origin;storage.setItem(collectionKey,JSON.stringify(stored));notifyWorkspaceImport([collectionKey])}
  }catch{/* The disk save remains valid if optional browser provenance cannot be persisted. */}
 }
 async function save(kind,source){return perform(async guard=>{
  if(!directory)throw new Error('Choose a scenario folder in Settings → Workspace first.')
  const catalog=toValue(operations),scenario=sharedDefinition(kind,source,catalog),text=serializeShared(kind,scenario)
  await permission(directory,true);guard()
  const entries=await scanDirectory(directory);guard()
  const id=scenarioKey(kind,scenario.id),existing=entries.find(entry=>scenarioKey(entry.kind,entry.scenario.id)===id),baseline=baselines.get(id)
  if(baseline&&!existing)throw new Error('This scenario file was removed from disk. Review the deletion before saving a new copy.')
  const origin=sharedOrigin(source._sharedSource),basedOnFile=origin?.kind===kind&&origin.id===scenario.id
  if(existing&&!basedOnFile){
   if(serializeShared(existing.kind,existing.scenario)!==text)throw new Error('This scenario already exists in the folder. Import its current version before saving changes. Nothing was overwritten.')
   const revision=await contentRevision(existing.text);guard();baselines.set(id,{name:existing.name,text:existing.text});bindOrigin(kind,source,{kind,id:scenario.id,revision});state.entries=entries;state.notice='The folder file is already up to date.';return existing
  }
  if(existing&&basedOnFile&&await contentRevision(existing.text)!==origin.revision)throw new Error('The scenario file changed on disk. Reload and import its current version before saving. Nothing was overwritten.')
  const name=existing?.name??await sharedFileName(kind,scenario);guard()
  const subdirectory=await scenarioDirectory(directory,true);guard()
  await writeScenarioFile(subdirectory,name,text,existing?.text,()=>{guard();if(toValue(operations)!==catalog)throw new Error('The API catalog changed while preparing the file. Try saving again.')})
  const revision=await contentRevision(text);guard();bindOrigin(kind,source,{kind,id:scenario.id,revision});guard();const entry={name,text,kind,scenario};baselines.set(id,{name,text});state.entries=[...entries.filter(entry=>scenarioKey(entry.kind,entry.scenario.id)!==id),entry].sort((a,b)=>a.scenario.name.localeCompare(b.scenario.name));state.ready=true
  state.notice=`Saved “${scenario.name}” to ${state.name}/necto-scenarios/. Static values are included; review before committing.`;return entry
 })}
 async function download(kind,source){return perform(async guard=>{
  const scenario=sharedDefinition(kind,source,toValue(operations)),text=serializeShared(kind,scenario),name=await sharedFileName(kind,scenario);guard()
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=platform.document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  state.notice='Downloaded a team scenario file. Static values are included; review before sharing.';return true
 })}
 return Object.assign(state,{choose,reload,disconnect,importEntry,importFile,save,download})
}
