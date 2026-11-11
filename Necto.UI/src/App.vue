<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useCatalog } from './features/api-catalog/catalog.js'
import EndpointCatalog from './features/api-catalog/EndpointCatalog.vue'
import OperationRunner from './features/request-runner/OperationRunner.vue'
import { useRequestRunner } from './features/request-runner/useRequestRunner.js'
import { applyChoice, useRelatedEndpoints } from './features/related-endpoints/mappings.js'
import RelatedChoices from './features/related-endpoints/RelatedChoices.vue'
import RelatedTargets from './features/related-endpoints/RelatedTargets.vue'
import ValuesEditor from './features/environments/ValuesEditor.vue'
import { contextKey, resolveRequestValues, supportedParameters } from './features/request-runner/request.js'

const { spec, configuration, error, operations, groups } = useCatalog()
const { sessions, sessionFor, createSession, run } = useRequestRunner(configuration)
const { error: mappingError, targetsFor, choicesFor } = useRelatedEndpoints(configuration, operations)

const selectedChain = ref([])
const environments = ref(new Map())
const environmentName = ref('')
const newEnvironmentName = ref('')
const environmentError = ref('')
const flowOverrides = ref(new Map())
const environmentValues = computed(() => environments.value.get(environmentName.value) ?? new Map())
const storageKey = computed(() => 'necto:environments:' + configuration.value?.openApiUrl)
const endpointHeading = ref(null)
const workArea = ref(null)
const chain = computed(() => {
  if (selectedChain.value.length) return selectedChain.value
  const group = groups.value[0]
  const operation = group?.operations[0]
  return operation ? [{ operation, group: group.name, session: sessionFor(operation) }] : []
})
const current = computed(() => chain.value.at(-1))
const requestValues = computed(() => current.value ? valuesFor(current.value.operation) : new Map())

function valuesFor(operation) {
  return resolveRequestValues(operation, environmentValues.value, flowOverrides.value)
}

watch(configuration, () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey.value))
    if (!saved) return
    environments.value = new Map(saved.environments.map(([name, values]) => [name, new Map(values)]))
    if (environments.value.has(saved.active)) environmentName.value = saved.active
    const flow = saved.flow
    if (flow?.environment !== environmentName.value) return
    const operation = operations.value.find(operation => operation.key === flow.operation)
    if (!operation) return
    const group = operation.tags.includes(flow.group) ? flow.group : operation.tags[0]
    selectedChain.value = [{ operation, group, session: sessionFor(operation) }]
    flowOverrides.value = new Map(flow.values)
  } catch {
    environmentError.value = 'Could not load saved environments in this browser.'
  }
})

watch(flowOverrides, saveEnvironments)

function saveEnvironments() {
  try {
    const entries = Array.from(environments.value, ([name, values]) => [name, [...values]])
    const root = chain.value[0]
    const flow = root && flowOverrides.value.size ? {
      operation: root.operation.key,
      group: root.group,
      environment: environmentName.value,
      values: [...flowOverrides.value],
    } : undefined
    localStorage.setItem(storageKey.value, JSON.stringify({ active: environmentName.value, environments: entries, flow }))
    environmentError.value = ''
  } catch {
    environmentError.value = 'Could not save environments in this browser.'
  }
}

function resetEnvironmentSessions() {
  const selected = current.value
  for (const [key, session] of sessions) {
    sessions.set(key, { ...session, result: null, pending: false, error: '' })
  }
  if (selected) selectOperation(selected.operation, selected.group)
}

function selectEnvironment(name) {
  environmentName.value = name
  resetEnvironmentSessions()
  saveEnvironments()
}

function addEnvironment() {
  const name = newEnvironmentName.value.trim()
  if (!name) return
  if (environments.value.has(name)) {
    environmentError.value = 'An environment with that name already exists.'
    return
  }
  environments.value.set(name, new Map())
  newEnvironmentName.value = ''
  selectEnvironment(name)
}

