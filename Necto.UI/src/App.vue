<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import NectoSkeleton from './NectoSkeleton.vue'
import { useCatalog } from './features/api-catalog/catalog.js'
import EndpointCatalog from './features/api-catalog/EndpointCatalog.vue'
import OperationRunner from './features/request-runner/OperationRunner.vue'
import { useRequestRunner } from './features/request-runner/useRequestRunner.js'
import { applyChoice, useRelatedEndpoints } from './features/related-endpoints/mappings.js'
import ValueInput from './features/related-endpoints/ValueInput.vue'
import RelatedChoices from './features/related-endpoints/RelatedChoices.vue'
import RelatedTargets from './features/related-endpoints/RelatedTargets.vue'
import ExternalApiSettings from './features/external-apis/ExternalApiSettings.vue'
import EndpointGraph from './features/endpoint-graph/EndpointGraph.vue'
import EntityGraph from './features/entity-graph/EntityGraph.vue'
import ScenarioPanel from './features/scenarios/ScenarioPanel.vue'
import { useScenarios } from './features/scenarios/useScenarios.js'
import { rememberBinding } from './features/scenarios/scenario.js'
import ValuesEditor from './features/environments/ValuesEditor.vue'
import { buildRequest, fieldKey, contextKey, resolveRequestValues, supportedParameters } from './features/request-runner/request.js'

const { spec, configuration, error, operations, groups, externalApis } = useCatalog()
const { sessions, sessionFor, createSession, run } = useRequestRunner(configuration)
const { error: mappingError, targetsFor, choicesFor, selectablePaths, mappings: endpointMappings, links: mappingLinks, pending: mappingPending } = useRelatedEndpoints(configuration, operations, externalApis.contexts)

const { connections, show: showExternalApis, statuses: externalStatuses, storageError: externalStorageError } = externalApis
const externalPending = computed(() => showExternalApis.value && [...externalStatuses.values()].some(status => status.pending))
const selectedChain = ref([])
const inspectedScenarioStep = ref(null)
const scenarioPanel = ref(null)
const scenarioStore = useScenarios(configuration)
const { scenarios, state: scenarioState, runs: scenarioRuns, pending: scenarioPending, error: scenarioError } = scenarioStore
const scenarioName = ref('')
const editingScenarioId = ref('')
const overwriteScenario = computed(() => scenarios.value.find(scenario =>
  scenario.id === editingScenarioId.value && scenario.name === scenarioName.value.trim()))
const scenarioBusy = computed(() => scenarioPending.value || mappingPending.value || externalPending.value || [...sessions.values(), ...chain.value.map(step => step.session)].some(session => session.pending))
const presets = ref(new Map())
const activePresetNames = ref([])
const settingsOpen = ref(false)
const skeletonWalking = ref(false)
let stampClicks = 0
let firstStampClick = 0
const settingsButton = ref(null)
const settingsCloseButton = ref(null)
const graphView = ref('')
const editedPresetName = ref('')
const newPresetName = ref('')
const presetError = ref('')
const activePresetValues = computed(() => activePresetNames.value.map(name => presets.value.get(name)))
const editedPresetValues = computed(() => presets.value.get(editedPresetName.value))
// Keep the original storage key so saved environments carry over to presets.
const storageKey = computed(() => 'necto:environments:' + configuration.value?.openApiUrl)
const endpointHeading = ref(null)
const workArea = ref(null)
const chain = computed(() => {
  if (selectedChain.value.length) return selectedChain.value
  const group = groups.value[0]
  const operation = group?.operations[0]
  return operation ? [{ operation, group: group.name, session: sessionFor(operation) }] : []
})
const currentIndex = computed(() => inspectedScenarioStep.value === null ? chain.value.length - 1 : Math.min(inspectedScenarioStep.value, chain.value.length - 1))
const current = computed(() => chain.value[currentIndex.value])
const requestValues = computed(() => current.value ? valuesFor(current.value.operation) : new Map())
const visiblePresetNames = computed(() => {
  if (!current.value) return []
  const { operation } = current.value
  const parameterKeys = new Set(supportedParameters(operation).map(contextKey))
  return [...presets.value].filter(([, preset]) => {
    const values = valuesFor(operation, [preset])
    // The request runner also sends preset headers absent from the OpenAPI definition.
    return [...values.keys()].some(key => key.startsWith('header:') || parameterKeys.has(key))
  }).map(([name]) => name)
})

