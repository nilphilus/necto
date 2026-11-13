<script setup>
import { computed, ref, watch, watchPostEffect } from 'vue'
import { bodyFields, hasBodyExample } from './bodyHelp.js'
import ResponsePreview from './ResponsePreview.vue'
import { applyBodyPresets, contextKey, fieldKey, jsonContent, presetSource, supportedParameters } from './request.js'

const props = defineProps({
  operation: { type: Object, required: true },
  session: { type: Object, required: true },
  run: { type: Function, required: true },
  values: { type: Map, required: true },
  selectors: { type: Array, default: () => [] },
  hasRelated: Boolean,
})

const emit = defineEmits(['edit-preset'])
const parameters = computed(() => supportedParameters(props.operation))
const content = computed(() => jsonContent(props.operation))
const bodyPresetResult = computed(() => applyBodyPresets(props.operation, props.session.body, props.values))
const effectiveBody = computed(() => bodyPresetResult.value.body)
const editingBody = ref(false)
const displayedBody = computed({
  get: () => editingBody.value ? props.session.body : effectiveBody.value,
  set: body => { props.session.body = body },
})
const unsupported = computed(() => props.operation.requestBody && !content.value)
const form = ref(null)
const bodyEditor = ref(null)
const responsePane = ref(null)

watchPostEffect(onCleanup => {
  const editor = bodyEditor.value
  if (!editor) return

  const requestPane = form.value
  const workArea = requestPane.closest('.work-area')
  const endpoint = requestPane.closest('article')

  function limitBodyHeight() {
    const bounds = workArea?.getBoundingClientRect()
    const top = Math.max(0, bounds?.top ?? 0)
    const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight)
    const editorTop = editor.getBoundingClientRect().top
    // On a long form, size the editor for when the user scrolls it into view.
    const available = bottom - Math.max(top, editorTop)
    const space = available >= 96 ? available : bottom - top
    editor.style.setProperty('--body-height-limit', `${Math.max(0, space - 16)}px`)
  }

  limitBodyHeight()
  const observer = new ResizeObserver(limitBodyHeight)
  observer.observe(requestPane)
  if (workArea) observer.observe(workArea)
  if (endpoint) observer.observe(endpoint)
  window.addEventListener('resize', limitBodyHeight)
  onCleanup(() => {
    observer.disconnect()
    window.removeEventListener('resize', limitBodyHeight)
  })
})

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
        <div class="request-actions">
          <slot name="request-actions" />
          <button
            class="primary"
            type="submit"
            :disabled="session.pending || unsupported"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title="Send request (Ctrl or ⌘ + Enter)"
          >{{ session.pending ? 'Sending…' : 'Send request' }} <span aria-hidden="true">↗</span></button>
        </div>
      </header>

      <div class="pane-body">
        <slot name="samples" />
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
            <slot v-else name="parameter-input" :parameter="parameter" :hint="parameterHint(parameter)">
              <input v-model="session.fields[fieldKey(parameter)]" :required="parameter.required || parameter.in === 'path'"
                :placeholder="parameterHint(parameter)" spellcheck="false">
            </slot>
          </label>
          <p v-if="parameter.description" class="muted">{{ parameter.description }}</p>
          <p v-if="values.has(contextKey(parameter))" class="muted preset-origin">Set by preset
            <button v-if="presetSource(values, contextKey(parameter))" type="button" class="preset-link" @click="emit('edit-preset', presetSource(values, contextKey(parameter)))">{{ presetSource(values, contextKey(parameter)) }}</button>
            <span v-else>active request preset</span>.
          </p>
          <slot v-else name="choices" :location="parameter.in" :parameter-name="parameter.name" />
        </div>

        <div v-if="content" class="field">
          <p class="body-origin"><strong>{{ session.sampleName ? 'Saved request' : hasBodyExample(content[1], operation.resolve) ? 'OpenAPI example' : 'Generated template' }}</strong><span v-if="!session.sampleName && !hasBodyExample(content[1], operation.resolve)"> · Fill placeholder values before sending. API validation may require different values.</span></p>
          <details v-if="content[1].schema" class="body-schema"><summary>Body fields and requirements</summary><dl><template v-for="field in bodyFields(operation, content[1].schema)" :key="field.path"><dt><code>{{ field.path }}</code></dt><dd>{{ field.rules }}</dd></template></dl><small>Requirements published by this API. Additional business rules may apply.</small></details>
          <label class="field-label">
            <span>Request body <small>{{ content[0] }}</small></span>
            <textarea
              ref="bodyEditor"
              v-model="displayedBody"
              rows="3"
              spellcheck="false"
              :required="operation.requestBody.required && !effectiveBody"
              @focus="editingBody = true"
              @blur="editingBody = false"
            />
          </label>
          <details v-if="bodyPresetResult.sources?.length" class="body-preset-origins">
            <summary>Presets override {{ bodyPresetResult.sources.length }} body fields</summary>
            <ul><li v-for="source in bodyPresetResult.sources" :key="JSON.stringify(source.path)"><code>{{ JSON.stringify(source.path) }}</code> · <button type="button" class="preset-link" @click="emit('edit-preset', source.preset)">{{ source.preset }}</button></li></ul>
          </details>
          <slot name="choices" location="body" />
        </div>

        <p v-if="unsupported" class="muted">This request needs a body format other than JSON.</p>
        <p v-if="session.error" class="error" role="alert">{{ session.error }}</p>
      </div>
    </form>

    <section ref="responsePane" class="response-pane" aria-label="Response" :aria-busy="session.pending">
      <header class="pane-header">
        <h3>{{ (session.pending || session.resultStale) && session.result ? 'Last response' : 'Response' }}</h3>
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
          <p v-if="session.resultStale" class="muted response-stale" role="status">Inputs changed. Showing the previous response until you send again.</p>
          <div class="response-content" :class="{ 'has-related': hasRelated }">
          <div class="response-body">
            <p class="response-type">{{ session.result.contentType || 'Body' }}</p>
            <ResponsePreview :result="session.result" :selectors="selectors" />
          </div>
          <aside v-if="hasRelated" class="response-actions" aria-label="Next request">
            <details open class="continuation-panel">
              <summary>Next request</summary>
              <slot name="related" />
            </details>
          </aside>
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
  container-type: inline-size;
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
.request-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
.request-actions button, .request-actions :slotted(button) { font-size: .84rem; }
.pane-header button span { margin-left: .25rem; }
.pane-body { padding: .85rem; }
.empty { margin: 0; font-size: .85rem; }
.preset-link { padding: .1rem .3rem; color: var(--accent); text-decoration: underline; text-underline-offset: .15rem; }
.body-preset-origins { font-size: .78rem; margin-top: .5rem; overflow-wrap: anywhere; }
.body-preset-origins summary { cursor: pointer; }
.body-origin, .body-schema { font-size: .78rem; margin: 0 0 .5rem; }
.body-schema summary { cursor: pointer; color: var(--accent); }
.body-schema dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: .35rem; overflow-wrap: anywhere; }
.body-schema dd { margin: 0; color: var(--muted); }
.field + .field { margin-top: .85rem; }
.field p { margin: .35rem 0 0; font-size: .82rem; }
.field-label { display: grid; gap: .35rem; }
.field-label span { font-weight: 650; font-size: .88rem; }
.field-label small { margin-left: .4rem; color: var(--muted); font-weight: 400; }
.field-label input, .field-label textarea { width: 100%; }
.field-label textarea {
  field-sizing: content;
  min-height: min(4.5rem, var(--body-height-limit, 70dvh));
  max-height: var(--body-height-limit, 70dvh);
  overflow: auto;
  font-family: ui-monospace, Consolas, monospace;
  font-size: .875rem;
  resize: vertical;
}
.response-meta { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; color: var(--muted); font-size: .75rem; }
.status { padding: .22rem .4rem; border-radius: .35rem; background: #ddf3e8; color: #125f41; }
.status.failed { background: #ffe3e2; color: #8f2225; }
.response-content { display: grid; gap: .85rem; align-items: start; }
.response-content > * { min-width: 0; }
.response-body { margin: 0; }
.response-actions { min-width: 0; }
.continuation-panel > summary { cursor: pointer; padding: .55rem .7rem; border: 1px solid var(--line); border-radius: .5rem; color: var(--accent); font-size: .82rem; font-weight: 650; background: var(--surface); }
.continuation-panel[open] > summary { margin-bottom: .5rem; }
@container (min-width: 48rem) {
  .response-content.has-related { grid-template-columns: minmax(0, 1fr) 17rem; }
  .response-actions { position: sticky; top: 1rem; max-height: calc(100dvh - 10rem); overflow: auto; }
}
.response-type { margin: 0 0 .35rem; color: var(--muted); font-size: .74rem; overflow-wrap: anywhere; }
pre { overflow: auto; max-height: 28rem; margin: 0; padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; }
</style>
