<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { readBoundedText } from '../workbench/response.js'
import DescriptionHelp from '../workbench/DescriptionHelp.vue'
import { operationTasks, validateOperationTasks } from './operationTasks.js'
const props=defineProps({configuration:Object,authentication:Object,operations:Array})
const emit=defineEmits(['open-operation'])
const trigger=ref(null),dialog=ref(null),entries=ref([]),query=ref(''),page=ref(1),pending=ref(false),error=ref('')
let controller
const result=computed(()=>operationTasks(entries.value,props.operations,query.value,page.value))
watch(query,()=>page.value=1)
watch(()=>[props.configuration?.operationRolesUrl,props.configuration?.workspaceId,props.authentication?.apiRevision('local')],()=>{controller?.abort();dialog.value?.close();entries.value=[]})
onScopeDispose(()=>controller?.abort())
async function open(){
 dialog.value.showModal();controller?.abort();const job=controller=new AbortController(),signal=job.signal,timeout=setTimeout(()=>job.abort(),20000);pending.value=true;error.value=''
 try{
  const response=await(props.authentication?.metadataFetch(props.configuration.operationRolesUrl,'local',{signal})??fetch(props.configuration.operationRolesUrl,{signal}))
  if(!response.ok)throw new Error('Could not load operation purposes.')
  const {text}=await readBoundedText(response,{signal,responseLimitBytes:5*1024*1024}),data=validateOperationTasks(JSON.parse(text))
  if(!signal.aborted)entries.value=data
 }catch(cause){if(controller===job)error.value=signal.aborted?'Loading stopped.':cause.message}finally{clearTimeout(timeout);if(controller===job)pending.value=false}
}
async function closed(){controller?.abort();await nextTick();trigger.value?.focus()}
function choose(operation){dialog.value.close();emit('open-operation',operation)}
</script>
<template>
 <button v-if="configuration?.operationRolesUrl" ref="trigger" type="button" class="secondary task-trigger" aria-label="Find by task" title="Find by task" @click="open">▤</button>
 <Teleport to="body"><dialog ref="dialog" aria-label="Find API requests by task" @close="closed">
  <header><h3>What do you want to do?</h3><button type="button" @click="dialog.close()">Close</button></header>
  <p>Purposes declared by the API author. Opening a request does not send it.</p>
  <label>Find a task<input v-model="query" type="search" placeholder="Find invoices, create a customer…"></label>
  <p v-if="pending" role="status">Loading tasks…</p><p v-if="error" role="alert">{{error}}</p>
  <ul><li v-for="entry in result.items" :key="JSON.stringify([entry.operationId,entry.entityId,entry.role])"><strong>{{entry.role}} {{entry.entityName}}</strong><DescriptionHelp :label="'About task '+entry.role+' '+entry.entityName" :description="entry.description"/><span class="method" :data-method="entry.operation.method">{{entry.operation.method}}</span><button type="button" @click="choose(entry.operation)">Open {{entry.operation.name}}</button></li></ul>
  <p v-if="!pending&&!error&&!result.total">No declared tasks match the current catalog.</p>
  <button type="button" :disabled="page===1" @click="page--">Previous</button><span> {{page}} / {{Math.max(1,Math.ceil(result.total/25))}} </span><button type="button" :disabled="page*25>=result.total" @click="page++">Next</button>
 </dialog></Teleport>
</template>
<style scoped>
.task-trigger{font-size:.9rem;padding:.15rem .35rem}dialog{width:min(45rem,calc(100vw - 2rem));max-height:85dvh;overflow:auto;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:.6rem;padding:1rem}dialog::backdrop{background:#0005}header{display:flex;align-items:center;justify-content:space-between}h3{margin:0}p{font-size:.85rem}label{display:grid;gap:.3rem}ul{list-style:none;padding:0}li{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--line)}li strong{flex:1;overflow-wrap:anywhere}li button{max-width:100%;overflow-wrap:anywhere}
</style>