function valuesFor(operation, layers = activePresetValues.value) {
  if (operation.apiId && operation.apiId !== 'local' && !operation.usePresets) return new Map()
  return resolveRequestValues(operation, ...layers)
}

watch(operations, available => {
  if (!selectedChain.value.length) return
  const byKey = new Map(available.map(operation => [operation.key, operation]))
  const missing = selectedChain.value.findIndex(step => !byKey.has(step.operation.key))
  const valid = missing < 0 ? selectedChain.value : selectedChain.value.slice(0, missing)
  selectedChain.value = valid.map(step => {
    const operation = byKey.get(step.operation.key)
    return { ...step, operation, group: operation.tags.includes(step.group) ? step.group : operation.tags[0] }
  })
})

watch(showExternalApis, visible => {
  if (visible) return
  const firstExternal = chain.value.findIndex(step => step.operation.apiId !== 'local')
  if (firstExternal >= 0) selectedChain.value = chain.value.slice(0, firstExternal)
})
watch(externalApis.revision, () => {
  const id = externalApis.changedApiId.value
  for (const [key, session] of sessions) if (session.apiId === id) sessions.delete(key)
  if (scenarioState.steps.some(step => step.operation.apiId === id)) {
    scenarioState.steps = []; scenarioState.status = scenarioState.id ? 'saved' : 'idle'; scenarioState.error = ''
  }
  const index = chain.value.findIndex(step => step.operation.apiId === id)
  if (index >= 0) selectedChain.value = chain.value.slice(0, index)
})

watch(configuration, () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey.value))
    if (!saved) return
    presets.value = new Map((saved.presets ?? saved.environments).map(([name, values]) => [name, new Map(values)]))
    const active = Array.isArray(saved.active) ? saved.active : [saved.active]
    activePresetNames.value = [...new Set(active.filter(name => presets.value.has(name)))]
  } catch {
    presetError.value = 'Could not load saved presets in this browser.'
  }
})

function savePresets() {
  try {
    const entries = Array.from(presets.value, ([name, values]) => [name, [...values]])
    localStorage.setItem(storageKey.value, JSON.stringify({ active: activePresetNames.value, presets: entries }))
    presetError.value = ''
  } catch {
    presetError.value = 'Could not save presets in this browser.'
  }
}

function resetPresetSessions() {
  const selected = current.value
  for (const [key, session] of sessions) {
    sessions.set(key, { ...session, result: null, pending: false, error: '' })
  }
  if (selected) {
    editingScenarioId.value = ''
    const { operation, group } = selected
    selectedChain.value = [{ operation, group, session: sessionFor(operation) }]
  }
}

function togglePreset(name, enabled) {
  activePresetNames.value = enabled
    ? [...activePresetNames.value, name]
    : activePresetNames.value.filter(activeName => activeName !== name)
  resetPresetSessions()
  savePresets()
}

async function toggleSettings() {
  if (settingsOpen.value) {
    closeSettings()
    return
  }
  editedPresetName.value = activePresetNames.value.at(-1) ?? presets.value.keys().next().value ?? ''
  settingsOpen.value = true
  await nextTick()
  settingsCloseButton.value?.focus()
}

function clickBrandStamp(event) {
  if (skeletonWalking.value) return
  if (stampClicks === 0 || event.timeStamp - firstStampClick > 750) {
    firstStampClick = event.timeStamp
    stampClicks = 0
  }
  stampClicks += 1
  if (stampClicks === 3) {
    stampClicks = 0
    skeletonWalking.value = true
  }
}

function closeSettings() {
  settingsOpen.value = false
  settingsButton.value?.focus()
}

function addPreset() {
  const name = newPresetName.value.trim()
  if (!name) return
  if (presets.value.has(name)) {
    presetError.value = 'A preset with that name already exists.'
    return
  }
  presets.value.set(name, new Map())
  newPresetName.value = ''
  editedPresetName.value = name
  savePresets()
}

function savePresetValues(values) {
  const name = editedPresetName.value
  presets.value.set(name, values)
  if (activePresetNames.value.includes(name)) resetPresetSessions()
  savePresets()
}

