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
const workArea = ref(null)
const origins = ref(new Map())
const activeGroup = computed(() => groups.value.find(group => group.name === selectedGroup.value) ?? groups.value[0])
const activeOperation = computed(() =>
  activeGroup.value?.operations.find(operation => operation.key === selectedOperation.value)
    ?? activeGroup.value?.operations[0],
)

async function focusHeading(id, block = 'start') {
  await nextTick()
  const heading = document.getElementById(id())
  heading?.scrollIntoView({ block })
  heading?.focus({ preventScroll: true })
}

async function selectGroup(name) {
  selectedGroup.value = name
  selectedOperation.value = ''
  await nextTick()
  if (workArea.value) workArea.value.scrollTop = 0
  return focusHeading(() => 'group-title', 'nearest')
}

function selectOperation(operation, group) {
  selectedGroup.value = group ?? (operation.tags.includes(activeGroup.value?.name) ? activeGroup.value.name : operation.tags[0])
  selectedOperation.value = operation.key
  return focusHeading(() => groupView.value?.anchorFor(operation))
}

function canSendRelated(operation, choice) {
  return ['GET', 'HEAD'].includes(operation.method) &&
    !operation.requestBody && operation.parameters.length === 1 &&
    choice.location !== 'body' &&
    ['string', 'number', 'boolean'].includes(typeof choice.value) && choice.value !== '' &&
    !sessions.get(operation.key)?.pending
}

async function follow(source, operation, choice, send) {
  if (send && !canSendRelated(operation, choice)) return
  if (source.key !== operation.key) {
    origins.value.set(operation.key, { operation: source, group: activeGroup.value.name })
  }
  if (choice) choose(operation, choice.location, choice)
  await selectOperation(operation)
  if (send) await run(operation)
}

function backToSource(operation) {
  const source = origins.value.get(operation.key)
  return selectOperation(source.operation, source.group)
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
        :active-group="activeGroup?.name ?? ''"
        :active-operation="activeOperation?.key ?? ''"
        @select-group="selectGroup"
        @select-operation="selectOperation"
      />

      <div ref="workArea" class="work-area">
        <p v-if="mappingError" class="mapping-notice muted" role="status">{{ mappingError }}</p>
        <EndpointGroup
          v-if="activeGroup"
          ref="groupView"
          :key="activeGroup.name"
          :group="activeGroup"
          :active-operation="activeOperation.key"
          @select-operation="selectOperation($event, activeGroup.name)"
        >
          <template #default="{ operation }">
            <button
              v-if="origins.has(operation.key)"
              class="origin"
              type="button"
              @click="backToSource(operation)"
            >
              <span aria-hidden="true">←</span>
              Back to {{ origins.get(operation.key).operation.name }} response
            </button>
            <OperationRunner :operation="operation" :session="sessionFor(operation)" :run="run">
              <template #choices="{ location, parameterName }">
                <RelatedChoices
                  :choices="choicesFor(operation, location, parameterName)"
                  @choose="choose(operation, location, $event)"
                />
              </template>
              <template #related>
                <RelatedTargets
                  :targets="targetsFor(operation)"
                  :can-send="canSendRelated"
                  @follow="(target, choice, send) => follow(operation, target, choice, send)"
                />
              </template>
            </OperationRunner>
          </template>
        </EndpointGroup>
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
.origin { display: block; margin: 0 1rem .75rem; padding: .35rem .5rem; color: var(--accent); font-size: .84rem; font-weight: 650; text-align: left; }
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
