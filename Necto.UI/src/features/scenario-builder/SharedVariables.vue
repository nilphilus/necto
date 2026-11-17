<script setup>
import RandomSourceEditor from './RandomSourceEditor.vue'
import { nextTick, ref } from 'vue'
import { newId, validateBlueprint } from './model.js'
import { generators } from './generation.js'
import { variableSnapshot, inputSources } from './variables.js'
import { pointerHints } from './pointerHints.js'
const props = defineProps({ blueprint: Object, operations: Array, results: Array, disabled: Boolean })
const emit = defineEmits(['save'])
const dialog = ref(null), variables = ref([]), error = ref('')
async function open() { error.value = ''; variables.value = JSON.parse(JSON.stringify(props.blueprint.variables)); await nextTick(); dialog.value.showModal() }
function add() {
  let index = variables.value.length + 1
  while (variables.value.some(variable => variable.name === 'variable_' + index)) index++
  variables.value.push({ id: newId(), name: 'variable_' + index, source: 'static', valueType: 'text', value: '' })
}
function defaults(variable) {
  variable.valueType ??= 'text'; variable.value ??= ''; variable.prompt ??= 'Enter ' + variable.name
  variable.generator ??= 'uuid'; variable.pattern ??= 'INV-[A-Z]{3}-\\d{4}'; variable.stepId ??= ''; variable.responsePointer ??= '';variable.itemPointer ??= ''
}
function typeChanged(variable) { variable.value = ({ text: '', number: '0', boolean: 'true', json: 'null' })[variable.valueType] }
function remove(variable) {
  const used = props.blueprint.steps.filter(step => step.inputs.flatMap(inputSources).some(input => input.source === 'variable' && input.variableId === variable.id))
  if (used.length) { error.value = `${variable.name} is used by ${used.map(step => step.label).join(', ')}. Remove or change those input bindings first.`; return }
  variables.value = variables.value.filter(item => item.id !== variable.id); error.value = ''
}
function hints(variable) {
  const step = props.blueprint.steps.find(step => step.id === variable.stepId)
  return pointerHints(props.operations.find(operation => operation.key === step?.operationKey), props.results?.find(result => result.id === variable.stepId)?.response?.json)
}
function save() {
  if (props.disabled) return
  try { const next = variables.value.map(variableSnapshot); validateBlueprint({ ...props.blueprint, variables: next, steps: props.blueprint.steps.map(step => ({ ...step, inputs: step.inputs.filter(input => input.source !== 'variable' || input.variableId) })) }); emit('save', next); dialog.value.close() }
  catch (cause) { error.value = cause.message }
}
</script>
<template>
  <button type="button" class="secondary" @click="open">Variables ({{ blueprint.variables.length }})</button>
  <Teleport to="body"><dialog ref="dialog" class="variables-dialog" aria-labelledby="shared-variables-title" @click="event => event.target === dialog && dialog.close()">
    <form @submit.prevent="save"><header><div><h3 id="shared-variables-title">Shared variables</h3><p>Resolve once per run. Reuse the same value in parallel requests and retries.</p></div><button type="button" class="secondary" aria-label="Close shared variables" @click="dialog.close()">×</button></header>
      <div class="variables-content"><p class="muted">Use “Shared variable” as a request input source. Response variables add their producer as a dependency automatically. Static values are included in saved/exported definitions; keep credentials in Authorize.</p>
        <fieldset v-for="(variable, index) in variables" :key="variable.id" class="variable-card" :disabled="disabled"><legend>Variable {{ index + 1 }}</legend>
          <div class="variable-name"><label>Name<input v-model="variable.name" aria-label="Variable name" maxlength="64" placeholder="customerEmail"></label><button type="button" class="secondary" :aria-label="'Remove variable ' + variable.name" @click="remove(variable)">Remove</button></div>
          <label>Source<select v-model="variable.source" aria-label="Variable source" @change="defaults(variable)"><option value="static">Static value</option><option value="generate">Generate data</option><option value="human">Ask at run time</option><option value="response">Response field</option><option value="random">Pick random</option></select></label>
          <label v-if="['static','human'].includes(variable.source)">Value type<select v-model="variable.valueType" aria-label="Variable value type" @change="typeChanged(variable)"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="json">JSON</option></select></label>
          <label v-if="variable.source === 'static'">Value<textarea v-model="variable.value" aria-label="Variable static value" rows="2" spellcheck="false" /></label>
          <template v-if="variable.source === 'generate'"><label>Generator<select v-model="variable.generator" aria-label="Variable generator"><option v-for="[id,label] in generators" :key="id" :value="id">{{ label }}</option></select></label><label v-if="variable.generator === 'regex'">Pattern<input v-model="variable.pattern" aria-label="Variable pattern" placeholder="INV-[A-Z]{3}-\d{4}"></label></template>
          <label v-if="variable.source === 'human'">Question<input v-model="variable.prompt" aria-label="Variable question"><small>Asked once, only if used. Answers are not saved with the definition.</small></label>
          <RandomSourceEditor v-if="variable.source==='random'" :source="variable" :steps="blueprint.steps" :shared="true" :disabled="disabled" />
          <template v-if="variable.source === 'response'"><label>Source step<select v-model="variable.stepId" aria-label="Variable source step"><option value="" disabled>Choose a step</option><option v-for="step in blueprint.steps" :key="step.id" :value="step.id">{{ step.label }}</option></select></label><label>Response JSON Pointer<input v-model="variable.responsePointer" aria-label="Variable response pointer" :list="'variable-path-' + variable.id" placeholder="/id"><small>Captured from the final successful response, after polling finishes.</small></label><datalist :id="'variable-path-' + variable.id"><option v-for="path in hints(variable)" :key="path" :value="path" /></datalist></template>
          <small class="uses">Used by {{ blueprint.steps.filter(step => step.inputs.flatMap(inputSources).some(input => input.source === 'variable' && input.variableId === variable.id)).length }} request(s)</small>
        </fieldset>
        <p v-if="!variables.length" class="muted">For example: generate customerEmail once, then use it in two independent requests.</p><button type="button" class="secondary" :disabled="disabled || variables.length >= 100" @click="add">Add variable</button>
        <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="disabled" class="muted">Run in progress. Definitions are read only.</p>
      </div><footer><button type="button" class="secondary" @click="dialog.close()">Cancel</button><button type="submit" class="primary" :disabled="disabled">Apply variables</button></footer>
    </form>
  </dialog></Teleport>
