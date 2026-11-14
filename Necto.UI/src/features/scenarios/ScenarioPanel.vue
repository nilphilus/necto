<script setup>
import { ref } from 'vue'
import { pathLabel } from './scenario.js'
import ScenarioTrace from './ScenarioTrace.vue'
const props = defineProps({ scenarios: Array, state: Object, pending: Boolean, busy: Boolean, error: String,
  presetNames: Array, activePresetNames: Array, runs: Map })
const emit = defineEmits(['open', 'run', 'remove', 'stop', 'inspect'])
const runId = ref('')
const selectedPresets = ref([])
const list = ref(null)
defineExpose({ showProgress: () => list.value?.querySelector('[data-current-run]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }) })

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
    <ul ref="list" class="saved-list">
      <li v-for="scenario in scenarios" :key="scenario.id">
        <div class="saved-title"><strong>{{ scenario.name }}</strong><span class="muted">{{ scenario.steps.length }} steps</span></div>
        <details class="review"><summary>Review steps</summary>
          <ol>
            <li v-for="(step, index) in scenario.steps" :key="index">
              <span class="method" :data-method="step.method">{{ step.method }}</span> <code>{{ step.path }}</code><small>{{ step.apiId }}</small>
              <p v-for="binding in step.bindings" :key="JSON.stringify([binding.location, binding.name])" class="binding-note">Step {{ binding.sourceStep + 1 }} <code>{{ pathLabel(binding.path) }}</code><span v-if="binding.selector"> where {{ binding.selector.field }} = {{ binding.selector.expected }}</span> → {{ binding.name ?? 'body' }}</p>
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
        <p v-if="state.id === scenario.id && state.error && state.error !== runs.get(scenario.id)?.error" class="error" role="alert">{{ state.error }}</p>
        <section v-for="execution in runs.has(scenario.id) ? [runs.get(scenario.id)] : []" :key="execution"
          class="run-status" :data-current-run="state.id === scenario.id || undefined" aria-label="Scenario execution">
          <div class="saved-title">
            <span role="status" aria-live="polite">{{ execution.status }}</span>
            <button v-if="execution.status === 'running'" type="button" class="secondary" @click="emit('stop')">Stop scenario</button>
          </div>
          <p v-if="execution.error" class="error" role="alert">{{ execution.error }}</p>
          <ScenarioTrace v-if="execution.steps.length" :steps="execution.steps" :pending="pending"
            @inspect="emit('inspect', $event, execution)" />
        </section>
      </li>
    </ul>
    <p v-if="!scenarios.length" class="muted">Save a request chain from the API view to see it here.</p>
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
.review { margin-top: .4rem; font-size: .78rem; }.review summary { color: var(--muted); }.review ol { padding-left: 1.3rem; margin: .5rem 0; }.review li { padding: .3rem 0; overflow-wrap: anywhere; }.review small { display: block; color: var(--muted); }.review .binding-note { font-size: .72rem; margin: .2rem 0; color: var(--accent); }
.run-status { margin-top: .7rem; border-top: 1px solid var(--line); padding-top: .7rem; }
</style>
