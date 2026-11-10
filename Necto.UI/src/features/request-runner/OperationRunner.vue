<script setup>
import { computed, nextTick, ref } from 'vue'
import { fieldKey, jsonContent, supportedParameters } from './request.js'

const props = defineProps({
  operation: { type: Object, required: true },
  session: { type: Object, required: true },
  run: { type: Function, required: true },
})

const parameters = computed(() => supportedParameters(props.operation))
const content = computed(() => jsonContent(props.operation))
const unsupported = computed(() => props.operation.requestBody && !content.value)
const panelHeading = ref(null)

async function showPanel(panel) {
  props.session.panel = panel
  await nextTick()
  panelHeading.value?.focus({ preventScroll: true })
}

async function submit() {
  await props.run(props.operation)
  if (props.session.panel === 'response') panelHeading.value?.focus({ preventScroll: true })
}

function parameterHint(parameter) {
  const type = props.operation.resolve(parameter.schema)?.type
  return type === 'array' || type === 'object' ? `JSON ${type}` : undefined
}
</script>

<template>
  <div class="runner">
    <button
      v-if="session.panel === 'response'"
      class="edge edge-left"
      type="button"
      @click="showPanel('request')"
    >
      <span aria-hidden="true">↗</span> Request
    </button>

    <div class="panel" :aria-busy="session.pending">
      <form v-if="session.panel === 'request'" @submit.prevent="submit">
        <h4 ref="panelHeading" tabindex="-1">Request</h4>
        <p v-if="!parameters.length && !operation.requestBody" class="muted">No parameters or request body.</p>

        <div v-for="parameter in parameters" :key="fieldKey(parameter)" class="field">
          <label class="field-label">
            <span>
              <code>{{ parameter.name }}</code>
              <small>{{ parameter.in }}<template v-if="parameter.required || parameter.in === 'path'"> · required</template></small>
            </span>
            <input
              v-model="session.fields[fieldKey(parameter)]"
              :required="parameter.required || parameter.in === 'path'"
              :placeholder="parameterHint(parameter)"
              spellcheck="false"
            >
          </label>
          <p v-if="parameter.description" class="muted">{{ parameter.description }}</p>
          <slot name="choices" :location="parameter.in" :parameter-name="parameter.name" />
        </div>

        <div v-if="content" class="field">
          <label class="field-label">
            <span>Request body <small>{{ content[0] }}</small></span>
            <textarea v-model="session.body" rows="7" spellcheck="false" :required="operation.requestBody.required" />
          </label>
          <slot name="choices" location="body" />
        </div>

        <p v-if="unsupported" class="muted">This request needs a body format other than JSON.</p>
        <p v-if="session.error" class="error" role="alert">{{ session.error }}</p>
        <button class="primary" type="submit" :disabled="session.pending || unsupported">
          {{ session.pending ? 'Sending…' : 'Send request' }}
        </button>
      </form>

      <div v-else-if="session.result">
        <h4 ref="panelHeading" tabindex="-1">Response</h4>
        <div class="response-meta">
          <strong class="status" :class="{ failed: !session.result.ok }">
            {{ session.result.status }} {{ session.result.statusText }}
          </strong>
          <small v-if="session.result.contentType">{{ session.result.contentType }}</small>
        </div>
        <pre v-if="session.result.text"><code>{{ session.result.text }}</code></pre>
        <p v-else class="muted">Empty response body.</p>
        <slot name="related" />
      </div>
    </div>

    <button
      v-if="session.panel === 'request' && session.result"
      class="edge edge-right"
      type="button"
      @click="showPanel('response')"
    >
      <span aria-hidden="true">↖</span> Response
    </button>
  </div>
</template>

<style scoped>
.runner { display: flex; border: 1px solid var(--line); border-radius: .65rem; overflow: hidden; }
.panel { flex: 1; min-width: 0; padding: 1rem; background: var(--canvas); }
.panel h4 { margin: 0 0 .75rem; }
.field { margin-bottom: 1rem; }
.field p { margin: .35rem 0 0; font-size: .85rem; }
.field-label { display: grid; gap: .35rem; }
.field-label span { font-weight: 650; }
.field-label small, .response-meta small { margin-left: .4rem; color: var(--muted); font-weight: 400; }
.field-label input { width: min(100%, 30rem); }
.field-label textarea { width: 100%; font-family: ui-monospace, Consolas, monospace; resize: vertical; }
.edge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .45rem;
  padding: .65rem .45rem;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 0;
  font-weight: 700;
  font-size: .82rem;
  writing-mode: vertical-rl;
}
.edge-left { border-right: 1px solid var(--line); }
.edge-right { border-left: 1px solid var(--line); }
.edge:focus-visible { outline-offset: -3px; }
.response-meta { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; }
.status { padding: .25rem .45rem; border-radius: .35rem; background: #d5f4e5; color: #125f41; }
.status.failed { background: #ffe3e2; color: #8f2225; }
pre { overflow: auto; max-height: 28rem; margin: .8rem 0 0; padding: .8rem; border-radius: .45rem; background: #172639; color: #eef4fa; }
</style>
