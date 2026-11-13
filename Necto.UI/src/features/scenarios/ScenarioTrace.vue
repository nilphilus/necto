<script setup>
import { computed, ref, watch } from 'vue'
import ScenarioComparison from './ScenarioComparison.vue'
import TracePayload from './TracePayload.vue'
import { pathLabel } from './scenario.js'
import { executionFocus, traceSteps } from './trace.js'
const props = defineProps({ steps: { type: Array, required: true }, pending: Boolean })
defineEmits(['inspect'])
const view = ref('steps')
const selectedIndex = ref(0)
const compareRequest = ref(false)
watch(selectedIndex, () => { compareRequest.value = false })
const following = ref(true)
const cards = computed(() => traceSteps(props.steps))
const selected = computed(() => cards.value[selectedIndex.value])
watch(() => props.steps, () => { following.value = true; selectedIndex.value = executionFocus(props.steps) }, { immediate: true })
watch(() => executionFocus(props.steps), index => { if (following.value) selectedIndex.value = index })
function select(index) { selectedIndex.value = index; following.value = false }
function follow() { following.value = true; selectedIndex.value = executionFocus(props.steps) }
</script>
<template>
  <div class="scenario-execution">
    <div class="execution-toolbar">
      <div role="group" aria-label="Execution view">
        <button type="button" class="secondary" :aria-pressed="view === 'steps'" @click="view = 'steps'">Steps</button>
        <button type="button" class="secondary" :aria-pressed="view === 'compare'" @click="view = 'compare'">Compare all</button>
      </div>
      <button v-if="pending && !following" type="button" class="secondary" @click="follow">Follow execution</button>
    </div>
    <ScenarioComparison v-if="view === 'compare'" :steps="steps" :pending="pending" @inspect="$emit('inspect', $event)" />
    <div v-else class="execution-overview">
      <ol class="execution-steps" aria-label="Execution steps">
        <li v-for="(card, index) in cards" :key="index">
          <button type="button" class="step-choice" :aria-current="index === selectedIndex ? 'step' : undefined"
            :aria-label="'Show step ' + (index + 1) + ': ' + card.step.operation.name" @click="select(index)">
            <span class="step-title"><span class="step-number">{{ index + 1 }}</span><span class="method" :data-method="card.step.operation.method">{{ card.step.operation.method }}</span><strong>{{ card.step.operation.name }}</strong></span>
            <span class="step-meta"><span class="step-status" :data-status="card.step.status">{{ card.step.status }}</span><span v-if="card.step.httpStatus !== undefined">HTTP {{ card.step.httpStatus }}</span><span v-if="card.step.elapsed !== undefined">{{ card.step.elapsed }} ms</span></span>
          </button>
        </li>
      </ol>
      <article v-if="selected" class="selected-step" aria-label="Selected step details">
        <header>
          <div><h3>{{ selectedIndex + 1 }}. {{ selected.step.operation.name }}</h3><code>{{ selected.step.operation.method }} {{ selected.step.operation.path }}</code></div>
          <button type="button" class="secondary" :aria-pressed="compareRequest" @click="compareRequest = !compareRequest">Request and response</button>
          <button type="button" class="secondary" :disabled="pending" :aria-label="'Open request for step ' + (selectedIndex + 1)" @click="$emit('inspect', selectedIndex)">Open request</button>
        </header>
        <p v-if="selected.step.error" class="step-error error" role="status">{{ selected.step.error }}</p>
              <div v-if="selected.inputs.length" class="mapped-inputs">
                <h5>Values from earlier responses</h5>
                <button v-for="binding in selected.inputs" :key="binding.target" type="button" class="binding" :style="{ '--binding-color': binding.color }"
                  :aria-label="'Show source step ' + (binding.sourceStep + 1) + ' for ' + binding.target" @click="select(binding.sourceStep)">
                  <span>{{ binding.target }} ← Step {{ binding.sourceStep + 1 }}</span><code>{{ binding.value }}</code>
                </button>
              </div>
        <div class="selected-columns" :class="{ compare: compareRequest }">
          <section class="selected-response" aria-label="Selected step response">
            <h4>Response <span v-if="selected.step.httpStatus !== undefined">{{ selected.step.httpStatus }}</span></h4>
            <div v-if="selected.outputs.length" class="mapped-outputs">
              <h5>Values used by later steps</h5>
              <div v-for="binding in selected.outputs" :key="binding.id" class="binding" :style="{ '--binding-color': binding.color }"><span>{{ pathLabel(binding.path) }}</span><code>{{ binding.value }}</code></div>
            </div>
            <TracePayload :key="selectedIndex" v-if="selected.step.response && (selected.step.response.json !== undefined || selected.step.response.text)"
              :value="selected.step.response.json" :text="selected.step.response.text" />
            <p v-else class="muted">{{ selected.step.response ? 'Empty response body.' : 'No response received.' }}</p>
          </section>
          <details :key="selectedIndex" :open="compareRequest" class="selected-request" aria-label="Selected step request">
            <summary>Request details</summary>
            <template v-if="selected.request">
              <code class="request-url">{{ selected.request.url }}</code>

              <details v-if="Object.keys(selected.request.headers).length"><summary>Headers</summary><TracePayload :value="selected.request.headers" /></details>
              <TracePayload v-if="selected.request.body !== undefined" :value="selected.request.body" />
            </template>
            <p v-else class="muted">No request sent.</p>
          </details>
        </div>
      </article>
    </div>
  </div>