function saveEnvironmentValues(values) {
  environments.value.set(environmentName.value, values)
  resetEnvironmentSessions()
  saveEnvironments()
}

function removeEnvironment() {
  environments.value.delete(environmentName.value)
  selectEnvironment('')
}

function runInContext(operation, session) {
  return run(operation, session, valuesFor(operation))
}

const relatedResults = computed(() => {
  const results = new Map()
  for (const [key, session] of sessions) {
    if (session.result) results.set(key, [session.result])
  }
  for (const { operation, session } of chain.value.slice(0, -1)) {
    if (session.result) {
      results.set(operation.key, [session.result, ...(results.get(operation.key) ?? [])])
    }
  }
  return results
})

const relatedTargets = computed(() => {
  if (!current.value) return []
  return targetsFor(current.value.operation, current.value.session.result).map(target => {
    const values = valuesFor(target.operation)
    return {
      ...target,
      candidates: target.candidates.filter(choice =>
        choice.location === 'body' || !values.has(contextKey({ in: choice.location, name: choice.name })),
      ),
    }
  })
})

async function showChain(steps) {
  selectedChain.value = steps
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
  flowOverrides.value = new Map()
  return showChain([{ operation, group, session: sessionFor(operation) }])
}

function canSendRelated(operation, choice) {
  if (!['GET', 'HEAD'].includes(operation.method) || operation.requestBody ||
      !['string', 'number', 'boolean'].includes(typeof choice.value) || choice.value === '') return false
  const parameters = supportedParameters(operation)
  const target = parameters.find(parameter => parameter.in === choice.location && parameter.name === choice.name)
  const values = valuesFor(operation)
  if (!target || values.has(contextKey(target))) return false
  return parameters.every(parameter => parameter === target ||
    (!parameter.required && parameter.in !== 'path') ||
    Boolean(values.get(contextKey(parameter))))
}

async function follow(operation, choice, send) {
  if (send && (!choice || !canSendRelated(operation, choice))) return
  const session = createSession(operation)
  if (choice) choose(session, choice.location, choice)
  const group = operation.tags.includes(current.value.group) ? current.value.group : operation.tags[0]
  await showChain([...chain.value, { operation, group, session }])
  if (send) await runInContext(operation, session)
}

function choose(session, location, choice) {
  try {
    applyChoice(session, location, choice)
    session.error = ''
  } catch (cause) {
    session.error = cause.message
  }
}
</script>

