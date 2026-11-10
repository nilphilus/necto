<script setup>
import { computed, nextTick, ref } from 'vue'
import { useCatalog } from './features/api-catalog/catalog.js'
import EndpointCatalog from './features/api-catalog/EndpointCatalog.vue'
import EndpointGroup from './features/api-catalog/EndpointGroup.vue'
import OperationRunner from './features/request-runner/OperationRunner.vue'
import { useRequestRunner } from './features/request-runner/useRequestRunner.js'
import { applyChoice, useRelatedEndpoints } from './features/related-endpoints/mappings.js'
import RelatedChoices from './features/related-endpoints/RelatedChoices.vue'
import RelatedTargets from './features/related-endpoints/RelatedTargets.vue'

const { spec, configuration, error, operations, groups } = useCatalog()
const { sessions, sessionFor, run } = useRequestRunner(configuration)
const { error: mappingError, targetsFor, choicesFor } = useRelatedEndpoints(configuration, operations, sessions)

const selectedGroup = ref('')
const selectedOperation = ref('')
const groupView = ref(null)
const activeGroup = computed(() => groups.value.find(group => group.name === selectedGroup.value) ?? groups.value[0])

async function focusHeading(id) {
  await nextTick()
  const heading = document.getElementById(id())
  heading?.scrollIntoView({ block: 'start' })
  heading?.focus({ preventScroll: true })
}

function selectGroup(name) {
  selectedGroup.value = name
  selectedOperation.value = ''
  return focusHeading(() => 'group-title')
}

function selectOperation(operation, group) {
  selectedGroup.value = group ?? (operation.tags.includes(activeGroup.value?.name) ? activeGroup.value.name : operation.tags[0])
  selectedOperation.value = operation.key
  return focusHeading(() => groupView.value?.anchorFor(operation))
}

function navigateToRequest(operation) {
  sessionFor(operation).panel = 'request'
  return selectOperation(operation)
}

function choose(operation, location, choice) {
  const session = sessionFor(operation)
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
        <span>Necto UI</span>
        <small v-if="spec?.info?.version">Version {{ spec.info.version }}</small>
      </div>
      <h1>{{ spec?.info?.title ?? 'API documentation' }}</h1>
      <p v-if="spec?.info?.description" class="muted">{{ spec.info.description }}</p>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!spec" role="status">Loading API documentation…</p>
    <template v-else>
      <p v-if="mappingError" class="muted" role="status">{{ mappingError }}</p>
      <div class="layout">
        <EndpointCatalog
          :groups="groups"
          :active-group="activeGroup?.name ?? ''"
          :active-operation="selectedOperation"
          @select-group="selectGroup"
          @select-operation="selectOperation"
        />

        <EndpointGroup v-if="activeGroup" ref="groupView" :key="activeGroup.name" :group="activeGroup">
          <template #default="{ operation }">
            <OperationRunner :operation="operation" :session="sessionFor(operation)" :run="run">
              <template #choices="{ location, parameterName }">
                <RelatedChoices
                  :choices="choicesFor(operation, location, parameterName)"
                  @choose="choose(operation, location, $event)"
                />
              </template>
              <template #related>
                <RelatedTargets :targets="targetsFor(operation)" @navigate="navigateToRequest" />
              </template>
            </OperationRunner>
          </template>
        </EndpointGroup>
      </div>
    </template>
  </main>
</template>

<style>
:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  color: #172639;
  --surface: #fff;
  --canvas: #f5f7fb;
  --line: #d1dae6;
  --muted: #506177;
  --accent: #174c77;
  --accent-soft: #e3effa;
  background: var(--canvas);
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; }
.app { width: min(92rem, 100%); padding: clamp(1rem, 3vw, 2.5rem); margin: 0 auto; }
.hero { padding-bottom: 1.4rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--line); }
.hero h1 { margin: .4rem 0 0; font-size: clamp(1.85rem, 4vw, 2.65rem); }
.hero p { margin: .35rem 0 0; }
.eyebrow { display: flex; align-items: center; gap: .6rem; color: var(--accent); font-weight: 750; }
.eyebrow small { padding: .2rem .45rem; border-radius: .4rem; background: var(--accent-soft); font-weight: 600; }
.layout { display: grid; grid-template-columns: minmax(14rem, 19rem) minmax(0, 1fr); gap: clamp(1rem, 3vw, 2rem); }
.muted { color: var(--muted); }
.error { color: #8f2225; }
button, input, select, textarea { font: inherit; color: inherit; }
button { border: 0; border-radius: .45rem; background: transparent; cursor: pointer; }
button:hover { background: var(--accent-soft); }
button:disabled { cursor: default; opacity: .65; }
:focus-visible { outline: 2px solid #216baa; outline-offset: 2px; }
input:not([type="checkbox"]), select, textarea {
  padding: .5rem .6rem;
  background: var(--surface);
  border: 1px solid #8292a6;
  border-radius: .4rem;
}
.primary { padding: .5rem .85rem; background: var(--accent); color: #fff; font-weight: 650; }
.primary:hover { background: #123e61; }
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
.method[data-method="POST"] { background: #d5f4e5; color: #125f41; }
.method[data-method="DELETE"] { background: #ffe3e2; color: #8f2225; }
@media (max-width: 760px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
}
</style>
