<script setup>
import { computed, ref, watch } from 'vue'
import { contextKey, fieldKey, jsonContent, supportedParameters } from './request.js'

const props = defineProps({
  operation: { type: Object, required: true },
  session: { type: Object, required: true },
  run: { type: Function, required: true },
  values: { type: Map, required: true },
})

const parameters = computed(() => supportedParameters(props.operation))
const content = computed(() => jsonContent(props.operation))
const unsupported = computed(() => props.operation.requestBody && !content.value)
const form = ref(null)
const responsePane = ref(null)

watch([() => props.session, () => props.session.result], ([session, result], [previousSession]) => {
  if (session !== previousSession || !result) return
  const response = responsePane.value
  if (!response || !form.value) return
  const top = response.getBoundingClientRect().top
  const request = form.value.getBoundingClientRect()
  const workArea = response.closest('.work-area')?.getBoundingClientRect()
  const visibleTop = Math.max(0, workArea?.top ?? 0)
  const visibleBottom = Math.min(window.innerHeight, workArea?.bottom ?? window.innerHeight)
  if (request.bottom > visibleTop && request.top < visibleBottom && top >= request.bottom && top >= visibleBottom - 56) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    response.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'instant' : 'smooth' })
  }
}, { flush: 'post' })

function sendShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.isComposing) return
  event.preventDefault()
  if (!event.repeat && !props.session.pending && !unsupported.value) form.value.requestSubmit()
}

function parameterHint(parameter) {
  const type = props.operation.resolve(parameter.schema)?.type
  return type === 'array' || type === 'object' ? `JSON ${type}` : undefined
}
</script>

<template>
  <div class="runner" @keydown.enter="sendShortcut">
    <form ref="form" class="request-pane" @submit.prevent="run(operation, session)">
      <header class="pane-header">
        <h3>Request</h3>
        <button
          class="primary"
          type="submit"
          :disabled="session.pending || unsupported"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          title="Send request (Ctrl or ⌘ + Enter)"
        >{{ session.pending ? 'Sending…' : 'Send request' }} <span aria-hidden="true">↗</span></button>
      </header>

      <div class="pane-body">
        <p v-if="!parameters.length && !operation.requestBody" class="muted empty">Ready to send. This endpoint has no inputs.</p>

        <div v-for="parameter in parameters" :key="fieldKey(parameter)" class="field">
          <label class="field-label">
            <span>
              <code>{{ parameter.name }}</code>
              <small>{{ parameter.in }}<template v-if="parameter.required || parameter.in === 'path'"> · required</template></small>
            </span>
            <input
              v-if="values.has(contextKey(parameter))"
              :value="values.get(contextKey(parameter))"
              readonly
              spellcheck="false"
            >
            <input
              v-else
              v-model="session.fields[fieldKey(parameter)]"
              :required="parameter.required || parameter.in === 'path'"
              :placeholder="parameterHint(parameter)"
              spellcheck="false"
            >
          </label>
          <p v-if="parameter.description" class="muted">{{ parameter.description }}</p>
          <p v-if="values.has(contextKey(parameter))" class="muted">Set by the environment or call-flow.</p>
          <slot v-else name="choices" :location="parameter.in" :parameter-name="parameter.name" />
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
      </div>
    </form>

    <section ref="responsePane" class="response-pane" aria-label="Response" :aria-busy="session.pending">
      <header class="pane-header">
        <h3>{{ session.pending && session.result ? 'Last response' : 'Response' }}</h3>
        <div class="response-meta" role="status">
          <template v-if="session.result">
            <strong class="status" :class="{ failed: !session.result.ok }">
              {{ session.result.status }} {{ session.result.statusText }}
            </strong>
            <span>{{ session.result.elapsed }} ms</span>
          </template>
          <span v-else>{{ session.pending ? 'Waiting…' : 'Ready' }}</span>
        </div>
      </header>

      <div class="pane-body">
        <template v-if="session.result">
          <slot name="related" />
          <div class="response-body">
            <p class="response-type">{{ session.result.contentType || 'Body' }}</p>
            <pre v-if="session.result.text" tabindex="0"><code>{{ session.result.text }}</code></pre>
            <p v-else class="muted empty">Empty response body.</p>
          </div>
        </template>
        <p v-else class="muted empty">
          {{ session.pending ? 'Waiting for the server.' : 'Send the request to inspect its response here.' }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.runner {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  border: 1px solid var(--line);
  border-radius: .75rem;
  background: var(--surface);
}
.runner > * { min-width: 0; }
.response-pane { border-top: 1px solid var(--line); background: var(--subtle); border-radius: 0 0 .65rem .65rem; }
.pane-header {
  min-height: 3.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: .4rem;
  padding: .55rem .8rem;
  border-bottom: 1px solid var(--line);
}
.pane-header h3 { margin: 0; font-size: .88rem; }
.pane-header button { font-size: .84rem; }
.pane-header button span { margin-left: .25rem; }
.pane-body { padding: .85rem; }
.empty { margin: 0; font-size: .85rem; }
.field + .field { margin-top: .85rem; }
.field p { margin: .35rem 0 0; font-size: .82rem; }
.field-label { display: grid; gap: .35rem; }
.field-label span { font-weight: 650; font-size: .88rem; }
.field-label small { margin-left: .4rem; color: var(--muted); font-weight: 400; }
.field-label input, .field-label textarea { width: 100%; }
.field-label textarea { font-family: ui-monospace, Consolas, monospace; font-size: .875rem; resize: vertical; }
.response-meta { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; color: var(--muted); font-size: .75rem; }
.status { padding: .22rem .4rem; border-radius: .35rem; background: #ddf3e8; color: #125f41; }
.status.failed { background: #ffe3e2; color: #8f2225; }
.response-body { margin-top: .75rem; }
.response-body:first-child { margin-top: 0; }
.response-type { margin: 0 0 .35rem; color: var(--muted); font-size: .74rem; overflow-wrap: anywhere; }
pre { overflow: auto; max-height: 28rem; margin: 0; padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; }
</style>