function removePreset() {
  const name = editedPresetName.value
  presets.value.delete(name)
  editedPresetName.value = presets.value.keys().next().value ?? ''
  if (activePresetNames.value.includes(name)) togglePreset(name, false)
  else savePresets()
}

function runInContext(operation, session) {
  return run(operation, session, valuesFor(operation))
}

const relatedResults = computed(() => {
  const results = new Map()
  for (const [key, session] of sessions) {
    if (session.result) results.set(key, [session.result])
  }
  for (const { operation, session } of chain.value.slice(0, currentIndex.value)) {
    if (session.result) {
      results.set(operation.key, [session.result, ...(results.get(operation.key) ?? [])])
    }
  }
  return results
})

const relatedTargets = computed(() => {
  if (!current.value) return []
  const { operation, session } = current.value
  const selected = session.result?.selectedPath
    ? targetsFor(operation, session.result) : []
  const result = session.result ? { ...session.result, selectedPath: undefined } : null
  return targetsFor(operation, result).map(target => {
    const values = valuesFor(target.operation)
    return {
      ...target,
      selectedCandidates: selected.find(entry => entry.operation.key === target.operation.key)?.candidates ?? [],
      candidates: target.candidates.filter(choice =>
        choice.location === 'body' || !values.has(contextKey({ in: choice.location, name: choice.name })),
      ),
    }
  })
})

async function showChain(steps, inspectIndex = null) {
  selectedChain.value = steps
  inspectedScenarioStep.value = inspectIndex
  await nextTick()
  if (workArea.value) workArea.value.scrollTop = 0
  endpointHeading.value?.scrollIntoView({ block: 'nearest' })
  endpointHeading.value?.focus({ preventScroll: true })
}

function selectGroup(name) {
  const operation = groups.value.find(group => group.name === name)?.operations[0]
  if (operation) selectOperation(operation, name)
}

function selectOperation(operation, group) {
  graphView.value = ''
  editingScenarioId.value = ''
  scenarioName.value = ''
  return showChain([{ operation, group, session: sessionFor(operation) }])
}

function canSendRelated(operation, choices) {
  if (!['GET', 'HEAD'].includes(operation.method) || operation.requestBody) return false
  try {
    const session = createSession(operation)
    for (const choice of choices) applyChoice(session, choice.location, choice)
    buildRequest(operation, configuration.value, session, valuesFor(operation))
    return true
  } catch {
    return false
  }
}

async function follow(operation, choices, send) {
  if (send && !canSendRelated(operation, choices)) return
  const session = createSession(operation)
  for (const choice of choices) choose(session, choice.location, choice, currentIndex.value)
  const group = operation.tags.includes(current.value.group) ? current.value.group : operation.tags[0]
  await showChain([...chain.value.slice(0, currentIndex.value + 1), { operation, group, session }])
  if (send) await runInContext(operation, session)
}

function choose(session, location, choice, sourceIndex) {
  try {
    applyChoice(session, location, choice)
    const targetIndex = sourceIndex === undefined ? currentIndex.value : sourceIndex + 1
    const origin = sourceIndex ?? chain.value.slice(0, targetIndex).findLastIndex(step =>
      step.operation.key === choice.binding?.operationKey && step.session.result === choice.sourceResult)
    rememberBinding(session, { ...choice, location }, origin)
    session.error = ''
  } catch (cause) {
    session.error = cause.message
  }
}
function scenarioContext(requestValuesFor = valuesFor) {
  return { operations: operations.value, links: mappingLinks.value, configuration: configuration.value,
    createSession, valuesFor: requestValuesFor }
}
function saveScenario() {
  try {
    const saved = scenarioStore.save(chain.value, scenarioName.value, overwriteScenario.value?.id, valuesFor)
    editingScenarioId.value = saved.id
    scenarioName.value = saved.name
  }
  catch (cause) { scenarioError.value = cause.message }
}
function openScenario(scenario) {
  const steps = scenarioStore.open(scenario, scenarioContext())
  if (!steps) return
  editingScenarioId.value = scenario.id
  scenarioName.value = scenario.name
  graphView.value = ''
  void showChain(steps, 0)
}
async function replayScenario(scenario, presetNames) {
  if (scenarioBusy.value) return
  const layers = presetNames.map(name => presets.value.get(name))
  const replay = scenarioStore.run(scenario, scenarioContext(operation => valuesFor(operation, layers)),
    (operation, session, values, signal, onRequest) => run(operation, session, values, { signal, onRequest }))
  await nextTick()
  scenarioPanel.value?.showProgress()
  await replay
}
function inspectScenario(index, execution) {
  const byKey = new Map(operations.value.map(operation => [operation.key, operation]))
  const missing = execution.steps.findIndex(step => !byKey.has(step.operation.key))
  const visible = missing < 0 ? execution.steps : execution.steps.slice(0, missing)
  if (!visible[index]) {
    scenarioError.value = 'This scenario step is unavailable. Enable its API connection before inspecting it.'
    return
  }
  scenarioError.value = ''
  editingScenarioId.value = execution.id
  scenarioName.value = execution.name
  graphView.value = ''
  void showChain(visible.map(step => ({ ...step, operation: byKey.get(step.operation.key) })), index)
}
function removeScenario(id) {
  try { scenarioStore.remove(id) }
  catch (cause) { scenarioError.value = cause.message }
}

