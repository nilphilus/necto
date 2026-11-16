<script setup>
import { computed, ref, provide, nextTick } from 'vue'
import { bodyContent, isJson } from '../workbench/body.js'
import BodyEditor from '../workbench/BodyEditor.vue'
import BodySchemaField from './BodySchemaField.vue'
import { BODY_VALUE } from './bodySchema.js'
import StepInputs from './StepInputs.vue'
const props=defineProps({step:Object,operation:Object,steps:Array,operations:Array,variables:Array,results:Array,disabled:Boolean})
const mode=ref('fields'),expanded=ref(false),dialog=ref(null),dialogHost=ref(null)
async function expand(){dialog.value.showModal();expanded.value=true;await nextTick()}
const media=computed(()=>bodyContent(props.operation,props.step.request))
const json=computed(()=>isJson(media.value?.[0]??''))
const parsed=computed(()=>{try{return {value:props.step.request.body.trim()?JSON.parse(props.step.request.body):undefined,error:''}}catch{return {value:undefined,error:'Body is not valid JSON. Open Raw JSON to fix it before editing fields.'}}})
const parseError=computed(()=>parsed.value.error)
provide(BODY_VALUE,computed(()=>parsed.value.value))
</script>
<template>
 <section class="scenario-body-editor" aria-label="Request body schema">
  <header><h4>Request body</h4><div v-if="json" role="group" aria-label="Body editing mode"><button type="button" class="secondary" :aria-pressed="mode==='fields'" @click="mode='fields'">Fields</button><button type="button" class="secondary" :aria-pressed="mode==='raw'" @click="mode='raw'">Raw JSON</button><button type="button" class="secondary" @click="expand">Expand body editor</button></div></header>
  <Teleport :disabled="!expanded" :to="dialogHost??'body'"><div class="body-editor-content"><p class="body-guidance" v-if="json">Choose a value source per field. Run presets override matching values. Expand objects and add array items as needed.</p>
  <div v-if="json&&mode==='fields'">
   <p v-if="parseError" class="error" role="alert">{{parseError}}</p>
   <BodySchemaField v-else :key="step.id+media[0]" :step="step" :operation="operation" :raw="media[1].schema??{}" name="Body" :required="!!operation.requestBody.required" :steps="steps" :operations="operations" :variables="variables" :results="results" :disabled="disabled" @raw="mode='raw'" />
  </div>
  <div v-else>
   <fieldset class="raw-body" :disabled="disabled"><BodyEditor :operation="operation" :session="step.request" /></fieldset>
   <details v-if="json" class="advanced-body-bindings"><summary>Advanced body bindings</summary><StepInputs :step="step" :operation="operation" :steps="steps" :operations="operations" :variables="variables" :body-only="true" :disabled="disabled" /></details>
  </div>
 </div></Teleport>
  <dialog ref="dialog" class="body-editor-dialog" aria-labelledby="expanded-body-title" @close="expanded=false"><div class="dialog-shell"><header><h3 id="expanded-body-title">Configure request body</h3><div><button type="button" class="secondary" :aria-pressed="mode==='fields'" @click="mode='fields'">Fields</button><button type="button" class="secondary" :aria-pressed="mode==='raw'" @click="mode='raw'">Raw JSON</button><button type="button" class="secondary" aria-label="Close body editor" @click="dialog.close()">Done</button></div></header><div ref="dialogHost" class="dialog-host" /></div></dialog>
 </section>
</template>
<style scoped>
.body-editor-content { container-type:inline-size; }.body-editor-dialog { width:min(64rem,calc(100% - 2rem)); max-height:85dvh; padding:0; overflow:hidden; border:1px solid var(--line); border-radius:.7rem; background:var(--surface); color:inherit; }.body-editor-dialog::backdrop { background:#17342640; }.dialog-shell { display:flex; flex-direction:column; max-height:85dvh; }.dialog-shell > header { padding:.85rem 1rem; border-bottom:1px solid var(--line); flex:none; }.dialog-shell h3 { margin:0; font-size:1rem; }.dialog-host { overflow:auto; min-height:0; padding:0 1rem 1rem; }.scenario-body-editor { border-top:1px solid var(--line); margin-top:.8rem; padding-top:.7rem; min-width:0; }header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.5rem; }h4 { margin:0; font-size:.85rem; }header > div { display:flex; gap:.3rem; font-size:.7rem; }header [aria-pressed=true] { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }.body-guidance { color:var(--muted); font-size:.7rem; line-height:1.5; }.raw-body { border:0; padding:0; min-width:0; margin-top:.6rem; }.advanced-body-bindings { font-size:.75rem; margin:.7rem 0; }summary { cursor:pointer; margin-bottom:.5rem; }.error { font-size:.75rem; }
</style>
