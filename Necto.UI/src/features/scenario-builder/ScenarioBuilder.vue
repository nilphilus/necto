<script setup>
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import ResponseChecksEditor from '../workbench/ResponseChecksEditor.vue'
import { removeStepDraft, restoreStepDraft } from './stepUndo.js'
import SentRequest from './SentRequest.vue'
import ScenarioMap from './ScenarioMap.vue'
import StepInputs from './StepInputs.vue'
import SharedVariables from './SharedVariables.vue'
import { variableProducer } from './variables.js'
import StepWaiting from './StepWaiting.vue'
import { useBuilder, savedBlueprint } from './useBuilder.js'
import { dependencies, newBlueprint, newId, newStep, parseBlueprint, validateBlueprint } from './model.js'
import { emptyStep, configureEndpoint } from './stepDraft.js'
import { prepareBlueprint } from './runner.js'
import { allConnections, connectionKey, connectionSummary } from './connections.js'
import { waitOptions } from './waiting.js'
import ScenarioBodyEditor from './ScenarioBodyEditor.vue'
import ResponsePreview from '../request-runner/ResponsePreview.vue'

const props = defineProps({ configuration: Object, operations: Array, scenarios: Array, context: Function, presetContext: Function, presetNames: { type: Array, default: () => [] }, activePresetNames: { type: Array, default: () => [] }, execute: Function, authentication: Object, busy: Boolean })
const emit = defineEmits(['back', 'pending'])
const configurationRef = computed(() => props.configuration)
const store = useBuilder(configurationRef)
const { draft, saved, dirty, error, notice, execution, pending, questions } = store
const pickingStepId = ref(''), removedStep = ref(null)
const selectedId = ref(''), tab = ref('configure'), search = ref(''), addDialog = ref(null), runDialog = ref(null), fileInput = ref(null)
const selectedPresets = ref([])
const review = ref([]), allowHuman = ref(true), runProblem = ref(''), picker = ref(''), quick = ref('')
const edgeDialog = ref(null), edgeEdit = ref(null), mappingEdit = ref(null), edgeProblem = ref(''), popupPosition = ref({})
const edgeTarget = computed(() => draft.value.steps.find(step => step.id === edgeEdit.value?.to))
const edgeOperation = computed(() => props.operations.find(operation => operation.key === edgeTarget.value?.operationKey))
const inbound = computed(() => selected.value ? allConnections(draft.value).filter(edge => edge.to === selected.value.id) : [])
const selected = computed(() => draft.value.steps.find(step => step.id === selectedId.value))
const operation = computed(() => props.operations.find(operation => operation.key === selected.value?.operationKey))
const runStep = computed(() => execution.steps.find(step => step.id === selectedId.value))
const filtered = computed(() => props.operations.filter(operation => `${operation.method} ${operation.path} ${operation.name} ${operation.apiName}`.toLowerCase().includes(search.value.toLowerCase())).slice(0, 100))
const validation = computed(() => { try { validateBlueprint(draft.value); return '' } catch (cause) { return cause.message } })
const dynamicTargets = computed(() => new Set(selected.value?.inputs.filter(input => input.location !== 'body').map(input => input.location + ':' + input.name)))
const definitionChanged = () => { if (execution.status !== 'idle' && !pending.value) execution.stale = true }
watch(draft, definitionChanged, { deep: true })
watch(() => draft.value.id, () => { removedStep.value = null; edgeDialog.value?.close(); edgeEdit.value = null; picker.value = saved.value.some(item => item.id === draft.value.id) ? draft.value.id : ''; selectedId.value = draft.value.steps[0]?.id ?? ''; tab.value = 'configure' })
watch(pending, value => { if(value) removedStep.value=null; emit('pending', value) }, { immediate: true })
onScopeDispose(() => emit('pending', false))
if (props.authentication) onScopeDispose(props.authentication.onChange(ids => store.invalidate(ids)))
watch(() => props.operations.map(operation => operation.key), available => {
  if (execution.steps.some(step => !available.includes(step.operation.key))) store.invalidate()
})
function attempt(action) { error.value = ''; notice.value = ''; try { return action() } catch (cause) { error.value = cause.message } }
function mayDiscard() { return !dirty.value || !draft.value.steps.length || window.confirm('Discard unsaved Scenario Builder changes?') }
function fresh() { if (mayDiscard()) store.fresh() }
function openSaved() { const item = saved.value.find(item => item.id === picker.value); if (item && mayDiscard()) store.open(item); picker.value = saved.value.some(item => item.id === draft.value.id) ? draft.value.id : '' }
function save() { attempt(() => { store.save(); picker.value = draft.value.id }) }
function removeSaved() { if (window.confirm(`Delete “${draft.value.name}” from this browser?`)) attempt(store.remove) }
async function openAdd(stepId = '') { pickingStepId.value = typeof stepId === 'string' ? stepId : ''; search.value = ''; addDialog.value.showModal(); await nextTick(); addDialog.value.querySelector('input')?.focus() }
async function createNext({from, position}) {
  if (pending.value || draft.value.steps.length >= 100) return
  if (from !== null && !draft.value.steps.some(step => step.id === from)) return
  const step = emptyStep(position)
  draft.value.steps.push(step)
  if (from !== null) draft.value.connections.push({from,to:step.id})
  selectedId.value = step.id; tab.value = 'configure'
  await nextTick()
  const card = [...document.querySelectorAll('.map-node')].find(card => card.dataset.stepId === step.id)
  card?.scrollIntoView({block:'nearest',inline:'nearest'})
  await openAdd(step.id)
}
function add(operation) {
  if (pickingStepId.value) {
    const index = draft.value.steps.findIndex(step => step.id === pickingStepId.value)
    if (index < 0) { addDialog.value.close(); return }
    const old = draft.value.steps[index], previous = props.operations.find(item => item.key === old.operationKey)
    if (old.operationKey && !window.confirm('Changing the endpoint resets this request’s inputs and body. Keep the connections and continue?')) return
    draft.value.steps[index] = configureEndpoint(old, operation, props.context().createSession(operation), previous?.name)
    selectedId.value = old.id; tab.value = 'configure'; addDialog.value.close(); return
  }
  if (draft.value.steps.length >= 100) { error.value = 'A scenario supports at most 100 steps.'; addDialog.value.close(); return }
  const step = newStep(operation, props.context().createSession(operation)); draft.value.steps.push(step); selectedId.value = step.id; tab.value = 'configure'; addDialog.value.close()
}
function removeStep() {
  const id = selected.value.id
  const used = draft.value.variables.filter(variable => variable.source === 'response' && variable.stepId === id)
  if (used.length) { error.value = 'Change or remove response variables first: ' + used.map(variable => variable.name).join(', '); return }
  if (draft.value.steps.some(step => dependencies(step, draft.value).includes(id)) && !window.confirm('Remove this step and all connections that use its response?')) return
  const removed = removeStepDraft(draft.value,id)
  draft.value = removed.next; removedStep.value = removed.snapshot
  selectedId.value = draft.value.steps[0]?.id ?? ''
}
function undoRemoveStep() {
 if(pending.value||!removedStep.value)return
 attempt(()=>{const id=removedStep.value.step.id;draft.value=restoreStepDraft(draft.value,removedStep.value);removedStep.value=null;selectedId.value=id;tab.value='configure'})

}
function candidateConnection(edge, inputs) {
  const pair = connectionKey(edge.from, edge.to)
  return { ...draft.value, connections: [...draft.value.connections.filter(item => connectionKey(item.from, item.to) !== pair), { from: edge.from, to: edge.to, ...waitOptions(edge) }],
    steps: draft.value.steps.map(step => step.id === edge.to ? { ...step, inputs: [...step.inputs.filter(input => input.source !== 'response' || input.stepId !== edge.from), ...inputs] } : step) }
}
async function openConnection(edge, event) {
  edgeProblem.value = ''; error.value = ''
  edgeEdit.value = { from: edge.from, to: edge.to, ...waitOptions(edge) }
  const target = draft.value.steps.find(step => step.id === edge.to)
  if (!target) return
  mappingEdit.value = { id: target.id, inputs: JSON.parse(JSON.stringify(target.inputs.filter(input => input.source === 'response' && input.stepId === edge.from))) }
  const opener = event?.currentTarget
  await nextTick()
  const element = opener ?? [...document.querySelectorAll('[data-connection]')].find(item => item.dataset.connection === connectionKey(edge.from, edge.to))
  const anchor = element?.getBoundingClientRect?.() ?? { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3 }
  const width = Math.min(420, innerWidth - 24)
  popupPosition.value = { left: Math.max(12, Math.min(innerWidth - width - 12, anchor.right + width + 12 < innerWidth ? anchor.right + 10 : anchor.left - width - 10)) + 'px', top: Math.max(12, Math.min(anchor.top - 30, innerHeight - Math.min(680, innerHeight - 24) - 12)) + 'px' }
  await nextTick(); edgeDialog.value.showModal()
}
function connect(edge) {
  if (pending.value) return
  attempt(() => {
    const existing = allConnections(draft.value).find(item => connectionKey(item.from, item.to) === connectionKey(edge.from, edge.to))
    if (existing) { void openConnection(existing); return }
    const candidate = { ...draft.value, connections: [...draft.value.connections, { from: edge.from, to: edge.to }] }
    validateBlueprint(candidate); draft.value.connections = candidate.connections
    void openConnection(edge)
  })
}
function saveConnection() {
  if (pending.value) return
  try {
    const candidate = candidateConnection(edgeEdit.value, mappingEdit.value.inputs)
    validateBlueprint(candidate)
    draft.value.connections = candidate.connections
    edgeTarget.value.inputs = candidate.steps.find(step => step.id === edgeEdit.value.to).inputs
    edgeDialog.value.close()
  } catch (cause) { edgeProblem.value = cause.message }
}
function removeConnection() {
  if (pending.value) return
  const edge = edgeEdit.value, count = edgeTarget.value.inputs.filter(input => variableProducer(input, draft.value) === edge.from).length
  if (count && !window.confirm(`Remove this connection and its ${count} response binding(s)?`)) return
  draft.value.connections = draft.value.connections.filter(item => connectionKey(item.from, item.to) !== connectionKey(edge.from, edge.to))
  edgeTarget.value.inputs = edgeTarget.value.inputs.filter(input => variableProducer(input, draft.value) !== edge.from)
  edgeDialog.value.close()
}
function runContext() {
  if (selectedPresets.value.some(name => !props.presetNames.includes(name))) throw new Error('A selected preset is no longer available. Reopen the run review.')
  return props.presetContext ? props.presetContext(selectedPresets.value) : props.context()
}
function refreshReview() {
  runProblem.value = ''
  try { review.value = prepareBlueprint(draft.value, runContext()) }
  catch (cause) { review.value = []; runProblem.value = cause.message }
}
function reviewRun() {
  selectedPresets.value = props.activePresetNames.filter(name => props.presetNames.includes(name))
  refreshReview(); runDialog.value.showModal()
}
watch(allowHuman, () => { if (runDialog.value?.open) refreshReview() })
watch(selectedPresets, () => { if (runDialog.value?.open) refreshReview() }, { deep: true })
watch(() => props.presetNames, () => { if (runDialog.value?.open) refreshReview() })
async function startRun() {
  runProblem.value = ''
  try {
    const promise = store.run(runContext(), props.execute, allowHuman.value)
    // run() is async; initial errors are reported by awaiting below.
    if (pending.value) runDialog.value.close()
    await promise
    if (runDialog.value.open) runDialog.value.close()
  } catch (cause) { runProblem.value = cause.message; if (!runDialog.value.open) error.value = cause.message }
}
function select(id) { selectedId.value = id; if (pending.value || execution.steps.length) tab.value = 'response' }
function exportDefinition() {
  attempt(() => {
    const data = savedBlueprint(draft.value)
    const text = JSON.stringify(data, null, 2)
    if (text.length > 2 * 1024 * 1024) throw new Error('Builder exports are limited to 2 MB.')
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'necto-scenario-builder.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = 'Export includes static request inputs. Review before sharing; run answers and responses are excluded.'
  })
}
async function importDefinition(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file || !mayDiscard()) return
  try { if (file.size > 2 * 1024 * 1024) throw new Error('Imports are limited to 2 MB.'); const data = parseBlueprint(await file.text()); data.id = newId(); store.open(data); notice.value = 'Imported as a new draft. Review targets and inputs before running.' }
  catch (cause) { error.value = cause.message }
}
function importQuick() {
  const scenario = props.scenarios.find(item => item.id === quick.value); quick.value = ''
  if (!scenario || !mayDiscard()) return
  attempt(() => {
    const data = { ...newBlueprint(), version: 2 }; data.name = scenario.name + ' · Builder'
    const ids = scenario.steps.map(() => newId())
    const pointer = path => path.length ? '/' + path.map(part => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/') : ''
    data.steps = scenario.steps.map((step, index) => {
      if (step.bindings.some(binding => binding.selector)) throw new Error('This chain uses a filtered array selector. Add its response JSON Pointer manually in a new builder scenario.')
      const { operationKey, apiId, method, path, name, bindings, ...request } = step
      return { id: ids[index], label: name, operationKey, apiId, method, path, request, dependsOn: index ? [ids[index - 1]] : [],
        inputs: bindings.map(binding => ({ source: 'response', location: binding.location, name: binding.name ?? '', pointer: binding.name === null ? '' : pointer([binding.name]), stepId: ids[binding.sourceStep], responsePointer: pointer(binding.path) })) }
    })
    validateBlueprint(data); store.open(data); notice.value = 'Copied the quick chain. Remove “Run after” connections to introduce parallel branches.'
  })
}
function beforeUnload(event) { if (pending.value || dirty.value && draft.value.steps.length) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onScopeDispose(() => window.removeEventListener('beforeunload', beforeUnload))
</script>
<template>
  <section class="builder" aria-labelledby="builder-title">
    <header class="builder-header">
      <button type="button" class="secondary" :disabled="pending" @click="emit('back')">← Scenarios</button>
      <h2 id="builder-title">Scenario Builder</h2><span class="save-state">{{ dirty ? 'Unsaved changes' : 'Saved' }}</span>
      <div class="builder-actions"><button type="button" class="secondary" :disabled="pending" @click="fresh">New</button><button type="button" class="secondary" :disabled="pending || !!validation" @click="save">Save</button><button type="button" class="primary" :disabled="pending || busy || !draft.steps.length || !!validation" @click="reviewRun">Review & run</button><button v-if="pending" type="button" class="secondary" @click="store.stop">Stop run</button></div>
    </header>
    <div class="builder-toolbar">
      <label class="scenario-name">Name<input v-model="draft.name" :disabled="pending" maxlength="200" aria-label="Scenario name"></label>
      <label>Saved<select v-model="picker" :disabled="pending" aria-label="Saved builder scenarios" @change="openSaved"><option value="">Current draft</option><option v-for="item in saved" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <button type="button" class="secondary" :disabled="pending || draft.steps.length >= 100" @click="openAdd">+ Add request</button>
      <SharedVariables :key="draft.id" :blueprint="draft" :operations="operations" :results="execution.steps" :disabled="pending" @save="draft.variables = $event" /><details class="builder-more"><summary>More</summary><div>
        <button type="button" class="secondary" :disabled="pending || !!validation" @click="exportDefinition">Export definition</button><button type="button" class="secondary" :disabled="pending" @click="fileInput.click()">Import definition</button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importDefinition">
        <label v-if="scenarios?.length">Copy quick scenario<select v-model="quick" :disabled="pending" @change="importQuick"><option value="">Choose saved chain</option><option v-for="item in scenarios" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <button v-if="saved.some(item => item.id === draft.id)" type="button" class="secondary error" :disabled="pending" @click="removeSaved">Delete saved scenario</button>
        <p>Definitions include static inputs. Answers and results are kept only in the current run. Configure credentials with Authorize or presets.</p>
      </div></details>
    </div>
    <p v-if="error || validation" class="builder-message error" role="alert">{{ error || validation }}</p>
    <p v-if="removedStep" class="builder-message muted" role="status">Step removed: {{removedStep.step.label}}. <button type="button" class="secondary" :disabled="pending" @click="undoRemoveStep">Undo remove step</button><button type="button" class="secondary" aria-label="Dismiss step undo" @click="removedStep=null">×</button></p>
    <p v-if="notice" class="builder-message muted" role="status">{{ notice }}</p>
    <div v-if="execution.status !== 'idle'" class="builder-run-status" role="status"><strong>{{ execution.stale ? 'Previous run · ' : '' }}{{ execution.status }}</strong><span v-if="execution.presetNames?.length">Presets: {{ execution.presetNames.join(' → ') }}</span><span>{{ execution.steps.filter(step => step.status === 'completed').length }} / {{ execution.steps.length }} completed</span><span v-if="questions.size">{{ questions.size }} awaiting your input</span><span class="error">{{ execution.error }}</span></div>
    <section v-if="questions.size" class="human-queue" aria-label="Human input required">
      <form v-for="[id, question] in questions" :key="id" class="human-card" @submit.prevent="question.submit()">
        <header><strong>{{ question.step.label }} · Your input is needed</strong><button v-if="!question.step.sharedVariable" type="button" @click="select(id)">Show step</button><span v-else>Shared across requests</span></header>
        <label v-for="(input, index) in question.inputs" :key="index">{{ input.prompt }}<small>{{ input.location }} · {{ input.location === 'body' ? input.pointer || 'whole body' : input.name }} · {{ input.valueType }}</small><textarea :aria-label="input.prompt" v-if="input.valueType === 'json'" v-model="question.values[index]" rows="2" required autocomplete="off" /><input :aria-label="input.prompt" v-else v-model="question.values[index]" :type="input.valueType === 'number' ? 'number' : 'text'" step="any" required autocomplete="off" :placeholder="input.valueType === 'boolean' ? 'true or false' : ''"></label>
        <p v-if="question.error" class="error" role="alert">{{ question.error }}</p><div><button type="submit" class="primary">Continue {{ question.step.label }}</button><small>{{ question.step.sharedVariable ? 'Requests using this variable are paused. Independent branches can continue.' : 'Only this step is paused. Independent branches can continue.' }}</small></div>
      </form>
    </section>
    <div class="builder-layout">
      <ScenarioMap :blueprint="draft" :selected="selectedId" :steps="execution.stale ? [] : execution.steps" :disabled="pending" @select="select" @connect="connect" @configure="openConnection" @create-next="createNext" />
      <aside class="builder-inspector" aria-label="Step details">
        <template v-if="selected">
          <header class="inspector-header"><label>Step name<input v-model="selected.label" :disabled="pending" maxlength="200" aria-label="Step name"></label><div class="request-endpoint-actions"><button type="button" class="secondary" :disabled="pending" @click="openAdd(selected.id)">{{ selected.operationKey ? 'Change endpoint' : 'Choose endpoint…' }}</button><button type="button" class="secondary" :disabled="pending || draft.steps.length >= 100" @click="createNext({from:selected.id})">+ Next request</button></div><code><span class="method" :data-method="selected.method">{{ selected.method }}</span> {{ selected.path }}</code></header>
          <div class="inspector-tabs" role="group" aria-label="Step view"><button type="button" :aria-pressed="tab === 'configure'" @click="tab = 'configure'">Configure</button><button type="button" :aria-pressed="tab === 'response'" @click="tab = 'response'">Response<span v-if="runStep?.httpStatus"> · {{ runStep.httpStatus }}</span></button></div>
          <div v-if="tab === 'response'" class="inspector-content response-content"><p v-if="runStep?.status === 'delaying'" class="attempt-progress" role="status">Delaying until {{ new Date(runStep.nextAttemptAt).toLocaleTimeString() }}</p><p v-if="runStep?.attempt" class="attempt-progress" role="status">Attempt {{ runStep.attempt }} / {{ runStep.maxAttempts }} · {{ runStep.status }}<span v-if="runStep.nextAttemptAt"> · Next attempt at {{ new Date(runStep.nextAttemptAt).toLocaleTimeString() }}</span></p><details v-if="runStep?.attempts?.length > 1" class="attempt-history"><summary>Attempt history ({{ runStep.attempts.length }})</summary><ol><li v-for="attempt in runStep.attempts" :key="attempt.attempt">{{ attempt.attempt }} · HTTP {{ attempt.status ?? '—' }} · {{ attempt.elapsed ?? '—' }} ms · {{ attempt.matched ? 'value matched' : 'not matched' }}</li></ol></details><p v-if="execution.stale" class="muted">Result from the previous run. Run again to use the updated definition.</p><p v-if="runStep?.error" class="error">{{ runStep.error }}</p><SentRequest v-if="runStep?.request" :key="selectedId+':request'" :request="runStep.request" :attempt="runStep.attempt" /><ResponsePreview v-if="runStep?.response" :key="selectedId" :result="runStep.response" :operation="runStep.operation" :pending="pending" /><p v-else class="muted">{{ runStep ? runStep.status : 'Run the scenario to see this response.' }}</p></div>
          <div v-else class="inspector-content">
            <p v-if="!selected.operationKey" class="empty-request-note">Choose an endpoint for this request. Its connection is already in place.</p><p v-else-if="!operation" class="error">Endpoint unavailable. Enable its API connection before running.</p>
            <section class="incoming-links" aria-label="Incoming connections"><h4>Incoming connections</h4><button v-for="edge in inbound" :key="connectionKey(edge.from, edge.to)" type="button" class="secondary" @click="openConnection(edge, $event)">{{ connectionSummary(edge, draft.steps) }}<small v-if="edge.delayMs !== undefined || edge.waitFor"> · Delay / Wait for</small></button><p class="muted">Drag between handles on the map. Configure timing and response bindings using ⚙ on the line.</p></section>
            <StepInputs v-if="operation?.parameters.some(parameter => ['path','query','header'].includes(parameter.in))" :parameters-only="true" :step="selected" :operation="operation" :steps="draft.steps" :variables="draft.variables" :operations="operations" :results="execution.steps" :disabled="pending" />
            <details class="static-request" open><summary>Request · static inputs</summary><fieldset :disabled="pending || !operation"><template v-if="operation"><label v-for="parameter in operation.parameters.filter(parameter => ['path', 'query', 'header'].includes(parameter.in))" :key="parameter.in + ':' + parameter.name">{{ parameter.in }} · {{ parameter.name }}<span v-if="dynamicTargets.has(parameter.in + ':' + parameter.name)" class="input-tag">Filled at run time</span><input v-model="selected.request.fields[parameter.in + ':' + parameter.name]" :disabled="dynamicTargets.has(parameter.in + ':' + parameter.name)" :placeholder="parameter.required || parameter.in === 'path' ? 'Required' : 'Optional'"></label></template></fieldset></details>
            <ScenarioBodyEditor v-if="operation?.requestBody" :key="selected.id" :step="selected" :operation="operation" :steps="draft.steps" :operations="operations" :variables="draft.variables" :results="execution.steps" :disabled="pending" />
            <details class="step-checks"><summary>Response checks ({{selected.request.assertions?.length??0}})</summary><ResponseChecksEditor :session="selected.request" :disabled="pending" /></details>
            <details class="request-limits"><summary>Request limits</summary><fieldset :disabled="pending"><label>Timeout (ms)<input v-model.number="selected.request.timeout" type="number" min="1" max="600000"></label><label>Response budget (MiB)<input v-model.number="selected.request.responseLimitMiB" type="number" min="1" max="512"></label></fieldset></details>
            <button type="button" class="secondary error remove-step" :disabled="pending" @click="removeStep">Remove step</button>
          </div>
        </template>
        <div v-else class="inspector-empty"><strong>Build your API workflow</strong><p>Add any endpoint, name its step and choose where its inputs come from.</p><p>A → B + C → D: connect B and C to A, then D to both. Parallel branches are shown side by side.</p><button type="button" class="primary" :disabled="pending" @click="openAdd">Add first request</button></div>
      </aside>
    </div>
    <dialog ref="edgeDialog" @close="edgeEdit = null; mappingEdit = null" class="connection-popover" :style="popupPosition" aria-labelledby="connection-title" @click="event => event.target === edgeDialog && edgeDialog.close()">
      <form v-if="edgeEdit && edgeTarget" @submit.prevent="saveConnection"><header><div><h3 id="connection-title">{{ connectionSummary(edgeEdit, draft.steps) }}</h3><p>Connection settings · target request</p></div><button type="button" class="secondary" aria-label="Close connection settings" @click="edgeDialog.close()">×</button></header>
        <div class="connection-content"><p class="connection-explanation">Delay happens before {{ edgeTarget.label }}. Wait for checks and repeats <strong>{{ edgeTarget.method }} {{ edgeTarget.path }}</strong>, keeping the source response unchanged.</p>
        <p v-if="allConnections(draft).filter(item => item.to === edgeTarget.id).length > 1" class="muted">At a join, all incoming connections must be ready. Delays overlap after dependencies complete; all response conditions must match the same target response.</p>
        <StepWaiting :step="edgeEdit" :operation="edgeOperation" :disabled="pending" />
        <StepInputs v-if="edgeEdit.from !== null" :step="mappingEdit" :operation="edgeOperation" :steps="draft.steps" :variables="draft.variables" :operations="operations" :results="execution.steps" :fixed-source="edgeEdit.from" :disabled="pending" />
        <p v-else class="muted">Start has no response to bind. Use this connection to configure an independent request.</p>
        <p v-if="edgeTarget.inputs.some(input => input.source === 'variable' && variableProducer(input, draft) === edgeEdit.from)" class="muted">This connection also carries shared response variables. Edit those bindings in the target request’s Dynamic inputs.</p><p v-if="edgeProblem" class="error" role="alert">{{ edgeProblem }}</p><p v-if="pending" class="muted">Run in progress. Connection settings are read only.</p>
        </div><footer><button type="button" class="secondary error" :disabled="pending" @click="removeConnection">{{ edgeEdit.from === null ? 'Reset start connection' : 'Remove connection' }}</button><button type="button" class="secondary" @click="edgeDialog.close()">Cancel</button><button type="submit" class="primary" :disabled="pending">Apply connection</button></footer>
      </form>
    </dialog>
    <dialog ref="addDialog" class="builder-dialog" aria-labelledby="add-request-title" @click="event => event.target === addDialog && addDialog.close()"><header><h3 id="add-request-title">{{ pickingStepId ? 'Choose endpoint for this request' : 'Add any endpoint' }}</h3><button type="button" class="secondary" aria-label="Close endpoint picker" @click="addDialog.close()">×</button></header><input v-model="search" type="search" aria-label="Find endpoint" @keydown.enter.prevent="filtered.length === 1 && add(filtered[0])" placeholder="Search name, route or API"><p class="muted">{{ pickingStepId ? 'The connection is already in place. Choose an endpoint, or close and finish this request later.' : 'No detected relationship required. You can use the same endpoint more than once.' }}</p><ul class="endpoint-options"><li v-for="item in filtered" :key="item.key"><button type="button" @click="add(item)"><span class="method" :data-method="item.method">{{ item.method }}</span><strong>{{ item.name }}</strong><code>{{ item.path }}</code><small>{{ item.apiName }}</small></button></li></ul><p v-if="!filtered.length">No matching endpoints.</p><small v-if="filtered.length === 100">First 100 matches. Narrow the search for more.</small></dialog>
    <dialog ref="runDialog" class="builder-dialog" aria-labelledby="run-builder-title"><form @submit.prevent="startRun"><header><h3 id="run-builder-title">Review scenario run</h3><button type="button" class="secondary" aria-label="Close run review" @click="runDialog.close()">×</button></header><p>{{ draft.name }} · {{ draft.steps.length }} steps</p><p class="muted">Sends real requests, including writes. A failure stops new steps and cancels in-flight requests where possible; completed server changes cannot be rolled back.</p><fieldset v-if="presetNames.length" class="run-presets"><legend>Presets for this run</legend><label v-for="name in presetNames" :key="name"><input v-model="selectedPresets" type="checkbox" :value="name">{{ name }}</label><p>Presets override matching static and dynamic fields. Last selected wins.</p><small v-if="selectedPresets.length">Applied in order: {{ selectedPresets.join(' → ') }}</small><small v-else>No presets. Use the scenario's own inputs.</small></fieldset><p v-else class="muted">No saved presets. Configure them in Settings → Presets.</p><label class="parallel-limit">Maximum parallel requests<input v-model.number="draft.concurrency" type="number" min="1" max="8" required></label><label class="human-toggle"><input v-model="allowHuman" type="checkbox">Human in the loop · pause for missing run-time inputs</label><details v-if="draft.variables.length"><summary>Shared variables ({{ draft.variables.length }})</summary><ul><li v-for="variable in draft.variables" :key="variable.id">{{ variable.name }} · {{ variable.source }} · resolved once if used</li></ul></details><ol class="review-targets"><li v-for="step in review" :key="step.id"><strong>{{ step.label }}</strong><code>{{ step.operation.method }} {{ step.operation.path }}</code><span>{{ step.target.api }} · {{ step.target.label }}</span><small v-if="selectedPresets.length">{{ step.presetOverrides.length ? 'Preset fields: ' + step.presetOverrides.join(', ') : 'No matching preset fields (or shared presets disabled for this API).' }}</small><small>{{ step.inputs.filter(input => input.source === 'human' || input.source === 'variable' && draft.variables.find(variable => variable.id === input.variableId)?.source === 'human').length }} human inputs · {{ step.dependencies.length }} dependencies</small><small v-for="policy in step.entryPolicies.filter(policy => policy.delayMs !== undefined || policy.waitFor)" :key="connectionKey(policy.from, policy.to)">{{ policy.label }}<span v-if="policy.delayMs !== undefined"> · Delay {{ policy.delayMs }} ms</span><span v-if="policy.waitFor"> · Wait for {{ policy.waitFor.pointer || '(root)' }} = {{ policy.waitFor.value }} · Up to {{ policy.waitFor.retryCount + 1 }} {{ step.operation.method }} calls · {{ policy.waitFor.intervalMs }} ms between retries</span></small></li></ol><p v-if="runProblem" class="error" role="alert">{{ runProblem }}</p><div class="run-actions"><button type="button" class="secondary" @click="runDialog.close()">Cancel</button><button type="submit" class="primary" :disabled="pending || !!validation || !!runProblem || !review.length">Run scenario</button></div></form></dialog>
  </section>
</template>
<style scoped>
.connection-popover { position:fixed; margin:0; width:min(420px,calc(100vw - 24px)); max-height:min(680px,calc(100dvh - 24px)); overflow:hidden; padding:0; border:1px solid var(--line); border-radius:.7rem; background:var(--surface); color:inherit; box-shadow:0 12px 45px #163c293d; font-size:.78rem; }.connection-popover::backdrop { background:#17342618; }.connection-popover form { display:flex; flex-direction:column; max-height:min(680px,calc(100dvh - 26px)); }.connection-content { overflow:auto; min-height:0; padding:.1rem .9rem; }.connection-popover header { flex:none; padding:.85rem .9rem; border-bottom:1px solid var(--line); display:flex; align-items:start; justify-content:space-between; gap:.5rem; margin:0; }.connection-popover h3 { margin:0; font-size:.95rem; overflow-wrap:anywhere; }.connection-popover p { line-height:1.5; }.connection-popover header p { color:var(--muted); margin:.25rem 0 0; font-size:.7rem; }.connection-popover footer { flex:none; padding:.65rem .9rem; background:var(--surface); display:flex; justify-content:flex-end; gap:.4rem; flex-wrap:wrap; margin-top:0; border-top:1px solid var(--line); }.connection-popover footer button { font-size:.72rem; }.connection-popover footer .error { margin-right:auto; }.incoming-links { margin-bottom:1rem; display:grid; gap:.4rem; }.incoming-links h4 { margin:0; font-size:.8rem; }.incoming-links button { text-align:left; font-size:.75rem; }.incoming-links p { font-size:.7rem; margin:.2rem 0; }.request-endpoint-actions { display:flex; gap:.4rem; flex-wrap:wrap; font-size:.72rem; }.empty-request-note { padding:.7rem; background:var(--accent-soft); font-size:.8rem; line-height:1.5; }.builder { flex:1; display:flex; flex-direction:column; min-height:0; min-width:0; background:var(--canvas); padding:.8rem; gap:.65rem; }
.builder-header,.builder-actions,.builder-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:.45rem .65rem; }.builder-header h2 { font-size:1rem; margin:0; }.builder-header { font-size:.78rem; }.builder-actions { margin-left:auto; }.save-state { font-size:.68rem; color:var(--muted); }
.builder-toolbar { font-size:.75rem; }.builder-toolbar label { display:flex; gap:.4rem; align-items:center; }.builder-toolbar input,.builder-toolbar select { min-width:0; padding:.35rem; max-width:15rem; }.scenario-name { flex:1; }.scenario-name input { flex:1; }.builder-more { position:relative; }.builder-more summary { cursor:pointer; padding:.4rem; }.builder-more > div { position:absolute; right:0; top:100%; z-index:2; display:grid; gap:.5rem; width:18rem; padding:.8rem; background:var(--surface); border:1px solid var(--line); border-radius:.5rem; box-shadow:0 5px 18px #203b2820; }.builder-more p { font-size:.7rem; line-height:1.5; margin:0; }.builder-more label { display:grid; }
.builder-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(21rem,31%); gap:.7rem; flex:1; min-height:0; }.builder-inspector { display:flex; flex-direction:column; min-height:0; min-width:0; border:1px solid var(--line); border-radius:.65rem; background:var(--surface); overflow:hidden; }.inspector-header { padding:.75rem; display:grid; gap:.5rem; border-bottom:1px solid var(--line); }.inspector-header label { display:grid; gap:.25rem; font-size:.7rem; color:var(--muted); }.inspector-header input { width:100%; min-width:0; font-weight:650; color:var(--accent); }.inspector-header code { font-size:.72rem; overflow-wrap:anywhere; }.inspector-tabs { display:flex; border-bottom:1px solid var(--line); font-size:.78rem; }.inspector-tabs button { flex:1; padding:.6rem; border-radius:0; }.inspector-tabs [aria-pressed=true] { background:var(--accent-soft); color:var(--accent); font-weight:650; }.inspector-content { overflow:auto; padding:.75rem; min-height:0; flex:1; }.inspector-empty { padding:1.2rem; color:var(--muted); font-size:.85rem; line-height:1.6; }
.dependencies { margin:0 0 1rem; border:1px solid var(--line); border-radius:.5rem; padding:.55rem; max-height:12rem; overflow:auto; }.dependencies legend { font-size:.78rem; font-weight:600; }.dependencies label { display:flex; flex-wrap:wrap; gap:.3rem; align-items:center; font-size:.75rem; padding:.15rem; }.dependencies p { font-size:.7rem; margin:.4rem 0 0; }.dependencies small { color:var(--muted); font-size:.65rem; }
.static-request,.request-limits { font-size:.78rem; margin-top:.8rem; border-top:1px solid var(--line); padding-top:.7rem; }summary { cursor:pointer; }.static-request fieldset,.request-limits fieldset { padding:0; border:0; min-width:0; display:grid; gap:.6rem; margin:.7rem 0; }.static-request label,.request-limits label { display:grid; gap:.3rem; font-size:.75rem; }.static-request input { width:100%; min-width:0; }.input-tag { font-size:.65rem; color:var(--accent); }.remove-step { margin-top:.8rem; font-size:.75rem; }.response-content { font-size:.78rem; }.attempt-progress { padding:.5rem; background:var(--accent-soft); border-radius:.35rem; font-size:.75rem; }.attempt-history { margin:.5rem 0; font-size:.72rem; }.response-content :deep(.json-preview) { min-height:15rem; }
.builder-message { margin:0; font-size:.78rem; }.builder-run-status { display:flex; gap:.5rem 1rem; flex-wrap:wrap; font-size:.78rem; padding:.5rem .7rem; background:var(--accent-soft); border-radius:.4rem; }
.human-queue { display:flex; flex-wrap:wrap; gap:.6rem; max-height:38vh; overflow:auto; }.human-card { flex:1 1 22rem; padding:.75rem; border:1px solid #cdad63; border-radius:.6rem; background:#fff8e6; display:grid; gap:.6rem; }.human-card header { display:flex; justify-content:space-between; gap:.5rem; font-size:.8rem; }.human-card label { display:grid; gap:.25rem; font-size:.78rem; }.human-card small { color:var(--muted); font-size:.68rem; }.human-card > div { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem; }.human-card p { margin:0; font-size:.78rem; }
.builder-dialog { width:min(42rem,calc(100% - 2rem)); max-height:85dvh; overflow:auto; padding:1rem; border:1px solid var(--line); border-radius:.7rem; background:var(--surface); color:inherit; }.builder-dialog::backdrop { background:#172b2466; }.builder-dialog header { display:flex; justify-content:space-between; align-items:center; gap:.5rem; margin-bottom:.7rem; }.builder-dialog h3 { font-size:1rem; margin:0; }.builder-dialog p { font-size:.8rem; line-height:1.5; }.builder-dialog > input { width:100%; }.endpoint-options { padding:0; list-style:none; max-height:50vh; overflow:auto; }.endpoint-options button { width:100%; padding:.6rem; border-bottom:1px solid var(--line); text-align:left; display:grid; grid-template-columns:auto 1fr; gap:.3rem .6rem; align-items:start; }.endpoint-options strong { font-size:.82rem; }.endpoint-options code,.endpoint-options small { grid-column:2; color:var(--muted); font-size:.72rem; overflow-wrap:anywhere; }.run-presets { margin:.8rem 0; padding:.6rem; border:1px solid var(--line); border-radius:.45rem; font-size:.78rem; }.run-presets label { display:inline-flex; align-items:center; gap:.3rem; margin:.2rem .7rem .2rem 0; }.run-presets p { margin:.35rem 0; }.run-presets small { color:var(--muted); }.parallel-limit { display:flex; gap:.7rem; align-items:center; font-size:.8rem; }.parallel-limit input { width:5rem; }.human-toggle { display:flex; gap:.5rem; align-items:center; font-size:.8rem; margin:.8rem 0; }.review-targets { padding-left:1.2rem; max-height:35vh; overflow:auto; }.review-targets li { padding:.4rem 0; font-size:.8rem; }.review-targets code,.review-targets span,.review-targets small { display:block; margin-top:.2rem; overflow-wrap:anywhere; color:var(--muted); }.run-actions { display:flex; justify-content:flex-end; gap:.5rem; }
@media(max-width:1050px) { .builder-layout { grid-template-columns:minmax(0,1fr) 21rem; } }
@media(max-width:760px) { .builder { overflow:visible; padding:.65rem; }.builder-layout { grid-template-columns:minmax(0,1fr); }.builder-inspector { min-height:25rem; }.inspector-content { max-height:none; }.builder-actions { margin-left:0; }.builder-toolbar > label { width:100%; }.builder-toolbar select,.builder-toolbar input { max-width:none; flex:1; }.human-queue { max-height:none; }.builder-more > div { right:auto; left:0; }.builder-dialog button { min-height:40px; } }
</style>