</script>

<template>
  <div class="brand-track">
    <div class="brand-stamp">
      <button type="button" class="brand-button" @click="clickBrandStamp">
        <span class="brand-mark" aria-hidden="true">N</span>
        <span>Necto</span>
      </button>
      <NectoSkeleton v-if="skeletonWalking" @finish="skeletonWalking = false" />
    </div>
  </div>
  <main class="app">
    <header class="hero">
      <nav v-if="spec" class="view-navigation" aria-label="Workspace views">
        <button type="button" class="secondary" :disabled="scenarioPending" :aria-pressed="!graphView" @click="graphView = ''">API</button>
        <button type="button" class="secondary" :disabled="scenarioPending" :aria-pressed="graphView === 'scenarios'" @click="graphView = 'scenarios'">Scenarios</button>
        <button type="button" class="secondary" :disabled="scenarioPending" :aria-pressed="graphView === 'entities'" @click="graphView = 'entities'">Entity graph</button>
        <button type="button" class="secondary" :disabled="scenarioPending" :aria-pressed="graphView === 'endpoints'" @click="graphView = 'endpoints'">Endpoint graph</button>
      </nav>
      <div class="api-identity">
        <div class="api-info">
          <div class="api-title">
            <h1>{{ spec?.info?.title ?? 'API documentation' }}</h1>
            <small v-if="spec?.info?.version">Version {{ spec.info.version }}</small>
          </div>
          <p v-if="spec?.info?.description" class="muted">{{ spec.info.description }}</p>
        </div>
        <button v-if="spec" ref="settingsButton" type="button" class="secondary settings-icon" :disabled="scenarioPending"
          aria-label="Settings" title="Settings" :aria-expanded="settingsOpen" :aria-controls="settingsOpen ? 'settings-panel' : undefined" @click="toggleSettings">
          <span aria-hidden="true">⚙︎</span>
        </button>
      </div>
    </header>

    <p v-if="error" class="app-message error" role="alert">{{ error }}</p>
    <p v-else-if="!spec" class="app-message" role="status">Loading API documentation…</p>
    <template v-else>
      <Transition name="settings-drawer">
        <aside v-if="settingsOpen" id="settings-panel" class="work-area settings" aria-labelledby="settings-title" @keydown.esc.stop="closeSettings">
          <div class="settings-header">
            <h2 id="settings-title">Settings</h2>
            <button ref="settingsCloseButton" type="button" class="secondary settings-icon" aria-label="Close settings" @click="closeSettings">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div :inert="scenarioPending">
            <section class="preset-panel" aria-labelledby="presets-title">
              <h3 id="presets-title">Presets</h3>
              <form class="preset-actions" @submit.prevent="addPreset">
                <label>New preset <input v-model="newPresetName" required></label>
                <button type="submit" class="secondary">Add</button>
              </form>
              <template v-if="presets.size">
                <label>
                  Edit preset
                  <select v-model="editedPresetName">
                    <option v-for="name in presets.keys()" :key="name" :value="name">{{ name }}</option>
                  </select>
                </label>
                <ValuesEditor v-if="editedPresetValues" :values="editedPresetValues" label="Preset values" @save="savePresetValues" />
                <button type="button" class="secondary" @click="removePreset">Delete {{ editedPresetName }}</button>
              </template>
              <p v-if="presetError" class="error" role="alert">{{ presetError }}</p>
            </section>
            <ExternalApiSettings v-model:show="showExternalApis" :connections="connections" :statuses="externalStatuses" :storage-error="externalStorageError"
              :save="externalApis.saveConnection" :remove="externalApis.removeConnection" :test="externalApis.testConnection" />
          </div>
        </aside>
      </Transition>
      <EntityGraph v-if="graphView === 'entities'" :spec="spec" :apis="externalApis.contexts.value" :operations="operations" :mappings="endpointMappings" :mapping-error="mappingError"
        @open-operation="operation => selectOperation(operation, operation.tags[0])" />
      <EndpointGraph v-if="graphView === 'endpoints'" :operations="operations" :mappings="endpointMappings" :mapping-error="mappingError"
        @open-operation="operation => selectOperation(operation, operation.tags[0])" />
      <ScenarioPanel v-if="graphView === 'scenarios'" ref="scenarioPanel" :scenarios="scenarios" :state="scenarioState" :runs="scenarioRuns"
        :pending="scenarioPending" :busy="scenarioBusy" :error="scenarioError" :preset-names="[...presets.keys()]"
        :active-preset-names="activePresetNames" @open="openScenario" @run="replayScenario"
        @remove="removeScenario" @stop="scenarioStore.stop" @inspect="inspectScenario" />
      <div v-show="!graphView" class="layout">
        <EndpointCatalog :inert="scenarioPending"
          :groups="groups"
          :active-group="current?.group ?? ''"
          :active-operation="current?.operation.key ?? ''"
          @select-group="selectGroup"
          @select-operation="selectOperation"
        />

        <div ref="workArea" class="work-area">
          <p v-if="mappingError" class="mapping-notice muted" role="status">{{ mappingError }}</p>
          <article v-if="current" :inert="scenarioPending" aria-labelledby="endpoint-title">
            <nav v-if="chain.length > 1" class="breadcrumbs" aria-label="Request chain">
              <ol>
                <li v-for="(step, index) in chain" :key="index">
                  <span v-if="index" class="separator" aria-hidden="true">›</span>
                  <span v-if="index === currentIndex" aria-current="step">
                    {{ step.operation.apiId !== 'local' ? step.operation.apiName + ' [' + step.operation.apiId + '] · ' : '' }}{{ step.operation.method }} {{ step.operation.name }}
                  </span>
                  <button v-else type="button" @click="inspectedScenarioStep === null ? showChain(chain.slice(0, index + 1)) : showChain(chain, index)">
                    {{ step.operation.apiId !== 'local' ? step.operation.apiName + ' [' + step.operation.apiId + '] · ' : '' }}{{ step.operation.method }} {{ step.operation.name }}
                  </button>
                </li>
              </ol>
            </nav>
            <div v-if="visiblePresetNames.length" class="preset-bar" role="group" aria-label="Presets">
              <span class="preset-bar-label" aria-hidden="true">Presets</span>
              <button
                v-for="name in visiblePresetNames"
                :key="name"
                type="button"
                class="preset-chip"
                :aria-pressed="activePresetNames.includes(name)"
                @click="togglePreset(name, !activePresetNames.includes(name))"
              >{{ name }}</button>
            </div>
            <header class="endpoint-header">
              <p v-if="current.operation.apiId !== 'local'" class="external-api-label">{{ current.operation.apiName }} · {{ current.operation.apiId }}</p>
              <h2 id="endpoint-title" ref="endpointHeading" tabindex="-1">{{ current.operation.name }}</h2>
              <div class="endpoint-route">
                <span class="method" :data-method="current.operation.method">{{ current.operation.method }}</span>
                <code>{{ current.operation.path }}</code>
              </div>
              <p v-if="current.operation.description" class="muted">{{ current.operation.description }}</p>
            </header>
            <details class="preset-panel scenario-save">
              <summary>Save scenario</summary>
              <form @submit.prevent="saveScenario">
                <label>Scenario name <input v-model="scenarioName" required maxlength="120" placeholder="Invoice details"></label>
                <button class="secondary" type="submit" :disabled="scenarioBusy">{{ overwriteScenario ? 'Update scenario' : 'Save current chain' }} ({{ chain.length }} steps)</button>
              </form>
              <p v-if="scenarioError" class="error" role="alert">{{ scenarioError }}</p>
              <p v-else-if="overwriteScenario && scenarioState.status === 'saved' && scenarioState.id === overwriteScenario.id" role="status">Scenario saved.</p>
            </details>
            <OperationRunner :operation="current.operation" :session="current.session" :run="runInContext" :values="requestValues" :selectors="selectablePaths(current.operation)">
              <template #parameter-input="{ parameter, hint }">
                <ValueInput v-model="current.session.fields[fieldKey(parameter)]"
                  :choices="choicesFor(current.operation, parameter.in, parameter.name, relatedResults)"
                  :required="parameter.required || parameter.in === 'path'" :placeholder="hint"
                  @choose="choose(current.session, parameter.in, $event)" />
              </template>
              <template #choices="{ location, parameterName }">
                <RelatedChoices v-if="location === 'body'"
                  :choices="choicesFor(current.operation, location, parameterName, relatedResults)"
                  @choose="choose(current.session, location, $event)"
                />
              </template>
              <template #related>
                <RelatedTargets
                  :targets="relatedTargets"
                  :can-send="canSendRelated"
                  @follow="follow"
                />
              </template>
            </OperationRunner>
          </article>
          <p v-else class="mapping-notice muted">No endpoints in this document.</p>
        </div>
      </div>
    </template>
  </main>