</template>
<style scoped>
.scenario-execution { min-width: 0; margin-top: .5rem; }
.execution-toolbar, .execution-toolbar > div { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
.execution-toolbar { justify-content: space-between; margin-bottom: .65rem; font-size: .78rem; }
.execution-toolbar [aria-pressed="true"] { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.execution-overview { display: grid; grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr); align-items: start; gap: .75rem; }
.execution-overview > *, .selected-columns > * { min-width: 0; }
.execution-steps { display: grid; gap: .35rem; list-style: none; padding: 0; margin: 0; }
.step-choice { width: 100%; display: grid; gap: .4rem; text-align: left; border: 1px solid var(--line); padding: .65rem; background: var(--surface); }
.step-choice[aria-current] { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 3px 0 var(--accent); }
.step-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: .3rem; font-size: .8rem; overflow-wrap: anywhere; }
.step-number { font-weight: 700; color: var(--muted); }.step-meta { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; font-size: .7rem; color: var(--muted); }
.step-status { padding: .1rem .3rem; border-radius: .25rem; background: #edf0ed; }.step-status[data-status="completed"] { color: #125f41; background: #ddf3e8; }.step-status[data-status="failed"], .step-status[data-status="cancelled"] { color: #8f2225; background: #ffe3e2; }.step-status[data-status="running"] { color: #18507d; background: #e5effa; }
.selected-step { border: 1px solid var(--line); border-radius: .55rem; overflow-wrap: anywhere; background: var(--surface); }
.selected-step > header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; padding: .75rem; border-bottom: 1px solid var(--line); }
.selected-step h3 { margin: 0 0 .3rem; font-size: .95rem; }.selected-step header code { font-size: .75rem; color: var(--muted); }.selected-step header button { font-size: .78rem; }
.selected-columns { display: grid; grid-template-columns: minmax(0, 1fr); }
.selected-columns.compare { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
.selected-columns.compare .selected-request { grid-column: 1; grid-row: 1; }
.selected-columns.compare .selected-response { grid-column: 2; grid-row: 1; }
.selected-columns > details { min-width: 0; padding: .75rem; font-size: .8rem; border-top: 1px solid var(--line); }
.selected-request summary { cursor: pointer; font-weight: 650; }
.selected-request[open] > summary { margin-bottom: .6rem; }
.selected-step > .mapped-inputs { padding: .45rem .75rem; }
.selected-step > .mapped-inputs .binding { display: inline-flex; flex-wrap: wrap; gap: .5rem; width: auto; margin: 0 .4rem .2rem 0; }

.selected-columns > section { display: grid; align-content: start; gap: .6rem; padding: .75rem; font-size: .8rem; }
.selected-response { border-left: 0; }
.selected-columns.compare .selected-response { border-left: 1px solid var(--line); }h4, h5, p { margin: 0; }h4 { font-size: .85rem; }h5 { font-weight: 500; color: var(--muted); font-size: .72rem; margin-bottom: .4rem; }summary { cursor: pointer; }
.request-url { color: var(--muted); }.step-error { padding: .65rem .75rem; }
.binding { display: grid; gap: .2rem; width: 100%; padding: .35rem .45rem; margin-bottom: .35rem; border-left: .22rem solid var(--binding-color); background: color-mix(in srgb, var(--binding-color) 12%, white); border-radius: .25rem; text-align: left; font-size: .76rem; }
.binding span { color: var(--binding-color); }.binding code { overflow-wrap: anywhere; white-space: pre-wrap; }
@media (max-width: 1000px) { .execution-overview { grid-template-columns: minmax(0, 1fr); }.execution-steps { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); } }
@media (max-width: 650px) { .execution-steps { grid-template-columns: minmax(0, 1fr); }.selected-columns { grid-template-columns: minmax(0, 1fr); }.selected-response { border-left: 0; border-top: 1px solid var(--line); } }
</style>

<style scoped>
@media (max-width: 650px) {
  .selected-columns.compare { grid-template-columns: minmax(0, 1fr); }
  .selected-columns.compare .selected-response { grid-column: 1; grid-row: 1; border-left: 0; }
  .selected-columns.compare .selected-request { grid-column: 1; grid-row: 2; }
}
</style>
