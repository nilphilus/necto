<script setup>
import { ref } from 'vue'
import { pathLabel } from './scenario.js'
const props = defineProps({ scenarios: Array, state: Object, pending: Boolean, busy: Boolean, error: String,
  presetNames: Array, activePresetNames: Array })
const emit = defineEmits(['open', 'run', 'remove', 'stop', 'inspect'])
const runId = ref('')
const selectedPresets = ref([])
const progressTitle = ref(null)
defineExpose({ showProgress: () => progressTitle.value?.scrollIntoView({ block: 'nearest', behavior: 'instant' }) })

function configureRun(scenario) {
  selectedPresets.value = [...props.activePresetNames]
  runId.value = scenario.id
}

function runScenario(scenario) {
  if (props.busy) return
  emit('run', scenario, selectedPresets.value.filter(name => props.presetNames.includes(name)))
  runId.value = ''
}
</script>
<template>
  <section class="scenario-panel work-area" aria-labelledby="scenarios-title">
    <h2 id="scenarios-title">Scenarios</h2>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ul class="saved-list">
      <li v-for="scenario in scenarios" :key="scenario.id">
        <div class="saved-title"><strong>{{ scenario.name }}</strong><span class="muted">{{ scenario.steps.length }} steps</span></div>
        <details class="review"><summary>Review steps</summary>
          <ol>
            <li v-for="(step, index) in scenario.steps" :key="index">
              <span class="method" :data-method="step.method">{{ step.method }}</span> <code>{{ step.path }}</code><small>{{ step.apiId }}</small>
              <p v-for="binding in step.bindings" :key="JSON.stringify([binding.location, binding.name])" class="binding-note">Step {{ binding.sourceStep + 1 }} <code>{{ pathLabel(binding.path) }}</code> → {{ binding.name ?? 'body' }}</p>
            </li>
          </ol>
        </details>
        <div class="actions">
          <button type="button" class="secondary" :disabled="busy" :aria-label="'Open scenario ' + scenario.name" @click="emit('open', scenario)">Open</button>
          <button type="button" class="primary" :disabled="busy" :aria-expanded="runId === scenario.id"
            :aria-label="'Configure run for ' + scenario.name" @click="configureRun(scenario)">Run…</button>
          <button type="button" class="secondary" :disabled="pending" :aria-label="'Delete scenario ' + scenario.name" @click="emit('remove', scenario.id)">Delete</button>
        </div>
        <form v-if="runId === scenario.id" class="run-form" @submit.prevent="runScenario(scenario)">
          <fieldset v-if="presetNames.length" :disabled="busy">
            <legend>Presets for this run</legend>
            <div class="preset-options">
              <label v-for="name in presetNames" :key="name">
                <input v-model="selectedPresets" type="checkbox" :value="name">
                {{ name }}
              </label>
            </div>
            <p class="muted">Selected presets override matching scenario inputs. The last selected preset wins when values overlap.</p>
            <p v-if="selectedPresets.length" class="muted">Applied in order: {{ selectedPresets.join(' → ') }}</p>
          </fieldset>
          <p v-else class="muted">This run will use saved inputs and response bindings.</p>
          <div class="actions">
            <button type="submit" class="primary" :disabled="busy">Run scenario</button>
            <button type="button" class="secondary" @click="runId = ''">Cancel</button>
          </div>
        </form>
      </li>
    </ul>
    <p v-if="!scenarios.length" class="muted">Save a request chain from the API view to see it here.</p>
    <section v-if="state.id" class="run-status" aria-label="Scenario execution">
      <div ref="progressTitle" class="saved-title"><strong>{{ state.name }}</strong><span role="status" aria-live="polite">{{ state.status }}</span><button v-if="pending" type="button" class="secondary" @click="emit('stop')">Stop scenario</button></div>
      <p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
      <ol>
        <li v-for="(step, index) in state.steps" :key="index" class="run-step">
          <button type="button" :disabled="pending" :aria-label="'Inspect scenario step ' + (index + 1)" @click="emit('inspect', index)">
            <span class="method" :data-method="step.operation.method">{{ step.operation.method }}</span> {{ step.operation.name }}
          </button>
          <span :class="{ error: step.status === 'failed' }">{{ step.status }}<template v-if="step.httpStatus !== undefined"> · {{ step.httpStatus }}<template v-if="step.elapsed !== undefined"> · {{ step.elapsed }} ms</template></template></span>
          <small v-if="step.error" class="error">{{ step.error }}</small>
        </li>
      </ol>
      <small v-if="pending" class="muted">Stop prevents later steps. A request already received by the API may still finish.</small>
    </section>
  </section>
</template>
<style scoped>
.scenario-panel { flex: 1; min-height: 0; }
.scenario-panel h2 { margin: 0 0 1rem; }
.scenario-panel p { margin: 0; font-size: .8rem; }
.run-form { margin-top: .75rem; }
.run-form fieldset { min-width: 0; margin: 0; border: 1px solid var(--line); border-radius: .45rem; }
.run-form label { display: flex; align-items: center; gap: .25rem; overflow-wrap: anywhere; }
.run-form p { margin-top: .4rem; }
ul { list-style: none; margin: 0; padding: 0; }.saved-list > li { border-top: 1px solid var(--line); padding: .7rem 0; }.saved-title { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }.saved-title span { font-size: .75rem; }
.actions { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }.actions button { font-size: .8rem; }
.review { margin-top: .4rem; font-size: .78rem; }.review summary { color: var(--muted); }.review ol, .run-status ol { padding-left: 1.3rem; margin: .5rem 0; }.review li { padding: .3rem 0; overflow-wrap: anywhere; }.review small { display: block; color: var(--muted); }.review .binding-note { font-size: .72rem; margin: .2rem 0; color: var(--accent); }
.run-status ol { max-height: 14rem; overflow: auto; }
.run-status { border-top: 1px solid var(--line); padding-top: .7rem; }.run-step { padding: .3rem 0; font-size: .78rem; }.run-step button { padding: .25rem; text-align: left; }.run-step > span { display: inline-block; margin-left: .4rem; color: var(--muted); }.run-step small { display: block; }
</style>