<template>
  <main class="app">
    <header class="hero">
      <div class="eyebrow">
        <span class="brand-mark" aria-hidden="true">N</span>
        <span>Necto</span>
      </div>
      <div class="api-info">
        <div class="api-title">
          <h1>{{ spec?.info?.title ?? 'API documentation' }}</h1>
          <small v-if="spec?.info?.version">Version {{ spec.info.version }}</small>
        </div>
        <p v-if="spec?.info?.description" class="muted">{{ spec.info.description }}</p>
      </div>
    </header>

    <p v-if="error" class="app-message error" role="alert">{{ error }}</p>
    <p v-else-if="!spec" class="app-message" role="status">Loading API documentation…</p>
    <div v-else class="layout">
      <EndpointCatalog
        :groups="groups"
        :active-group="current?.group ?? ''"
        :active-operation="current?.operation.key ?? ''"
        @select-group="selectGroup"
        @select-operation="selectOperation"
      />

      <div ref="workArea" class="work-area">
        <section class="environment-panel" aria-label="Request environment">
          <label>
            Environment
            <select :value="environmentName" @change="selectEnvironment($event.target.value)">
              <option value="">No environment</option>
              <option v-for="name in environments.keys()" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <details>
            <summary>Manage environments</summary>
            <form class="environment-actions" @submit.prevent="addEnvironment">
              <label>New environment <input v-model="newEnvironmentName" required></label>
              <button type="submit" class="secondary">Add</button>
            </form>
            <template v-if="environmentName">
              <ValuesEditor :values="environmentValues" label="Environment values" @save="saveEnvironmentValues" />
              <button type="button" class="secondary" @click="removeEnvironment">Delete {{ environmentName }}</button>
            </template>
          </details>
          <details v-if="current">
            <summary>Call-flow overrides<span v-if="flowOverrides.size"> ({{ flowOverrides.size }})</span></summary>
            <ValuesEditor :values="flowOverrides" label="Values for this call-flow" @save="flowOverrides = $event" />
          </details>
          <p v-if="environmentError" class="error" role="alert">{{ environmentError }}</p>
        </section>
        <p v-if="mappingError" class="mapping-notice muted" role="status">{{ mappingError }}</p>
        <article v-if="current" aria-labelledby="endpoint-title">
          <nav v-if="chain.length > 1" class="breadcrumbs" aria-label="Request chain">
            <ol>
              <li v-for="(step, index) in chain" :key="index">
                <span v-if="index" class="separator" aria-hidden="true">›</span>
                <span v-if="index === chain.length - 1" aria-current="step">
                  {{ step.operation.method }} {{ step.operation.name }}
                </span>
                <button v-else type="button" @click="showChain(chain.slice(0, index + 1))">
                  {{ step.operation.method }} {{ step.operation.name }}
                </button>
              </li>
            </ol>
          </nav>
          <header class="endpoint-header">
            <h2 id="endpoint-title" ref="endpointHeading" tabindex="-1">{{ current.operation.name }}</h2>
            <div class="endpoint-route">
              <span class="method" :data-method="current.operation.method">{{ current.operation.method }}</span>
              <code>{{ current.operation.path }}</code>
            </div>
            <p v-if="current.operation.description" class="muted">{{ current.operation.description }}</p>
          </header>
          <OperationRunner :operation="current.operation" :session="current.session" :run="runInContext" :values="requestValues">
            <template #choices="{ location, parameterName }">
              <RelatedChoices
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
.app {
  --app-gutter: 1rem;
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 2 * var(--app-gutter));
  margin: var(--app-gutter);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .75rem;
}
.hero { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--line); }
.api-info { min-width: 0; overflow-wrap: anywhere; }
.api-title { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; min-height: 1.65rem; }
.hero h1 { margin: 0; font-size: 1.05rem; letter-spacing: -.025em; }
.hero p { margin: .25rem 0 0; font-size: .82rem; }
.eyebrow { display: flex; align-items: center; gap: .5rem; padding-right: 1rem; border-right: 1px solid var(--line); color: var(--accent); font-size: .88rem; font-weight: 750; }
.brand-mark { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; border-radius: .45rem; background: var(--accent); color: white; }
.api-title small { padding: .125rem .375rem; border: 1px solid var(--line); border-radius: .375rem; color: var(--muted); font-size: .72rem; }
.layout { display: grid; flex: 1; min-height: 0; grid-template-columns: clamp(14rem, 23vw, 18rem) minmax(0, 1fr); }
.work-area { overflow: auto; min-width: 0; padding: 1.5rem; background: var(--canvas); scroll-padding-block: 1rem; }
.app-message { margin: 1rem; }
.mapping-notice { margin: 0 0 1rem; }
.environment-panel { display: grid; gap: .45rem; margin-bottom: 1rem; padding: .75rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--surface); font-size: .85rem; }
.environment-panel > label select { margin-left: .35rem; max-width: 70%; }
.environment-panel summary { cursor: pointer; width: fit-content; color: var(--accent); }
.environment-panel p { margin: 0; }
.environment-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-top: .6rem; }
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
  .app { --app-gutter: .5rem; height: auto; min-height: calc(100dvh - 2 * var(--app-gutter)); }
  .layout { grid-template-columns: minmax(0, 1fr); }
  .work-area { overflow: visible; padding: 1rem; }
}
</style>
