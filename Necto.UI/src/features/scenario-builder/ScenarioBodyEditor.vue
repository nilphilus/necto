<script setup>
import { computed, ref, provide, nextTick } from 'vue'
import { bodyContent, isJson } from '../workbench/body.js'
import BodyEditor from '../workbench/BodyEditor.vue'
import BodySchemaField from './BodySchemaField.vue'
import ExpressionEditor from './ExpressionEditor.vue'
import { BODY_VALUE } from './bodySchema.js'
import StepInputs from './StepInputs.vue'
const props=defineProps({step:Object,operation:Object,steps:Array,operations:Array,variables:Array,results:Array,disabled:Boolean})
function rawMode(){if(Object.keys(props.step.request.bodyFieldEdits??{}).length&&!window.confirm('Discard unfinished number edits and open the last valid JSON?'))return;delete props.step.request.bodyFieldEdits;mode.value='raw'}
const mode=ref('fields'),expanded=ref(false),dialog=ref(null),dialogHost=ref(null)
async function expand(){dialog.value.showModal();expanded.value=true;await nextTick()}
const media=computed(()=>bodyContent(props.operation,props.step.request))
const json=computed(()=>isJson(media.value?.[0]??''))
const parsed=computed(()=>{try{return {value:props.step.request.body.trim()?JSON.parse(props.step.request.body):undefined,error:''}}catch{return {value:undefined,error:'Body is not valid JSON. Open Raw JSON to fix it before editing fields.'}}})
const parseError=computed(()=>parsed.value.error)
const bodyInputs = computed(() => props.step.inputs.filter(input => input.location === 'body'))
const expressions = computed(() => bodyInputs.value.filter(input => input.source === 'expression'))
const selectedExpressionPath = ref(null)
const selectedExpression = computed(() => expressions.value.find(input => input.pointer === selectedExpressionPath.value))
const wholeBodySources = computed(() => /^(?:text\/|application\/(?:.+\+)?xml)/i.test(media.value?.[0] ?? ''))
provide(BODY_VALUE,computed(()=>parsed.value.value))
</script>
<template>
 <section class="scenario-body-editor" aria-label="Request body schema">
  <header><h4>Request body</h4><div v-if="json" role="group" aria-label="Body editing mode"><button type="button" class="secondary" :aria-pressed="mode==='fields'" @click="mode='fields'">JSON builder</button><button type="button" class="secondary" :aria-pressed="mode==='raw'" @click="rawMode">Raw JSON</button><button type="button" class="secondary" @click="expand">Expand body editor</button></div></header>
  <Teleport :disabled="!expanded" :to="dialogHost??'body'"><div class="body-editor-content"><p class="body-guidance" v-if="json">Edit values inside the JSON structure. Choose a source beside each value. Payload expressions take priority unless you allow preset overrides in the run review.</p>
  <details v-if="expressions.length" class="body-sources">
    <summary>Expression targets ({{ expressions.length }})</summary>
    <ul>
      <li v-for="input in expressions" :key="input.pointer">
        <button type="button" class="secondary"
          :aria-expanded="selectedExpression === input"
          @click="selectedExpressionPath = selectedExpression === input ? null : input.pointer">
          Edit expression <code>{{ input.pointer || '(whole body)' }}</code>
        </button>
      </li>
    </ul>
    <ExpressionEditor v-if="selectedExpression" :key="selectedExpression.pointer"
      :input="selectedExpression" :step="step" :steps="steps" :variables="variables" :disabled="disabled" />
  </details>
  <div v-if="json&&mode==='fields'">
   <p v-if="parseError" class="error" role="alert">{{parseError}}</p>
   <BodySchemaField v-else :key="step.id+media[0]" :step="step" :operation="operation" :raw="media[1].schema??{}" name="Body" :required="!!operation.requestBody.required" :steps="steps" :operations="operations" :variables="variables" :results="results" :disabled="disabled" @raw="rawMode" />
  </div>
  <div v-else>
   <p v-if="bodyInputs.length" class="body-guidance">The text below is the saved template. Run-time sources replace their target values before sending.</p>
   <fieldset class="raw-body" :disabled="disabled"><BodyEditor :operation="operation" :session="step.request"><label v-if="json" class="raw-json-label">Raw request body<textarea v-model="step.request.body" aria-label="Raw request body" spellcheck="false" rows="8" /></label></BodyEditor></fieldset>
   <details v-if="json || wholeBodySources || bodyInputs.length" class="advanced-body-bindings" :open="!json && bodyInputs.length > 0"><summary>Advanced body bindings</summary><StepInputs :step="step" :operation="operation" :steps="steps" :operations="operations" :variables="variables" :results="results" :body-only="true" :disabled="disabled" /></details>
  </div>
 </div></Teleport>
  <dialog ref="dialog" class="body-editor-dialog" aria-labelledby="expanded-body-title" @close="expanded=false"><div class="dialog-shell"><header><h3 id="expanded-body-title">Configure request body</h3><div><button type="button" class="secondary" :aria-pressed="mode==='fields'" @click="mode='fields'">JSON builder</button><button type="button" class="secondary" :aria-pressed="mode==='raw'" @click="rawMode">Raw JSON</button><button type="button" class="secondary" aria-label="Close body editor" @click="dialog.close()">Done</button></div></header><div ref="dialogHost" class="dialog-host" /></div></dialog>
 </section>
</template>
<style scoped>
.body-sources { margin-block: .5rem; padding: .4rem .55rem; background: var(--accent-soft); border-radius: .35rem; font-size: .75rem; }
.body-sources ul { margin: .3rem 0; padding-inline-start: 1.1rem; overflow-wrap: anywhere; }

.raw-json-label { display:grid; gap:.35rem; font-size:.75rem; }.raw-json-label textarea { width:100%; min-width:0; font: .75rem/1.5 ui-monospace,Consolas,monospace; }.body-editor-content { container-type:inline-size; }.body-editor-dialog { width:min(64rem,calc(100% - 2rem)); max-height:85dvh; padding:0; overflow:hidden; border:1px solid var(--line); border-radius:.7rem; background:var(--surface); color:inherit; }.body-editor-dialog::backdrop { background:#17342640; }.dialog-shell { display:flex; flex-direction:column; max-height:85dvh; }.dialog-shell > header { padding:.85rem 1rem; border-bottom:1px solid var(--line); flex:none; }.dialog-shell h3 { margin:0; font-size:1rem; }.dialog-host { overflow:auto; min-height:0; padding:0 1rem 1rem; }.scenario-body-editor { border-top:1px solid var(--line); margin-top:.8rem; padding-top:.7rem; min-width:0; }header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.5rem; }h4 { margin:0; font-size:.85rem; }header > div { display:flex; gap:.3rem; font-size:.7rem; }header [aria-pressed=true] { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }.body-guidance { color:var(--muted); font-size:.7rem; line-height:1.5; }.raw-body { border:0; padding:0; min-width:0; margin-top:.6rem; }.advanced-body-bindings { font-size:.75rem; margin:.7rem 0; }summary { cursor:pointer; margin-bottom:.5rem; }.error { font-size:.75rem; }
</style>
