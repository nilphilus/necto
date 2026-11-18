<script setup>
import { workspaceIdentity } from '../workbench/workspaceIdentity.js'
import FolderSave from '../scenario-folder/FolderSave.vue'
import FolderLibrary from '../scenario-folder/FolderLibrary.vue'
import FolderFeedback from '../scenario-folder/FolderFeedback.vue'
import ScenarioCi from '../workbench/ScenarioCi.vue'
import ScenarioExport from './ScenarioExport.vue'

import { nextTick, ref } from 'vue'
import { pathLabel } from './scenario.js'
import ScenarioTrace from './ScenarioTrace.vue'
const props = defineProps({ scenarios: Array, builderScenarios: Array, builderError: String, state: Object, pending: Boolean, busy: Boolean, error: String,
  presetNames: Array, activePresetNames: Array, runs: Map, document: Object, mappings: Array, configuration: Object, deleted: Object, folder:Object })

const emit = defineEmits(['open', 'run', 'remove', 'stop', 'inspect', 'undo-remove', 'builder', 'open-builder-scenario', 'folder-settings'])
const runId = ref('')
const selectedPresets = ref([])
const list = ref(null), undoButton = ref(null), title = ref(null)
async function deleteScenario(id) {
  emit('remove', id)
  await nextTick(); undoButton.value?.focus()
}
async function undoDeletion() {
  const id = props.deleted?.id
  emit('undo-remove')
  await nextTick()
  const row = [...(list.value?.children ?? [])].find(item => item.dataset.scenarioId === id)
  row?.querySelector('button[aria-label^="Open scenario"]')?.focus()
}
defineExpose({ showProgress: () => list.value?.querySelector('[data-current-run]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }) })

function descriptionFor(scenario, separator) {
  if (scenario.description?.trim()) return scenario.description.trim()
  const labels = scenario.steps.slice(0, 3).map((step) => step.label || step.name || step.operationKey)
  const more = scenario.steps.length - labels.length
  return labels.join(separator) + (more > 0 ? ` · +${more} more` : '')
}

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
    <div class="scenarios-heading"><h2 id="scenarios-title" ref="title" tabindex="-1">Scenarios</h2><button type="button" class="secondary" :disabled="busy" @click="emit('builder')">Scenario Builder →</button></div><p class="builder-intro muted">Save a quick request chain from the API view, or use Builder for parallel branches, manual connections and run-time inputs.</p>
    <FolderFeedback :folder="folder" />
    <FolderLibrary :folder="folder" />
    <div v-if="deleted" class="deletion-feedback" role="status">Deleted “{{ deleted.name }}”.
      <button ref="undoButton" type="button" class="secondary" :disabled="pending" @click="undoDeletion">Undo delete</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="builderError" class="error" role="alert">{{ builderError }}</p>
    <ul ref="list" class="saved-list">
      <li v-for="scenario in builderScenarios" :key="'builder:' + scenario.id" class="scenario-card">
        <div class="saved-title">
          <h3>{{ scenario.name }}</h3>
          <span class="muted">Builder · {{ scenario.steps.length }} steps</span>
        </div>
        <p v-if="scenario.steps.length || scenario.description" class="card-description">{{ descriptionFor(scenario, ', ') }}</p>
        <div class="actions">
          <button type="button" class="secondary" :disabled="busy"
            :aria-label="'Open Builder scenario ' + scenario.name"
            @click="emit('open-builder-scenario', scenario.id)">Open</button>
          <button type="button" class="primary" :disabled="busy || !scenario.steps.length"
            :aria-label="'Review and run ' + scenario.name"
            @click="emit('open-builder-scenario', scenario.id, true)">Review &amp; run</button>
        </div>
      </li>
      <li v-for="scenario in scenarios" :key="'chain:' + scenario.id" :data-scenario-id="scenario.id" class="scenario-card">
        <div class="saved-title"><h3>{{ scenario.name }}</h3><span class="muted">Quick chain · {{ scenario.steps.length }} steps</span><ScenarioExport :scenario="scenario" :workspace="workspaceIdentity(configuration)" /><ScenarioCi :scenario="scenario" :document="document" :mappings="mappings" :configuration="configuration" /></div>

        <p class="card-description">{{ descriptionFor(scenario, ' → ') }}</p>
        <FolderSave :folder="folder" kind="chain" :scenario="scenario" :disabled="busy" @configure="emit('folder-settings')" />
        <details class="review"><summary>Review steps</summary>
          <ol>
            <li v-for="(step, index) in scenario.steps" :key="index">
              <span class="method" :data-method="step.method">{{ step.method }}</span> <code>{{ step.path }}</code><small>{{ step.apiId }} · {{ step.timeout ?? 30000 }} ms · {{ step.responseLimitMiB ?? 32 }} MiB response budget</small>
              <p v-for="binding in step.bindings" :key="JSON.stringify([binding.location, binding.name])" class="binding-note">Step {{ binding.sourceStep + 1 }} <code>{{ pathLabel(binding.path) }}</code><span v-if="binding.selector"> where {{ binding.selector.field }} = {{ binding.selector.expected }}</span> → {{ binding.name ?? 'body' }}</p>
            </li>
          </ol>
        </details>
        <div class="actions">
          <button type="button" class="secondary" :disabled="busy" :aria-label="'Open scenario ' + scenario.name" @click="emit('open', scenario)">Open</button>
          <button type="button" class="primary" :disabled="busy" :aria-expanded="runId === scenario.id"
            :aria-label="'Configure run for ' + scenario.name" @click="configureRun(scenario)">Run…</button>
          <button type="button" class="secondary" :disabled="pending" :aria-label="'Delete scenario ' + scenario.name" @click="deleteScenario(scenario.id)">Delete</button>
        </div>
        <form v-if="runId === scenario.id" class="run-form" @submit.prevent="runScenario(scenario)">
          <slot name="run-targets" :scenario="scenario" :preset-names="selectedPresets" />
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
    <p v-if="!scenarios.length && !builderScenarios.length" class="muted">Save a request chain or a Builder scenario to see it here.</p>
  </section>
</template>
<style scoped>
.deletion-feedback { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-bottom: .75rem; font-size: .85rem; }
.scenarios-heading { display:flex; align-items:baseline; justify-content:space-between; gap:.6rem; flex-wrap:wrap; }.scenario-panel .builder-intro { margin-bottom:.8rem; }.scenario-panel { flex: 1; min-height: 0; }
.scenario-panel h2 { margin: 0 0 1rem; }
.scenario-panel p { margin: 0; font-size: .8rem; }
.run-form { margin-top: .75rem; }
.run-form fieldset { min-width: 0; margin: 0; border: 1px solid var(--line); border-radius: .45rem; }
.run-form label { display: flex; align-items: center; gap: .25rem; overflow-wrap: anywhere; }
.run-form p { margin-top: .4rem; }
.saved-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  align-items: start;
  gap: .65rem;
  list-style: none;
  margin: .65rem 0 0;
  padding: 0;
}
.scenario-card {
  min-width: 0;
  padding: .8rem;
  border: 1px solid var(--line);
  border-radius: .55rem;
  overflow-wrap: anywhere;
}
.saved-title h3 { margin: 0; font-size: .95rem; }
.scenario-panel .card-description { margin-top: .4rem; line-height: 1.45; white-space: pre-wrap; }
.saved-title { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }.saved-title span { font-size: .75rem; }
.actions { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }.actions button { font-size: .8rem; }
.review { margin-top: .4rem; font-size: .78rem; }.review summary { color: var(--muted); }.review ol { padding-left: 1.3rem; margin: .5rem 0; }.review li { padding: .3rem 0; overflow-wrap: anywhere; }.review small { display: block; color: var(--muted); }.review .binding-note { font-size: .72rem; margin: .2rem 0; color: var(--accent); }
.run-status { margin-top: .7rem; border-top: 1px solid var(--line); padding-top: .7rem; }
</style>
