<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { readBoundedText } from '../workbench/response.js'
import { catalogPage, catalogUses, validateEntityCatalog } from './identifierCatalog.js'
const props=defineProps({configuration:Object,authentication:Object,operations:Array})
const emit=defineEmits(['open-operation'])
const dialog=ref(null),trigger=ref(null),entries=ref([]),selected=ref(null),query=ref(''),page=ref(1),pending=ref(false),error=ref('')
let controller
const result=computed(()=>catalogPage(entries.value,query.value,page.value))
const uses=computed(()=>selected.value?catalogUses(selected.value,props.operations):[])
watch(query,()=>page.value=1)
watch(()=>[props.configuration?.entityCatalogUrl,props.configuration?.workspaceId,props.authentication?.apiRevision('local')],()=>{controller?.abort();dialog.value?.close();entries.value=[];selected.value=null})
onScopeDispose(()=>controller?.abort())
async function open(){
 dialog.value.showModal();pending.value=true;error.value='';controller?.abort();controller=new AbortController()
 const job=controller,signal=job.signal,timeout=setTimeout(()=>job.abort(),20000)
 try{
  const response=await (props.authentication?.metadataFetch(props.configuration.entityCatalogUrl,'local',{signal})??fetch(props.configuration.entityCatalogUrl,{signal}))
  if(!response.ok)throw new Error('Could not load entity catalog.')
  const {text}=await readBoundedText(response,{signal,responseLimitBytes:5*1024*1024}),data=JSON.parse(text)
  validateEntityCatalog(data)
  if(!signal.aborted)entries.value=data
 }catch(cause){if(!signal.aborted)error.value=cause.message;else error.value='Catalog loading stopped.'}finally{clearTimeout(timeout);if(controller===job)pending.value=false}
}
async function closed(){controller?.abort();await nextTick();trigger.value?.focus()}
function openOperation(operation){dialog.value.close();emit('open-operation',operation)}
</script>
<template>
 <button v-if="configuration?.entityCatalogUrl" ref="trigger" type="button" class="secondary" @click="open">Models and identifiers</button>
 <Teleport to="body"><dialog ref="dialog" aria-label="Generated models and identifiers" @close="closed">
  <header><h3>Models and identifiers</h3><button type="button" @click="dialog.close()">Close</button></header>
  <p>Find where a value comes from and which requests accept it. No request is executed.</p>
  <p v-if="pending" role="status">Loading catalog…</p><p v-if="error" role="alert">{{error}}</p>
  <label>Find a model or identifier<input v-model="query" type="search"></label>
  <div class="catalog-layout"><section><ul><li v-for="item in result.items" :key="item.id"><button type="button" :aria-pressed="selected?.id===item.id" @click="selected=item">{{item.name}} <small>{{item.kind}}</small></button></li></ul>
  <button type="button" :disabled="page===1" @click="page--">Previous</button><span> {{page}} / {{Math.max(1,Math.ceil(result.total/25))}} </span><button type="button" :disabled="page*25>=result.total" @click="page++">Next</button></section>
  <section v-if="selected"><h4>{{selected.name}}</h4><p v-if="!uses.length">No unambiguous operations in the current catalog.</p><ul><li v-for="(use,index) in uses" :key="index"><strong>{{use.direction==='response'?'Available from':'Accepted by'}}</strong> · {{use.location}} <code>{{use.pathLabel||'(whole value)'}}</code><button type="button" @click="openOperation(use.operation)">{{use.operation.name}}</button></li></ul></section></div>
 </dialog></Teleport>
</template>
<style scoped>
dialog{width:min(60rem,calc(100vw - 2rem));max-height:85dvh;overflow:auto;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:.6rem;padding:1rem}dialog::backdrop{background:#0005}header{display:flex;align-items:center;justify-content:space-between}h3{margin:0}p{font-size:.85rem}label{display:grid;gap:.3rem}.catalog-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem}ul{list-style:none;padding:0}li{padding:.35rem 0;overflow-wrap:anywhere}li button{max-width:100%;overflow-wrap:anywhere}small{color:var(--muted)}@media(max-width:760px){.catalog-layout{grid-template-columns:1fr}}
</style>
