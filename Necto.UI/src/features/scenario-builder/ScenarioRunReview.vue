<script setup>
import { computed, ref } from 'vue'
import { connectionKey } from './connections.js'
import { inputSources } from './variables.js'

const props = defineProps({
  name: String,
  stepCount: Number,
  variables: Array,
  activePresets: Array,
  suggestedPresets: Array,
  issues: Array,
  steps: Array,
  pending: Boolean,
  validation: String,
  runProblem: String,
  problemStep: String,
  review: Array,
})
const emit = defineEmits(['start', 'go-to-step', 'activate-preset', 'use-missing-values'])

const values = ref({})
const errors = ref({})
function key(issue) {
  return JSON.stringify([issue.stepId, issue.target?.location, issue.target?.name, issue.missingInput ? '' : issue.message])
}
const groups = computed(() => {
  const byStep = new Map()
  for (const issue of props.issues) {
    if (!byStep.has(issue.stepId)) byStep.set(issue.stepId, [])
    byStep.get(issue.stepId).push(issue)
  }
  return [...byStep].map(([id, issues]) => ({ id, label: props.steps.find(step => step.id === id)?.label, issues }))
})
const hasValues = computed(() => props.issues.some(issue =>
  issue.missingInput && issue.target && values.value[key(issue)]?.trim()))

function applyValues(issues = props.issues) {
  const entries = []
  for (const issue of issues) {
    if (!issue.missingInput || !issue.target) continue
    const id = key(issue)
    const raw = values.value[id]
    if (!raw?.trim()) continue
    try {
      const value = issue.target.location === 'body' ? JSON.parse(raw) : raw
      entries.push({ issue, value })
      delete errors.value[id]
      delete values.value[id]
    } catch {
      errors.value[id] = 'Enter a valid JSON value.'
    }
  }
  if (entries.length) emit('use-missing-values', entries)
}
const concurrency = defineModel('concurrency', { type: [Number, String], required: true })
const allowHuman = defineModel('allowHuman', { type: Boolean, required: true })
const runDialog = ref(null)

defineExpose({
  showModal: () => { values.value = {}; errors.value = {}; runDialog.value.showModal() },
  close: () => runDialog.value.close(),
  isOpen: () => !!runDialog.value?.open,
})
</script>

