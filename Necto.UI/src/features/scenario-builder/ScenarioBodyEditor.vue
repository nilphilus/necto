<script setup>
import { computed, ref, provide, nextTick, watch } from 'vue'
import { bodyContent, isJson } from '../workbench/body.js'
import BodyEditor from '../workbench/BodyEditor.vue'
import BodySchemaField from './BodySchemaField.vue'
import { BODY_FIELD_EDITOR, BODY_SOURCE_LABELS, BODY_VALUE, inferVariant, pointer, schemaView } from './bodySchema.js'
import { pointerParts } from './pointers.js'
import { normalizeBodyFieldNames } from './bodyFieldNames.js'
import StepInputs from './StepInputs.vue'
const props=defineProps({step:Object,operation:Object,steps:Array,operations:Array,variables:Array,results:Array,disabled:Boolean})
function rawMode(){if(Object.keys(props.step.request.bodyFieldEdits??{}).length&&!window.confirm('Discard unfinished number edits and open the last valid JSON?'))return;delete props.step.request.bodyFieldEdits;selectedPath.value = null;mode.value='raw'}
const mode=ref('fields'),expanded=ref(false),dialog=ref(null),dialogHost=ref(null)
async function expand(){dialog.value.showModal();expanded.value=true;await nextTick()}
const media=computed(()=>bodyContent(props.operation,props.step.request))
const json=computed(()=>isJson(media.value?.[0]??''))
const parsed=computed(()=>{try{return {value:props.step.request.body.trim()?JSON.parse(props.step.request.body):undefined,error:''}}catch{return {value:undefined,error:'Body is not valid JSON. Open Raw JSON to fix it before editing fields.'}}})
const parseError=computed(()=>parsed.value.error)
const bodyInputs = computed(() => props.step.inputs.filter(input => input.location === 'body'))
const configuredOnly = ref(false)
const selectedPath = ref(null)
const bodyTree = ref(null)
const fieldPanel = ref(null)
const configuredToggle = ref(null)
let returnFocus
const selectedInput = computed(() => bodyInputs.value.find(input => input.pointer === selectedPath.value))
const expectedSchema = computed(() => {
  if (!selectedInput.value) return undefined
  let parts
  try { parts = pointerParts(selectedPath.value) } catch { return undefined }
  let raw = media.value?.[1]?.schema
  let value = parsed.value.value
  for (let index = 0; raw && index <= parts.length; index++) {
    if (index === parts.length) return props.operation.resolve(raw)
    const path = pointer(parts.slice(0, index))
    const schema = schemaView(props.operation, raw,
      inferVariant(props.operation, raw, value, props.step.request.bodyVariants?.[path]))
    const part = parts[index]
    raw = schema.properties[part] ?? schema.items ?? (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined)
    value = value && typeof value === 'object' && Object.hasOwn(value, part) ? value[part] : undefined
  }
})
const expectedTypes = computed(() => {
  const schema = expectedSchema.value
  const variants = schema?.oneOf ?? schema?.anyOf ?? []
  const types = schema?.type ?? variants.flatMap(raw => props.operation.resolve(raw)?.type ?? [])
  return (Array.isArray(types) ? [...new Set(types)] : [types]).join(' / ')
})
async function editField(path, trigger) {
  selectedPath.value = path
  returnFocus = trigger
  await nextTick()
  fieldPanel.value?.focus()
}
async function closeField() {
  const path = selectedPath.value
  selectedPath.value = null
  await nextTick()
  const row = [...(bodyTree.value?.querySelectorAll('[data-body-path]') ?? [])]
    .find(element => element.dataset.bodyPath === path)
  const control = returnFocus?.isConnected ? returnFocus : row?.querySelector('.json-line .source-badge, .json-line select')
  const target = control ?? configuredToggle.value
  target?.focus()
}
async function focusBinding(path) {
  if (!bodyInputs.value.some(input => input.pointer === path)) return false
  await editField(path)
  const control = fieldPanel.value?.querySelector('textarea:not([disabled])') ?? fieldPanel.value?.querySelector('select:not([disabled])')
  control?.focus()
  return true
}
defineExpose({ focusBinding })
const casingConflict = ref('')
watch(() => [props.operation, props.step, mode.value, props.disabled], () => {
  if (props.disabled) return
  const normalized = normalizeBodyFieldNames(props.operation, props.step.request, props.step.inputs)
  casingConflict.value = normalized.conflict ?? ''
  if (mode.value !== 'fields' || normalized.conflict) return
  props.step.request.body = normalized.body
  if (normalized.inputs.some((input, index) => input !== props.step.inputs[index])) {
    props.step.inputs = normalized.inputs
  }
}, { immediate: true })
provide(BODY_FIELD_EDITOR, editField)
const wholeBodySources = computed(() => /^(?:text\/|application\/(?:.+\+)?xml)/i.test(media.value?.[0] ?? ''))
provide(BODY_VALUE,computed(()=>parsed.value.value))
</script>
<template>
 <section class="scenario-body-editor" aria-label="Request body schema">
  <header><h4>Request body</h4><div v-if="json" role="group" aria-label="Body editing mode"><button type="button" class="secondary" :aria-pressed="mode==='fields'" @click="mode='fields'">JSON builder</button><button type="button" class="secondary" :aria-pressed="mode==='raw'" @click="rawMode">Raw JSON</button><button type="button" class="secondary" @click="expand">Expand body editor</button></div></header>
  <Teleport :disabled="!expanded" :to="dialogHost??'body'">
   <div class="body-editor-content">
    <p v-if="casingConflict" class="error" role="alert">{{ casingConflict }}</p>
    <div class="body-workspace" :class="{ 'editing-field': selectedInput }">
     <div ref="bodyTree" class="body-tree">
      <button v-if="json && mode === 'fields' && bodyInputs.length" ref="configuredToggle" type="button"
        class="secondary configured-toggle" :aria-pressed="configuredOnly" @click="configuredOnly = !configuredOnly">
        Configured fields ({{ bodyInputs.length }})
      </button>
      <ul v-if="json && mode === 'fields' && configuredOnly && bodyInputs.length" class="configured-fields">
        <li v-for="(input, index) in bodyInputs" :key="index">
          <code>{{ input.pointer || '(whole body)' }}</code>
          <button type="button" class="secondary source-badge" @click="editField(input.pointer, $event.currentTarget)">
            {{ BODY_SOURCE_LABELS[input.source] }}
          </button>
        </li>
      </ul>
      <div v-else-if="json && mode === 'fields'">
        <p v-if="parseError" class="error" role="alert">{{ parseError }}</p>
        <BodySchemaField v-else :key="step.id + media[0]" :step="step" :operation="operation"
          :raw="media[1].schema ?? {}" name="Body" :required="!!operation.requestBody.required"
          :disabled="disabled" @raw="rawMode" />
      </div>
      <div v-else>
        <p v-if="bodyInputs.length" class="body-guidance">
          The text below is the saved template. Run-time sources replace their target values before sending.
        </p>
        <fieldset class="raw-body" :disabled="disabled">
          <BodyEditor :operation="operation" :session="step.request">
            <label v-if="json" class="raw-json-label">
              Raw request body
              <textarea v-model="step.request.body" aria-label="Raw request body" spellcheck="false" rows="8" />
            </label>
          </BodyEditor>
        </fieldset>
        <details v-if="json || wholeBodySources || bodyInputs.length" class="advanced-body-bindings"
          :open="!json && bodyInputs.length > 0">
          <summary>Advanced body bindings</summary>
          <StepInputs :step="step" :operation="operation" :steps="steps" :operations="operations"
            :variables="variables" :results="results" :body-only="true" :disabled="disabled" />
        </details>
      </div>
     </div>
     <section v-if="selectedInput" ref="fieldPanel" tabindex="-1" class="field-panel"
       aria-label="Configure body field">
       <header>
         <div class="field-panel-title"><h4>Configure field</h4><code>{{ selectedPath || '(whole body)' }}</code></div>
         <button type="button" class="secondary" @click="closeField">Back to body</button>
       </header>
       <p v-if="expectedTypes" class="body-guidance">Expected type · {{ expectedTypes }}</p>
       <StepInputs :key="selectedPath" :step="step" :operation="operation" :steps="steps" :operations="operations"
         :variables="variables" :results="results" :body-only="true" :body-target="selectedPath"
         :expected-schema="expectedSchema" :disabled="disabled" @remove="closeField" />
     </section>
    </div>
   </div>
  </Teleport>
  <dialog ref="dialog" class="body-editor-dialog" aria-labelledby="expanded-body-title" @close="expanded=false"><div class="dialog-shell"><header><h3 id="expanded-body-title">Configure request body</h3><div><button type="button" class="secondary" :aria-pressed="mode==='fields'" @click="mode='fields'">JSON builder</button><button type="button" class="secondary" :aria-pressed="mode==='raw'" @click="rawMode">Raw JSON</button><button type="button" class="secondary" aria-label="Close body editor" @click="dialog.close()">Done</button></div></header><div ref="dialogHost" class="dialog-host" /></div></dialog>
 </section>