</template>

<style>
:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  color: #202b27;
  --surface: #fff;
  --canvas: #f7f9f6;
  --subtle: #f3f6f3;
  --line: #dce4de;
  --muted: #53625c;
  --accent: #145949;
  --accent-soft: #e2f1e9;
  background: var(--canvas);
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: #eef2ee; }
#app {
  --app-gutter: 1rem;
  position: relative;
  margin: var(--app-gutter);
}
.app {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 2 * var(--app-gutter));
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .75rem;
}
.hero { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1rem; padding: 2.125rem 1rem 1rem; border-bottom: 1px solid var(--line); }
.api-identity { display: flex; flex: 1 1 16rem; justify-content: flex-end; align-items: center; gap: .75rem; min-width: 0; }
.api-info { min-width: 0; overflow-wrap: anywhere; text-align: right; }
.api-title { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .5rem; min-height: 1.65rem; }
.hero h1 { margin: 0; font-size: 1.05rem; letter-spacing: -.025em; }
.hero p { margin: .25rem 0 0; font-size: .82rem; }
.brand-track {
  position: absolute;
  z-index: 1;
  inset: 0 0 auto;
  container-type: inline-size;
  pointer-events: none;
}
.brand-stamp {
  --stamp-inset: .8rem;
  position: absolute;
  top: -.55rem;
  left: var(--stamp-inset);
  pointer-events: auto;
}
.brand-button {
  position: relative;
  z-index: 1;
  cursor: default;
  display: flex;
  align-items: center;
  gap: .45rem;
  padding: .25rem .55rem .25rem .3rem;
  border: 1px solid var(--line);
  border-radius: .55rem;
  background: var(--surface);
  color: var(--accent);
  font-size: .88rem;
  font-weight: 750;
}
.brand-button:hover { background: var(--surface); }
.brand-mark { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; border-radius: .45rem; background: var(--accent); color: white; }
.api-title small { padding: .125rem .375rem; border: 1px solid var(--line); border-radius: .375rem; color: var(--muted); font-size: .72rem; }
.layout { display: grid; flex: 1; min-height: 0; grid-template-columns: clamp(14rem, 23vw, 18rem) minmax(0, 1fr); }
.work-area { overflow: auto; min-width: 0; padding: 1.5rem; background: var(--canvas); scroll-padding-block: 1rem; }
.app-message { margin: 1rem; }
.mapping-notice { margin: 0 0 1rem; }
.preset-panel { min-width: 0; margin-inline: 0; display: grid; gap: .45rem; margin-bottom: 1rem; padding: .75rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--surface); font-size: .85rem; }
.preset-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin-bottom: .85rem; padding-bottom: .55rem; border-bottom: 1px solid var(--line); }
.preset-bar-label { margin-right: .2rem; color: var(--muted); font-size: .75rem; font-weight: 650; }
.preset-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  min-height: 1.5rem;
  padding: .15rem .55rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: .75rem;
  font-weight: 650;
  text-align: left;
  overflow-wrap: anywhere;
}
.preset-chip:hover { border-color: var(--accent); background: var(--accent-soft); }
.preset-chip[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.preset-panel > label select { margin-left: .35rem; max-width: 70%; }
.preset-panel p { margin: 0; }
.scenario-save summary { cursor: pointer; font-weight: 650; }
.scenario-save form { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; margin-block: .65rem; }
.scenario-save label { display: grid; gap: .3rem; flex: 1 1 14rem; }
.scenario-save input { width: 100%; min-width: 0; }
.external-api-label { color: var(--accent); font-weight: 650; }
.view-navigation { display: flex; flex-wrap: wrap; gap: .35rem; }
.view-navigation [aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.settings-icon.secondary { display: grid; flex: none; place-items: center; width: 2rem; height: 2rem; padding: 0; font-size: 1.2rem; line-height: 1; }
.settings {
  position: fixed;
  z-index: 2;
  inset: var(--app-gutter) var(--app-gutter) var(--app-gutter) auto;
  width: min(28rem, calc(100% - 2 * var(--app-gutter)));
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: .75rem;
  box-shadow: -.5rem 0 1.5rem #202b2729;
  overscroll-behavior: contain;
}
.settings-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.settings h2 { margin: 0; }
.settings h3 { margin: 0; font-size: 1rem; }
.settings .preset-panel { max-width: 48rem; gap: .85rem; justify-items: start; }
.settings .preset-panel > label { width: 100%; }
.settings-drawer-enter-active, .settings-drawer-leave-active { transition: transform 180ms ease-out; }
.settings-drawer-enter-from, .settings-drawer-leave-to { transform: translateX(calc(100% + var(--app-gutter))); }
@media (prefers-reduced-motion: reduce) {
  .settings-drawer-enter-active, .settings-drawer-leave-active { transition: none; }
}
.preset-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-top: .6rem; }
.breadcrumbs ol { display: flex; flex-wrap: wrap; gap: .25rem; list-style: none; padding: 0; margin: 0 0 .85rem; }
.breadcrumbs li { display: flex; align-items: baseline; gap: .25rem; min-width: 0; font-size: .82rem; overflow-wrap: anywhere; }
.breadcrumbs button { padding: .3rem .45rem; color: var(--accent); text-align: left; overflow-wrap: anywhere; }
.breadcrumbs [aria-current] { padding: .3rem .45rem; font-weight: 650; }
.separator { color: var(--muted); }
.endpoint-header { margin-bottom: 1rem; overflow-wrap: anywhere; }
.endpoint-header h2 { margin: 0 0 .5rem; font-size: 1.75rem; letter-spacing: -.035em; }
.endpoint-route { display: flex; align-items: baseline; gap: .5rem; color: var(--muted); font-size: .85rem; }
.endpoint-header p { margin: .5rem 0 0; font-size: .875rem; }
.muted { color: var(--muted); }
.error { color: #8f2225; }
button, input, select, textarea { font: inherit; color: inherit; }
button { border: 0; border-radius: .45rem; background: transparent; cursor: pointer; }
button:hover { background: var(--accent-soft); }
button:disabled { cursor: default; opacity: .65; }
:focus-visible { outline: 2px solid #257f67; outline-offset: 2px; }
input:not([type="checkbox"]), select, textarea {
  padding: .5rem .6rem;
  background: var(--surface);
  border: 1px solid #a2b2a9;
  border-radius: .4rem;
}
.primary { padding: .5rem .85rem; background: var(--accent); color: #fff; font-weight: 650; }
.primary:hover { background: #104737; }
.secondary { padding: .35rem .55rem; border: 1px solid var(--line); background: var(--surface); }
.method {
  display: inline-block;
  padding: .18rem .35rem;
  border-radius: .35rem;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: .72rem;
  font-weight: 800;
}
.method[data-method="POST"] { background: #e5effa; color: #18507d; }
.method[data-method="PUT"], .method[data-method="PATCH"] { background: #f9efd9; color: #755018; }
.method[data-method="DELETE"] { background: #ffe3e2; color: #8f2225; }
@media (max-width: 760px) {
  #app { --app-gutter: .75rem; }
  .app { height: auto; min-height: calc(100dvh - 2 * var(--app-gutter)); }
  .layout { grid-template-columns: minmax(0, 1fr); }
  .work-area { overflow: visible; padding: 1rem; }
  .settings { overflow: auto; }
}
</style>
