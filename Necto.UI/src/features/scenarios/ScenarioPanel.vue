<script setup>
import { computed, ref, watch } from 'vue'
import { pathLabel } from './scenario.js'
const props = defineProps({ scenarios: Array, state: Object, pending: Boolean, busy: Boolean, chainLength: Number, error: String })
const emit = defineEmits(['save', 'open', 'run', 'remove', 'stop', 'inspect'])
const name = ref('')
const opened = ref(false)
const progressTitle = ref(null)
defineExpose({ showProgress: () => progressTitle.value?.scrollIntoView({ block: 'nearest', behavior: 'instant' }) })
const active = computed(() => props.scenarios.find(item => item.id === props.state.id))
const overwriting = computed(() => active.value && active.value.name === name.value.trim())
watch(() => props.state.id, () => { name.value = active.value?.name ?? '' })
</script>
<template>
  <details class="scenario-panel preset-panel" :open="opened || pending" @toggle="opened = $event.target.open">
    <summary>Scenarios <span v-if="scenarios.length">({{ scenarios.length }})</span><span v-if="pending"> · Running…</span></summary>
    <p class="muted">Save a request chain and replay it with fresh response values. Runs use your current request presets and context. Open to edit inputs, then save changes before running again.</p>
    <form class="save-scenario" @submit.prevent="emit('save', name, overwriting ? active.id : undefined)">
      <label>Scenario name <input v-model="name" required maxlength="120" placeholder="Invoice details" :disabled="pending"></label>
      <button class="secondary" type="submit" :disabled="busy || !chainLength">{{ overwriting ? 'Update scenario' : 'Save current chain' }} ({{ chainLength }} steps)</button>
    </form>
    <small class="muted">Stores request inputs and response selectors locally for this API. Response bodies and values supplied by presets are not stored. Array selections replay by index.</small>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ul class="saved-list">
      <li v-for="scenario in scenarios" :key="scenario.id">
        <div class="saved-title"><strong>{{ scenario.name }}</strong><span class="muted">{{ scenario.steps.length }} steps</span></div>
        <details class="review"><summary>Review steps</summary>
          <ol>
            <li v-for="(step, index) in scenario.steps" :key="index">
              <span class="method" :data-method="step.method">{{ step.method }}</span> <code>{{ step.path }}</code><small>{{ step.apiId }}</small>
              <p v-for="binding in step.bindings" :key="JSON.stringify([binding.location, binding.name])" class="binding-note">Step {{ binding.sourceStep + 1 }} <code>{{ pathLabel(binding.path) }}</code> → {{ binding.name ?? 'body' }}</p>
              <small v-if="!step.bindings.length">Saved inputs / current presets</small>
            </li>
          </ol>
        </details>
        <div class="actions">
          <button type="button" class="secondary" :disabled="busy" :aria-label="'Open scenario ' + scenario.name" @click="emit('open', scenario)">Open</button>
          <button type="button" class="primary" :disabled="busy" :aria-label="'Run scenario ' + scenario.name" @click="emit('run', scenario)">Run scenario ↗</button>
          <button type="button" class="secondary" :disabled="pending" :aria-label="'Delete scenario ' + scenario.name" @click="emit('remove', scenario.id)">Delete</button>
        </div>
      </li>
    </ul>
    <p v-if="!scenarios.length" class="muted">Build a chain using related requests, then save it here.</p>
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
  </details>
</template>
<style scoped>
.scenario-panel { gap: .7rem; }
.scenario-panel > summary { font-weight: 650; }
.scenario-panel p { margin: 0; font-size: .8rem; }
.save-scenario { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; }.save-scenario label { display: grid; gap: .3rem; flex: 1 1 14rem; }.save-scenario input { min-width: 0; width: 100%; }.save-scenario button { padding: .5rem .7rem; }
ul { list-style: none; margin: 0; padding: 0; }.saved-list > li { border-top: 1px solid var(--line); padding: .7rem 0; }.saved-title { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }.saved-title span { font-size: .75rem; }
.actions { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }.actions button { font-size: .8rem; }
.review { margin-top: .4rem; font-size: .78rem; }.review summary { color: var(--muted); }.review ol, .run-status ol { padding-left: 1.3rem; margin: .5rem 0; }.review li { padding: .3rem 0; overflow-wrap: anywhere; }.review small { display: block; color: var(--muted); }.review .binding-note { font-size: .72rem; margin: .2rem 0; color: var(--accent); }
.run-status ol { max-height: 14rem; overflow: auto; }
.run-status { border-top: 1px solid var(--line); padding-top: .7rem; }.run-step { padding: .3rem 0; font-size: .78rem; }.run-step button { padding: .25rem; text-align: left; }.run-step > span { display: inline-block; margin-left: .4rem; color: var(--muted); }.run-step small { display: block; }
</style>
