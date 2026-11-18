<script setup>
import { computed } from 'vue'
import { validateExpression } from './expression.js'
const props=defineProps({input:Object,step:Object,steps:Array,variables:{type:Array,default:()=>[]},disabled:Boolean})
const error=computed(()=>{try{validateExpression(props.input);return ''}catch(cause){return cause.message}})
function add(){props.input.bindings.push({name:'value'+(props.input.bindings.length+1),source:'response',stepId:'',responsePointer:''})}
</script>
<template>
 <fieldset class="expression-editor" :disabled="disabled" aria-label="Expression configuration">
  <label>Expression<textarea v-model="input.expression" aria-label="Expression code" rows="5" spellcheck="false" maxlength="4096" placeholder="switch (invoice.status) { case 'draft': return 'review'; default: return 'skip'; }" /></label>
  <div v-for="(binding,index) in input.bindings" :key="index" class="expression-binding">
   <label>Name<input v-model="binding.name" aria-label="Expression input name" maxlength="64" placeholder="invoice"></label>
   <label>Source<select v-model="binding.source" aria-label="Expression input source"><option value="response">Earlier response</option><option value="variable">Shared variable</option></select></label>
   <template v-if="binding.source==='response'"><label>Step<select v-model="binding.stepId" aria-label="Expression source step"><option value="" disabled>Choose step</option><option v-for="other in steps.filter(item=>item.id!==step.id)" :key="other.id" :value="other.id">{{other.label}}</option></select></label><label>JSON Pointer<input v-model="binding.responsePointer" aria-label="Expression response pointer" placeholder="/status · empty = whole JSON"></label></template>
   <label v-else>Variable<select v-model="binding.variableId" aria-label="Expression variable"><option value="" disabled>Choose variable</option><option v-for="variable in variables" :key="variable.id" :value="variable.id">{{variable.name}}</option></select></label>
   <button type="button" class="secondary" :aria-label="'Remove expression input '+(index+1)" @click="input.bindings.splice(index,1)">×</button>
  </div>
  <button type="button" class="secondary" :disabled="input.bindings.length>=16" @click="add">Add expression input</button>
  <p v-if="error" class="error" role="status">{{error}}</p>
  <small>Read selected inputs by name. Return a JSON value. Supports const, if, switch and basic operators; no functions, loops, imports or browser access. Presets override matching fields. Code is saved as written; keep secrets in local authorization or human inputs.</small>
 </fieldset>
</template>
<style scoped>
.expression-editor { display:grid; gap:.45rem; border:0; padding:.5rem 0; margin:0; min-width:0; width:100%; }label { display:grid; gap:.2rem; min-width:0; font:.73rem system-ui; }textarea { width:100%; min-width:0; padding:.4rem; font:.75rem/1.5 ui-monospace,monospace; resize:vertical; }input,select { min-width:0; width:100%; padding:.3rem; }.expression-binding { display:flex; flex-wrap:wrap; align-items:end; gap:.35rem; }.expression-binding label { flex:1 1 7rem; }.expression-editor>button { justify-self:start; }small { color:var(--muted); font:.68rem/1.5 system-ui; }.error { margin:0; font:.72rem system-ui; }
</style>
