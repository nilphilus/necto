<script setup>
import RandomSourceEditor from './RandomSourceEditor.vue'
import ExpressionEditor from './ExpressionEditor.vue'
import { computed, useId } from 'vue'
import { pointerHints } from './pointerHints.js'
import { generators } from './generation.js'
const props = defineProps({ step: Object, operation: Object, steps: Array, operations: Array, results: Array, disabled: Boolean, fixedSource: String, variables: { type: Array, default: () => [] }, parametersOnly: Boolean, bodyOnly: Boolean, parameter: Object, bodyTarget: String, expectedSchema: Object })
const emit = defineEmits(['remove'])
const prefix = useId()
function hints(input) {
  const step = props.steps.find(step => step.id === input.stepId)
  return pointerHints(props.operations?.find(operation => operation.key === step?.operationKey), props.results?.find(result => result.id === input.stepId)?.response?.json)
}
const targets = computed(() => (props.bodyOnly ? [] : props.operation?.parameters ?? []).filter(parameter => ['path', 'query', 'header'].includes(parameter.in)))
function sourceChanged(input) {
  if (input.source === 'random') { input.stepId ??= '';input.responsePointer ??= '';input.itemPointer ??= '' }
  if (input.source === 'expression') { input.expression ??= ''; input.bindings ??= [] }
  if (input.source === 'variable') input.variableId ||= props.variables[0]?.id ?? ''
  if (input.source === 'response') { input.stepId ??= ''; input.responsePointer ??= '' }
  if (input.source === 'human') { input.prompt ??= 'Enter ' + (input.name || 'a value'); input.valueType ??= 'text' }
  if (input.source === 'generate') { input.generator ??= 'uuid'; input.pattern ??= 'INV-[A-Z]{3}-\\d{4}' }
}
function add() {
  const target = props.parameter ?? targets.value[0]
  props.step.inputs.push({ location: target?.in ?? 'body', name: target?.name ?? '', pointer: '', source: props.fixedSource ? 'response' : 'human',
    prompt: 'Enter ' + (target?.name ?? 'a value'), valueType: 'text', generator: 'uuid', pattern: 'INV-[A-Z]{3}-\\d{4}', stepId: props.fixedSource ?? '', responsePointer: '' })
}
function setTarget(input, value) {
  if (value === 'body') { input.location = 'body'; input.pointer ??= ''; return }
  const target = targets.value[Number(value)]; input.location = target.in; input.name = target.name
}
</script>
<template>
  <section class="step-inputs" :aria-label="parameter ? 'Value for ' + parameter.name : 'Dynamic inputs'">
    <template v-if="parameter || bodyTarget !== undefined">
      <button v-if="parameter && !step.inputs.some(input => input.location === parameter.in && input.name === parameter.name)"
        type="button" class="secondary" :disabled="disabled" @click="add">Use a run-time value</button>
    </template>
    <template v-else>
    <header><h4>Dynamic inputs</h4><button type="button" class="secondary" :disabled="disabled || !targets.length && (parametersOnly || !operation?.requestBody)" @click="add">Add input</button></header>
    <p v-if="!step.inputs.length" class="muted">Static values come from the request. Add a source to fill a field at run time.</p>
    </template>
    <template v-for="(input, index) in step.inputs" :key="index"><fieldset v-if="(!parameter || (input.location === parameter.in && input.name === parameter.name)) && (!parametersOnly || input.location !== 'body') && (!bodyOnly || input.location === 'body') && (bodyTarget === undefined || input.pointer === bodyTarget)" :disabled="disabled" class="input-card">
      <legend>{{ parameter || bodyTarget !== undefined ? 'Run-time value' : `Input ${index + 1}` }}</legend>
      <div class="input-row"><label v-if="!parameter && bodyTarget === undefined">Target<select aria-label="Target" :value="input.location === 'body' ? 'body' : targets.findIndex(target => target.in === input.location && target.name === input.name)" @change="setTarget(input, $event.target.value)"><option v-for="(target, i) in targets" :key="i" :value="i">{{ target.in }} · {{ target.name }}</option><option v-if="!parametersOnly && operation?.requestBody" value="body">Body</option></select></label>
        <button type="button" class="remove-input secondary" :aria-label="'Remove input ' + (index + 1)" @click="step.inputs.splice(index, 1); emit('remove')">{{ parameter || bodyTarget !== undefined ? 'Use static value' : '×' }}</button></div>
      <label v-if="input.location === 'body' && bodyTarget === undefined">Target JSON Pointer<input aria-label="Target JSON Pointer" v-model="input.pointer" placeholder="/customer/id · empty = whole body"><small>For text/XML, leave empty to replace the whole body.</small></label>
      <label v-if="!fixedSource">Value source<select aria-label="Value source" v-model="input.source" @change="sourceChanged(input)"><option value="response">Earlier response</option><option value="variable">Shared variable</option><option value="preset">Run preset</option><option value="generate">Generate data</option><option value="expression">Expression</option><option value="random">Pick random</option><option value="human">Ask at run time</option></select></label>
      <ExpressionEditor v-if="input.source === 'expression'" :input="input" :step="step" :steps="steps" :variables="variables" :results="results" :expected-schema="expectedSchema" :resolve="operation?.resolve" :disabled="disabled" />
      <RandomSourceEditor v-else-if="input.source === 'random'" :source="input" :step="step" :steps="steps" />
      <label v-else-if="input.source === 'variable'">Shared variable<select v-model="input.variableId" aria-label="Shared variable"><option value="" disabled>Choose a variable</option><option v-for="variable in variables" :key="variable.id" :value="variable.id">{{ variable.name }}</option></select><small>One value per scenario run, shared with all consumers.</small></label>
      <template v-else-if="input.source === 'response'">
        <label v-if="!fixedSource">Source step<select aria-label="Source step" v-model="input.stepId"><option value="" disabled>Choose a step</option><option v-for="other in steps.filter(other => other.id !== step.id)" :key="other.id" :value="other.id">{{ other.label }}</option></select></label>
        <label>Response JSON Pointer<input aria-label="Response JSON Pointer" :list="prefix + '-pointer-' + index" v-model="input.responsePointer" placeholder="/items/0/id · empty = entire JSON"><small>Choose a suggested path or enter your own. No inferred mapping required.</small></label><datalist :id="prefix + '-pointer-' + index"><option v-for="path in hints(input)" :key="path" :value="path" /></datalist>
      </template>
      <template v-else-if="input.source === 'generate'">
        <label>Generator tag<select aria-label="Generator tag" v-model="input.generator" @change="input.pattern ??= 'INV-[A-Z]{3}-\\d{4}'"><option v-for="[value, label] in generators" :key="value" :value="value">{{ label }}</option></select></label>
        <label v-if="input.generator === 'regex'">Pattern<input aria-label="Pattern" v-model="input.pattern" placeholder="INV-[A-Z]{3}-\d{4}"><small>Literals, ranges, \d, \w, \s, ?, {n}, {min,max}. No groups or unbounded repetition. Maximum 256 generated characters.</small></label>
        <small>Faker · a new value for every run. Choose a generator that matches the API field type.</small>
      </template>
      <p v-else-if="input.source === 'preset'" class="muted">Choose a matching preset in Review & run.</p>
      <template v-else>
        <label>Question<input aria-label="Question" v-model="input.prompt" placeholder="Enter the one-time approval code"></label>
        <label>Value type<select aria-label="Value type" v-model="input.valueType"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="json">JSON value</option></select></label>
        <small>The step pauses before sending. Answers stay in this run and are excluded from saved definitions.</small>
      </template>
    </fieldset></template>
  </section>
</template>
<style scoped>
header { display:flex; justify-content:space-between; align-items:center; gap:.5rem; }h4 { margin:0; font-size:.85rem; }.step-inputs p { font-size:.78rem; line-height:1.5; }.input-card { display:grid; gap:.55rem; min-width:0; margin:.6rem 0; padding:.65rem; border:1px solid var(--line); border-radius:.5rem; background:var(--subtle); }legend { font-size:.7rem; color:var(--muted); }label { display:grid; gap:.25rem; font-size:.76rem; min-width:0; }input,select { width:100%; min-width:0; padding:.4rem; }small { font-size:.68rem; color:var(--muted); line-height:1.5; }.input-row { display:flex; gap:.45rem; align-items:end; }.input-row label { flex:1; }.remove-input { align-self:start; }
</style>
