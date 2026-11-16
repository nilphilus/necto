<script setup>
import { computed, useId } from 'vue'
import { pointerHints } from './pointerHints.js'
const props = defineProps({ step: Object, operation: Object, disabled: Boolean })
const id = useId()
const hints = computed(() => pointerHints(props.operation))
function delay(enabled) { if (enabled) props.step.delayMs = 1000; else delete props.step.delayMs }
function polling(enabled) {
  if (enabled) props.step.waitFor = { pointer: hints.value.find(path => /\/(status|state)$/i.test(path)) ?? '/status', valueType: 'text', value: 'Completed', retryCount: 5, intervalMs: 1000 }
  else delete props.step.waitFor
}
function changeType() { props.step.waitFor.value = ({ text: '', number: '0', boolean: 'true', json: 'null' })[props.step.waitFor.valueType] }
</script>
<template>
  <fieldset class="step-waiting" :disabled="disabled">
    <legend>Timing & response waiting</legend>
    <label class="toggle"><input type="checkbox" :checked="step.delayMs !== undefined" @change="delay($event.target.checked)">Delay</label>
    <label v-if="step.delayMs !== undefined" class="timing-value">Delay before first request (ms)<input v-model.number="step.delayMs" type="number" min="0" max="600000" step="1" aria-label="Delay milliseconds"></label>
    <label class="toggle"><input type="checkbox" :checked="!!step.waitFor" @change="polling($event.target.checked)">Wait for response value</label>
    <template v-if="step.waitFor">
      <label>Response field · JSON Pointer<input v-model="step.waitFor.pointer" :list="id + '-wait-paths'" placeholder="/status" aria-label="Wait for response field"><small>Empty = the whole JSON response. A missing field keeps waiting.</small></label>
      <datalist :id="id + '-wait-paths'"><option v-for="path in hints" :key="path" :value="path" /></datalist>
      <div class="expected-value"><label>Value type<select v-model="step.waitFor.valueType" aria-label="Wait value type" @change="changeType"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="json">JSON</option></select></label>
        <label>Expected value<input v-model="step.waitFor.value" aria-label="Expected response value" :placeholder="step.waitFor.valueType === 'text' ? 'Completed' : 'JSON value'"></label></div>
      <div class="retry-settings"><label>Retry count<input v-model.number="step.waitFor.retryCount" type="number" min="0" max="100" step="1" aria-label="Response retry count"></label><label>Retry interval (ms)<input v-model.number="step.waitFor.intervalMs" type="number" min="100" max="600000" step="1" aria-label="Response retry interval milliseconds"></label></div>
      <small>Up to {{ 1 + (Number(step.waitFor.retryCount) || 0) }} calls, including the first. Inputs stay the same. Only an unmet value condition causes a retry; HTTP/network errors stop the run.</small>
      <p v-if="operation && !['GET', 'HEAD', 'OPTIONS'].includes(operation.method)" class="repeat-note">This repeats {{ operation.method }} requests and may repeat server changes. Prefer polling a read endpoint for an asynchronous operation.</p>
    </template>
    <small v-if="step.delayMs !== undefined || step.waitFor">Waiting does not occupy a parallel request slot. Stop run cancels timers.</small>
  </fieldset>
</template>
<style scoped>
.step-waiting { min-width:0; display:grid; gap:.6rem; margin:0 0 1rem; padding:.65rem; border:1px solid var(--line); border-radius:.5rem; background:var(--subtle); }
legend { font-size:.78rem; font-weight:600; }label { display:grid; gap:.25rem; min-width:0; font-size:.75rem; }.toggle { display:flex; gap:.4rem; align-items:center; font-weight:600; }input:not([type=checkbox]),select { width:100%; min-width:0; padding:.4rem; }.timing-value { padding-left:1.35rem; }.expected-value,.retry-settings { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:.5rem; }small { color:var(--muted); font-size:.68rem; line-height:1.5; }.repeat-note { margin:0; color:#755018; font-size:.72rem; line-height:1.5; }
</style>