</template>
<style scoped>
.body-workspace { display: grid; gap: .75rem; align-items: start; }
.body-tree, .field-panel { min-width: 0; }
.configured-toggle { margin: .5rem 0; font-size: .75rem; }
.configured-toggle[aria-pressed=true], .source-badge { background: var(--accent-soft); color: var(--accent); }
.configured-fields { list-style: none; margin: 0; padding: 0; }
.configured-fields li { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .35rem 0; border-bottom: 1px solid var(--line); font-size: .75rem; }
.configured-fields code, .field-panel-title code { overflow-wrap: anywhere; min-width: 0; }
.configured-fields button { flex-shrink: 0; }
.field-panel { border: 1px solid var(--line); border-radius: .5rem; padding: .7rem; margin-top: .5rem; }
.field-panel-title { display: grid; gap: .2rem; }
@container (min-width: 740px) {
  .editing-field { grid-template-columns: minmax(0, 1fr) minmax(20rem, .9fr); }
}
@container (max-width: 739px) {
  .editing-field .body-tree { display: none; }
}

.raw-json-label { display:grid; gap:.35rem; font-size:.75rem; }.raw-json-label textarea { width:100%; min-width:0; font: .75rem/1.5 ui-monospace,Consolas,monospace; }.body-editor-content { container-type:inline-size; }.body-editor-dialog { width:min(64rem,calc(100% - 2rem)); max-height:85dvh; padding:0; overflow:hidden; border:1px solid var(--line); border-radius:.7rem; background:var(--surface); color:inherit; }.body-editor-dialog::backdrop { background:#17342640; }.dialog-shell { display:flex; flex-direction:column; max-height:85dvh; }.dialog-shell > header { padding:.85rem 1rem; border-bottom:1px solid var(--line); flex:none; }.dialog-shell h3 { margin:0; font-size:1rem; }.dialog-host { overflow:auto; min-height:0; padding:0 1rem 1rem; }.scenario-body-editor { border-top:1px solid var(--line); margin-top:.8rem; padding-top:.7rem; min-width:0; }header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.5rem; }h4 { margin:0; font-size:.85rem; }header > div { display:flex; gap:.3rem; font-size:.7rem; }header [aria-pressed=true] { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }.body-guidance { color:var(--muted); font-size:.7rem; line-height:1.5; }.raw-body { border:0; padding:0; min-width:0; margin-top:.6rem; }.advanced-body-bindings { font-size:.75rem; margin:.7rem 0; }summary { cursor:pointer; margin-bottom:.5rem; }.error { font-size:.75rem; }
</style>
