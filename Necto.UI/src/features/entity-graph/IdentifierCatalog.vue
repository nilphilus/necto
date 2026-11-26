<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { catalogPage, catalogUses, catalogRelations } from './identifierCatalog.js'
const props=defineProps({available:Boolean,entries:Array,pending:Boolean,error:String,reload:Function,operations:Array})
const emit=defineEmits(['open-operation'])
const dialog=ref(null),trigger=ref(null),selected=ref(null),query=ref(''),page=ref(1)
const result=computed(()=>catalogPage(props.entries,query.value,page.value))
const uses=computed(()=>selected.value?catalogUses(selected.value,props.operations):[])
watch(query,()=>page.value=1)
watch(() => props.entries, () => { selected.value = null; page.value = 1 })
function open(){
  dialog.value.showModal()
  if (props.error) props.reload()
}
async function closed(){await nextTick();trigger.value?.focus()}
function openOperation(operation){dialog.value.close();emit('open-operation',operation)}
</script>
<template>
 <button v-if="available" ref="trigger" type="button" class="secondary" @click="open">Models and identifiers</button>
 <Teleport to="body"><dialog ref="dialog" aria-label="Generated models and identifiers" @close="closed">
  <header><h3>Models and identifiers</h3><button class="secondary" type="button" @click="dialog.close()">Close</button></header>
  <p>Find where a value comes from and which requests accept it. No request is executed.</p>
  <p v-if="pending" role="status">Loading catalog…</p><p v-if="error" role="alert">{{error}}</p>
  <label>Find a model or identifier<input v-model="query" type="search"></label>
  <div class="catalog-layout"><section><ul><li v-for="item in result.items" :key="item.id"><button class="secondary" type="button" :aria-pressed="selected?.id===item.id" @click="selected=item">{{item.name}} <small>{{item.kind}}</small></button></li></ul>
  <button class="secondary" type="button" :disabled="page===1" @click="page--">Previous</button><span> {{page}} / {{Math.max(1,Math.ceil(result.total/25))}} </span><button class="secondary" type="button" :disabled="page*25>=result.total" @click="page++">Next</button></section>
  <section v-if="selected"><h4>{{selected.name}}</h4><details v-if="catalogRelations(selected, entries).length" open><summary>Entity relations</summary><ul><li v-for="relation in catalogRelations(selected, entries)" :key="relation.property + relation.targetId"><p>{{relation.explanation}}</p><button class="secondary" type="button" @click="selected=relation.target">Explore {{relation.target.name}}</button></li></ul></details><p v-if="!uses.length">No unambiguous operations in the current catalog.</p><ul><li v-for="(use,index) in uses" :key="index"><strong>{{use.direction==='response'?'Available from':'Accepted by'}}</strong> · {{use.location}} <code>{{use.pathLabel||'(whole value)'}}</code><button class="secondary" type="button" @click="openOperation(use.operation)">{{use.operation.name}}</button></li></ul></section></div>
 </dialog></Teleport>
</template>
<style scoped>
dialog{width:min(60rem,calc(100vw - 2rem));max-height:85dvh;overflow:auto;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:.6rem;padding:1rem}dialog::backdrop{background:#0005}header{display:flex;align-items:center;justify-content:space-between}h3{margin:0}p{font-size:.85rem}label{display:grid;gap:.3rem}.catalog-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem}ul{list-style:none;padding:0}li{padding:.35rem 0;overflow-wrap:anywhere}li button{max-width:100%;overflow-wrap:anywhere}.catalog-layout button[aria-pressed="true"]{background:var(--accent);color:white}small{color:var(--muted)}@media(max-width:760px){.catalog-layout{grid-template-columns:1fr}}
</style>