<template>
  <dialog ref="runDialog" class="builder-dialog" aria-labelledby="run-builder-title">
    <form @submit.prevent="$emit('start')">
      <header>
        <h3 id="run-builder-title">Review scenario run</h3>
        <button
          type="button"
          class="secondary"
          aria-label="Close run review"
          @click="runDialog.close()"
        >
          ×
        </button>
      </header>
      <p>{{ name }} · {{ stepCount }} steps</p>
      <p class="muted">
        Sends real requests, including writes. A failure stops new steps and cancels in-flight
        requests where possible; completed server changes cannot be rolled back.
      </p>
      <p v-if="activePresets.length" class="muted">Active presets · {{ activePresets.join(' → ') }}</p>
      <label class="parallel-limit"
        >Parallel requests for this run<input
          v-model.number="concurrency"
          type="number"
          min="1"
          max="8"
          required /></label
      ><label class="human-toggle"
        ><input v-model="allowHuman" type="checkbox" />Human in the loop · pause for missing
        run-time inputs</label
      >
      <details v-if="variables.length">
        <summary>Shared variables ({{ variables.length }})</summary>
        <ul>
          <li v-for="variable in variables" :key="variable.id">
            {{ variable.name }} · {{ variable.source }} · resolved once if used
          </li>
        </ul>
      </details>
      <p v-if="review.some(step => !['GET', 'HEAD', 'OPTIONS'].includes(step.operation.method) &&
        step.entryPolicies.some(policy => policy.waitFor?.retryCount > 0))" class="repeat-warning" role="alert">
        A wait condition can repeat requests that change server data. Check the call limits below.
      </p>
      <ol class="review-targets">
        <li v-for="step in review" :key="step.id">
          <strong>{{ step.label }}</strong
          ><code>{{ step.operation.method }} {{ step.operation.path }}</code
          ><span>{{ step.target.api }} · {{ step.target.label }}</span
          ><small v-if="activePresets.length">{{
            step.presetOverrides.length
              ? 'Preset fields: ' + step.presetOverrides.join(', ')
              : 'No matching preset fields (or shared presets disabled for this API).'
          }}</small
          ><small v-for="expression in step.bodyExpressions" :key="expression.pointer" class="review-expression">
            <code>{{ expression.pointer || '(whole body)' }}</code> · {{ expression.overridden ? 'Expression overridden by preset' : 'Expression evaluated before send' }}
          </small><small
            >{{
              step.inputs
                .flatMap(inputSources)
                .filter(
                  (input) =>
                    input.source === 'human' ||
                    (input.source === 'variable' &&
                      variables.find((variable) => variable.id === input.variableId)?.source ===
                        'human')
                ).length
            }}
            human inputs · {{ step.dependencies.length }} dependencies</small
          ><small
            v-for="policy in step.entryPolicies.filter(
              (policy) => policy.delayMs !== undefined || policy.waitFor
            )"
            :key="connectionKey(policy.from, policy.to)"
            >{{ policy.label
            }}<span v-if="policy.delayMs !== undefined"> · Delay {{ policy.delayMs }} ms</span
            ><span v-if="policy.waitFor">
              · Wait for {{ policy.waitFor.pointer || '(root)' }} = {{ policy.waitFor.value }} · Up
              to {{ policy.waitFor.retryCount + 1 }} {{ step.operation.method }} calls ·
              {{ policy.waitFor.intervalMs }} ms between retries</span
            ></small
          >
        </li>
      </ol>
      <p v-if="runProblem" class="error" role="alert">
        {{ runProblem }}
        <button v-if="problemStep" type="button" class="secondary" @click="$emit('go-to-step')">Go to step</button>
      </p>
      <section v-if="groups.length" class="missing-input" aria-label="Resolve run issues">
        <fieldset v-for="group in groups" :key="group.id">
          <legend>{{ group.label }}</legend>
          <div v-for="issue in group.issues" :key="key(issue)" class="run-issue">
            <p class="error" role="alert">{{ issue.message }}</p>
            <div class="issue-actions">
              <label v-if="issue.missingInput && issue.target">Value for {{ issue.target.name || 'request body' }}
                <input v-model="values[key(issue)]" :placeholder="issue.target.location === 'body' ? 'JSON value' : undefined"
                  @keydown.enter.prevent="applyValues([issue])">
              </label>
              <button type="button" class="secondary" @click="$emit('go-to-step', issue)">Go to step</button>
            </div>
            <p v-if="errors[key(issue)]" role="alert">{{ errors[key(issue)] }}</p>
          </div>
        </fieldset>
        <button v-if="issues.some(issue => issue.missingInput && issue.target)" type="button" class="secondary"
          :disabled="!hasValues" @click="applyValues()">Use for this run</button>
        <details v-for="preset in suggestedPresets" :key="preset.name">
          <summary>Preset {{ preset.name }} · affected fields</summary>
          <ul><li v-for="field in preset.fields" :key="field">{{ field }}</li></ul>
          <p>Activation updates the shared preset selection. It stays active after you close this review.</p>
          <button type="button" class="secondary" @click="$emit('activate-preset', preset.name)">
            Activate preset globally · {{ preset.name }}
          </button>
        </details>
      </section>
      <div class="run-actions">
        <button type="button" class="secondary" @click="runDialog.close()">Cancel</button
        ><button
          type="submit"
          class="primary"
          :disabled="pending || !!validation || !!runProblem || !!issues.length || !review.length"
        >
          Run scenario
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.review-expression { color: var(--accent); }

.repeat-warning { padding: .5rem; border-inline-start: 3px solid #b79b55; background: var(--subtle); }
.builder-dialog {
  width: min(42rem, calc(100% - 2rem));
  max-height: 85dvh;
  overflow: auto;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: var(--surface);
  color: inherit;
}
.builder-dialog::backdrop {
  background: #172b2466;
}
.builder-dialog header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.7rem;
}
.builder-dialog h3 {
  font-size: 1rem;
  margin: 0;
}
.builder-dialog p {
  font-size: 0.8rem;
  line-height: 1.5;
}
.missing-input { display: grid; gap: .45rem; }
.missing-input button { justify-self: start; }
.missing-input fieldset { min-inline-size: 0; border: 1px solid var(--line); }
.run-issue { overflow-wrap: anywhere; }
.issue-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: end; }
.issue-actions label { display: grid; gap: .2rem; }
.parallel-limit {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  font-size: 0.8rem;
}
.parallel-limit input {
  width: 5rem;
}
.human-toggle {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.8rem;
  margin: 0.8rem 0;
}
.review-targets {
  padding-left: 1.2rem;
  max-height: 35vh;
  overflow: auto;
}
.review-targets li {
  padding: 0.4rem 0;
  font-size: 0.8rem;
}
.review-targets code,
.review-targets span,
.review-targets small {
  display: block;
  margin-top: 0.2rem;
  overflow-wrap: anywhere;
  color: var(--muted);
}
.run-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (max-width: 760px) {
  .builder-dialog button {
    min-height: 40px;
  }
}
</style>