</template>
<style scoped>
.variables-dialog { padding:0; width:min(42rem,calc(100% - 2rem)); max-height:85dvh; border:1px solid var(--line); border-radius:.7rem; background:var(--surface); color:inherit; overflow:hidden; }.variables-dialog::backdrop { background:#17342630; }form { display:flex; flex-direction:column; max-height:85dvh; }header { display:flex; justify-content:space-between; align-items:start; gap:.6rem; padding:.85rem 1rem; border-bottom:1px solid var(--line); }h3 { margin:0; font-size:1rem; }header p { margin:.3rem 0 0; font-size:.75rem; color:var(--muted); }.variables-content { padding:0 1rem 1rem; overflow:auto; min-height:0; }p { font-size:.78rem; line-height:1.5; }.variable-card { display:grid; gap:.55rem; min-width:0; border:1px solid var(--line); border-radius:.5rem; padding:.75rem; margin:.75rem 0; background:var(--subtle); }legend,small { font-size:.7rem; color:var(--muted); }label { display:grid; gap:.25rem; min-width:0; font-size:.75rem; }input,select,textarea { width:100%; min-width:0; }.variable-name { display:flex; align-items:end; gap:.5rem; }.variable-name label { flex:1; }.variable-name button { font-size:.75rem; }.uses { color:var(--accent); }footer { display:flex; flex:none; gap:.5rem; justify-content:flex-end; padding:.7rem 1rem; border-top:1px solid var(--line); }
</style>
