<script setup>
import { computed, nextTick, ref, watch, watchPostEffect } from 'vue'
import { bodyFields, hasBodyExample } from './bodyHelp.js'
import ImportedInputs from '../workbench/ImportedInputs.vue'
import BodyEditor from '../workbench/BodyEditor.vue'
import RequestTools from '../workbench/RequestTools.vue'
import ResponsePreview from './ResponsePreview.vue'
import RequestSendIcon from './RequestSendIcon.vue'
import NextRequestsPanel from './NextRequestsPanel.vue'
import { applyBodyPresets, contextKey, fieldKey, jsonContent, presetSource, supportedParameters, requestUrl } from './request.js'

const props = defineProps({
  operation: { type: Object, required: true },
  session: { type: Object, required: true },
  run: { type: Function, required: true },
  values: { type: Map, required: true },
  selectors: { type: Array, default: () => [] },
  hasRelated: Boolean,
  cancel: Function,
  prepare: Function,
  configuration: Object,
  history: Object,
})

const emit = defineEmits(['edit-preset'])
const activeHost = computed(() => {
  try {
    const server = props.operation.servers?.[props.session.serverIndex]
    const operation = server ? { ...props.operation, requestServer: { ...server, values: props.session.serverValues } } : props.operation
    const configuration = props.operation.configuration
      ? { ...props.operation.configuration, serverProfiles: props.configuration?.serverProfiles }
      : props.configuration ?? {}
    return requestUrl(operation, configuration).host
  } catch { return '' }
})
const parameters = computed(() => supportedParameters(props.operation))
const content = computed(() => jsonContent(props.operation, props.session.mediaType))
const bodyPresetResult = computed(() => applyBodyPresets(props.operation, props.session.body, props.values, props.session.mediaType))
const effectiveBody = computed(() => bodyPresetResult.value.body)
const editingBody = ref(false)
const displayedBody = computed({
  get: () => editingBody.value ? props.session.body : effectiveBody.value,
  set: body => { props.session.body = body },
})
const relatedPinned = ref(false)
const form = ref(null)
const bodyEditor = ref(null)
const responsePane = ref(null)

const requestCompact = ref(false)
let preferredFocus = null
try { preferredFocus = JSON.parse(sessionStorage.getItem('necto:response-focus')) } catch { /* Optional layout preference. */ }
const inputSummary = computed(() => parameters.value.map(parameter => {
  const key = contextKey(parameter)
  const value = props.values.has(key) ? props.values.get(key) : props.session.fields[fieldKey(parameter)]
  return { key, name: parameter.name, value: /authorization|token|secret|password|api.?key/i.test(parameter.name) ? '[hidden]' : (String(value ?? '').slice(0, 160) + (String(value ?? '').length > 160 ? '…' : '')) || '(not set)', source: presetSource(props.values, key) }
}))
function rememberFocus(value) {
  preferredFocus = value
  try { sessionStorage.setItem('necto:response-focus', JSON.stringify(value)) } catch { /* Memory-only fallback. */ }
}
async function focusResponse() {
  if (!form.value.checkValidity()) { await editRequest(); form.value.reportValidity(); return }
  requestCompact.value = true; rememberFocus(true)
  await nextTick()
  responsePane.value?.setAttribute('tabindex', '-1')
  responsePane.value?.focus({ preventScroll: true })
  responsePane.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
}
async function editRequest() {
  requestCompact.value = false; rememberFocus(false)
  await nextTick()
  form.value?.querySelector('input:not([readonly]), textarea, button')?.focus()
}
watch(() => props.session, () => { requestCompact.value = Boolean(props.session.result && preferredFocus === true) })
watch(() => props.session.error, error => { if (error) requestCompact.value = false })

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

watch([() => props.session, () => props.session.result], async ([session, result], [previousSession]) => {
  if (session !== previousSession || !result) return
  if (!result.ok) requestCompact.value = false
  const editing = form.value?.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')
  if (result.ok && !editing && (preferredFocus === true || preferredFocus === null && ['GET', 'HEAD'].includes(props.operation.method))) requestCompact.value = true
  await nextTick()
  if (props.session !== session || props.session.result !== result) return
  const response = responsePane.value
  if (!response) return
  const data = response.querySelector('.json-preview, .raw-preview') ?? response
  const bounds = response.closest('.work-area')?.getBoundingClientRect()
  const visibleBottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight)
  if (!editing && data.getBoundingClientRect().top > visibleBottom - 180) response.scrollIntoView({ block: 'start', behavior: 'instant' })
}, { flush: 'post' })

function sendShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.isComposing) return
  event.preventDefault()
  if (!event.repeat && !props.session.pending) form.value.requestSubmit()
}

function parameterHint(parameter) {
  const type = props.operation.resolve(parameter.schema)?.type
  return type === 'array' || type === 'object' ? `JSON ${type}` : undefined
}
</script>

<template>
  <div class="runner" :class="{ 'request-compact': requestCompact }" @keydown.enter="sendShortcut">
    <form ref="form" class="request-pane" @submit.prevent="run(operation, session)">
      <header class="pane-header">
        <h3 :title="activeHost">Request <small class="active-host">{{ activeHost }}</small></h3>
        <button v-if="requestCompact" type="button" class="secondary" @click="editRequest">Edit request</button>
        <div class="request-actions">
          <slot name="request-actions" />
          <RequestTools :operation="operation" :session="session" :values="values" :configuration="configuration" :prepare="prepare" :history="history" />
          <button v-if="session.pending && cancel" type="button" @click="cancel(session)">Cancel</button>
          <button v-if="session.result && !requestCompact" type="button" class="secondary focus-response" @click="focusResponse">Focus response</button>
          <button
            class="primary"
            type="submit"
            :disabled="session.pending"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title="Send request (Ctrl or ⌘ + Enter)"
          >{{ session.pending ? 'Sending…' : 'Send request' }} <RequestSendIcon v-if="!session.pending" /></button>
        </div>
      </header>

      <div v-if="requestCompact" class="request-summary" aria-label="Request summary">
        <span v-for="input in inputSummary" :key="input.key"><code>{{ input.name }}</code>: <span class="summary-value">{{ input.value }}</span><button v-if="input.source" type="button" class="preset-link" @click="emit('edit-preset', input.source)">{{ input.source }}</button></span>
        <span v-if="content">JSON body · {{ effectiveBody.length.toLocaleString() }} characters</span>
        <span v-if="operation.requestBody && !content">Body · {{ session.mediaType || Object.keys(operation.requestBody.content)[0] }}</span>
        <span v-if="!inputSummary.length && !operation.requestBody">No inputs</span>
      </div>
      <div v-show="!requestCompact" class="pane-body">
        <slot name="samples" />
        <ImportedInputs :session="session" />
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

        <BodyEditor v-if="operation.requestBody" :operation="operation" :session="session">
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

        </BodyEditor>
        <p v-if="session.error" class="error" role="alert">{{ session.error }}</p>
      </div>
    </form>

    <section ref="responsePane" class="response-pane" aria-label="Response" :aria-busy="session.pending">
      <header v-if="!session.result" class="pane-header">
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
          <div class="response-content" :class="{ 'has-related': hasRelated, 'related-pinned': relatedPinned }">
          <NextRequestsPanel v-if="hasRelated" :operation-key="operation.key" @pin="relatedPinned = $event"><slot name="related" /></NextRequestsPanel>
          <div class="response-body">
            <ResponsePreview :result="session.result" :selectors="selectors" :operation="operation" :pending="session.pending" :stale="session.resultStale" />
          </div>

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
.request-summary { display: flex; flex-wrap: wrap; gap: .25rem .8rem; padding: .35rem .8rem; color: var(--muted); font-size: .75rem; }
.request-summary > span { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.summary-value { white-space: pre-wrap; }
.focus-response { font-size: .75rem; margin-left: auto; }
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
.active-host {display:inline-block;max-width:18rem;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;font-weight:400;color:var(--muted);font-size:.7rem}
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
.response-body { margin: 0; grid-column: 1; }
.response-content.related-pinned .response-body { grid-row: 1; }

@container (min-width: 48rem) {
  .response-content.related-pinned { grid-template-columns: minmax(0, 1fr) 17rem; }
  .response-content.related-pinned :deep(.next-requests) { grid-column: 2; grid-row: 1; position: sticky; top: 1rem; max-height: calc(100dvh - 10rem); overflow: auto; }
}
.response-type { margin: 0 0 .35rem; color: var(--muted); font-size: .74rem; overflow-wrap: anywhere; }
pre { overflow: auto; max-height: 28rem; margin: 0; padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; }
</style>
