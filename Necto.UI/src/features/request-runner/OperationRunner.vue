<script setup>
import DescriptionHelp from '../workbench/DescriptionHelp.vue'
import { computed, nextTick, ref, useId, watch, watchPostEffect } from 'vue'
import { bodyFields, hasBodyExample } from './bodyHelp.js'
import ImportedInputs from '../workbench/ImportedInputs.vue'
import { effectiveTarget } from '../workbench/target.js'
import { requestIdentity } from '../workbench/requestContext.js'


import BodyEditor from '../workbench/BodyEditor.vue'
import ExpandedBodyEditor from '../workbench/ExpandedBodyEditor.vue'
import RequestTools from '../workbench/RequestToolsMenu.vue'
import ResponsePreview from './ResponsePreview.vue'
import RequestSendIcon from './RequestSendIcon.vue'
import NextRequestsPanel from './NextRequestsPanel.vue'
import { applyBodyPresets, contextKey, fieldKey, jsonContent, presetSource, supportedParameters, requestUrl, buildRequest } from './request.js'

const props = defineProps({
  operation: { type: Object, required: true },
  session: { type: Object, required: true },
  run: { type: Function, required: true },
  values: { type: Map, required: true },
  presetColors: { type: Map, required: true },
  defaultPresetColor: { type: String, required: true },
  selectors: { type: Array, default: () => [] },
  hasRelated: Boolean,
  cancel: Function,
  prepare: Function,
  configuration: Object,
  history: Object,
})

const emit = defineEmits(['edit-preset'])
const target = computed(() => { try { return effectiveTarget(props.operation, props.configuration, props.session, props.values) } catch { return null } })
const responseStale = computed(() => {
  if (!props.session.result) return false
  if (props.session.resultStale) return true
  if (!props.session.result.requestIdentity) return Boolean(props.session.resultStale)
  try { return requestIdentity(buildRequest(props.operation, props.configuration ?? {}, props.session, props.values), props.session) !== props.session.result.requestIdentity }
  catch { return true }
})

const previewPreferences = computed(() => props.session.previewPreferences ??= { tables: {} })
const parameters = computed(() => supportedParameters(props.operation))
const parameterFields = computed(() => parameters.value.map(parameter => {
  const key = contextKey(parameter)
  return { parameter, key, source: presetSource(props.values, key) }
}))
const parameterIdPrefix = useId()
const content = computed(() => jsonContent(props.operation, props.session.mediaType))
const bodyPresetResult = computed(() => applyBodyPresets(props.operation, props.session.body, props.values, props.session.mediaType))
const effectiveBody = computed(() => bodyPresetResult.value.body)
const editingBody = ref(false)
const displayedBody = computed({
  get: () => editingBody.value ? props.session.body : effectiveBody.value,
  set: body => { props.session.body = body },
})
const relatedPinned = ref(false)
watch([() => props.session, () => props.hasRelated && Boolean(props.session.result)], ([, available]) => {
  relatedPinned.value = available
}, { immediate: true })
const pinnedToolsHost = ref(null)
const form = ref(null)
const requestFooter = ref(null)
const settingsTools = ref(null), settingsError = ref(''), invalidSetting = ref(null)
watch(() => props.session, () => { settingsError.value = ''; invalidSetting.value = null })
function handleInvalid(event) {
  if (!event.target.closest('.request-tools-dialog')) return
  event.preventDefault()
  invalidSetting.value = event.target
  const label = event.target.labels?.[0]?.textContent.trim() || 'Request setting'
  settingsError.value = `Check ${label}: ${event.target.validationMessage}`
  settingsTools.value?.revealInvalid(event.target)
}
function clearSettingsError(event) {
  if (event.target === invalidSetting.value && event.target.validity?.valid) { settingsError.value = ''; invalidSetting.value = null }
}
const responsePreview = ref(null), nextRequests = ref(null)
async function searchResponse(query) {
  nextRequests.value?.closeForSearch()
  await nextTick()
  await responsePreview.value?.searchWholeResponse(query)
}
const bodyEditor = ref(null)
const responsePane = ref(null)

function selectBodyValue(editor, direction, fromStart = false) {
  const body = editor.value
  try {
    JSON.parse(body)
  } catch {
    return false
  }

  const values = []
  for (const match of body.matchAll(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|\[\s*\]|\{\s*\}/g)) {
    const token = match[0]
    const end = match.index + token.length
    const quoted = token.startsWith('"')
    if (quoted && /^\s*:/.test(body.slice(end))) continue
    values.push({ start: match.index + Number(quoted), end: end - Number(quoted) })
  }

  const value = fromStart ? values[0] : direction > 0
    ? values.find(value => value.start > editor.selectionEnd)
    : values.findLast(value => value.end < editor.selectionStart)
  if (!value) return false
  editor.setSelectionRange(value.start, value.end)
  return true
}

async function focusFirstBodyValue(event) {
  const editor = bodyEditor.value
  if (!editor || event.target === editor) return
  event.preventDefault()
  editor.focus()
  await nextTick()
  if (document.activeElement === editor) selectBodyValue(editor, 1, true)
}

function tabBodyValue(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
  if (selectBodyValue(event.currentTarget, event.shiftKey ? -1 : 1)) event.preventDefault()
}

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
    editor.style.setProperty('--body-height-limit', `${Math.max(0, space - requestFooter.value.offsetHeight - 16)}px`)
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
    <form ref="form" class="request-pane" @invalid.capture="handleInvalid" @input.capture="clearSettingsError" @submit.prevent="run(operation, session)">
      <header class="pane-header">
        <h3>Request <small v-if="target" class="active-host" :title="target.label">{{ target.label }}</small></h3>
        <details v-if="target" class="target-details"><summary>Target</summary><div><strong>{{ target.api }} · {{ target.source }}</strong><code>{{ target.url }}</code><p v-if="!target.complete">Complete request inputs to inspect the full request URL.</p><p>Credential permissions remain scoped to the origins approved in Authorize.</p></div></details>
        <button v-if="requestCompact" type="button" class="secondary" @click="editRequest">Edit request</button>
        <div class="request-actions">
          <slot name="request-actions" />
          <RequestTools ref="settingsTools" @edit-request="editRequest" :operation="operation" :session="session" :values="values" :configuration="configuration" :prepare="prepare" :history="history" />
          <button v-if="session.result && !requestCompact" type="button" class="secondary focus-response" @click="focusResponse">Focus response</button>
        </div>
      </header>

      <p v-if="settingsError" class="settings-error error" role="alert">{{ settingsError }} <button type="button" @click="settingsTools?.revealInvalid(invalidSetting)">Fix request settings</button></p>
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

        <div v-for="({ parameter, key, source }, index) in parameterFields" :key="fieldKey(parameter)" class="field">
          <div class="parameter-heading">
            <label class="field-label" :for="`${parameterIdPrefix}-${index}`">
              <code>{{ parameter.name }}</code>{{ ' ' }}
              <small>{{ parameter.in }}<template v-if="parameter.required || parameter.in === 'path'"> · required</template></small>
            </label>
            <DescriptionHelp :label="'About parameter ' + parameter.name" :description="parameter.description" />
          </div>
          <div v-if="values.has(key)" class="preset-field"
            :style="{ '--preset-color': presetColors.get(source) ?? defaultPresetColor }">
            <input
              class="preset-value"
              :id="`${parameterIdPrefix}-${index}`"
              :aria-describedby="`${parameterIdPrefix}-${index}-preset`"
              :value="values.get(key)"
              readonly
              spellcheck="false"
            >
            <button v-if="source" type="button" class="preset-stamp"
              :id="`${parameterIdPrefix}-${index}-preset`"
              :aria-label="`Edit preset ${source}`" :title="`Edit preset ${source}`"
              @click="emit('edit-preset', source)">{{ source }}</button>
            <span v-else class="preset-stamp" :id="`${parameterIdPrefix}-${index}-preset`">Preset</span>
          </div>
          <template v-else>
            <slot name="parameter-input" :parameter="parameter" :hint="parameterHint(parameter)" :id="`${parameterIdPrefix}-${index}`">
              <input :id="`${parameterIdPrefix}-${index}`" v-model="session.fields[fieldKey(parameter)]"
                :required="parameter.required || parameter.in === 'path'" :placeholder="parameterHint(parameter)" spellcheck="false">
            </slot>
            <slot name="choices" :location="parameter.in" :parameter-name="parameter.name" />
          </template>
        </div>

        <BodyEditor v-if="operation.requestBody" :operation="operation" :session="session">
        <div v-if="content" class="field">
          <p class="body-origin"><strong>{{ session.sampleName ? 'Saved request' : hasBodyExample(content[1], operation.resolve) ? 'OpenAPI example' : 'Generated template' }}</strong><span v-if="!session.sampleName && !hasBodyExample(content[1], operation.resolve)"> · Fill placeholder values before sending. API validation may require different values.</span></p>
          <details v-if="content[1].schema" class="body-schema"><summary>Body fields and requirements</summary><dl><template v-for="field in bodyFields(operation, content[1].schema)" :key="field.path"><dt><code>{{ field.path }}</code></dt><dd>{{ field.rules }}</dd></template></dl><small>Requirements published by this API. Additional business rules may apply.</small></details>
          <div class="body-heading">
            <label :for="`${parameterIdPrefix}-body`" @click="focusFirstBodyValue">Request body <small>{{ content[0] }}</small></label>
            <ExpandedBodyEditor :session="session" @tab="tabBodyValue" />
          </div>
          <div class="field-label">
            <textarea
              :id="`${parameterIdPrefix}-body`"
              ref="bodyEditor"
              v-model="displayedBody"
              rows="3"
              spellcheck="false"
              :required="operation.requestBody.required && !effectiveBody"
              @focus="editingBody = true"
              @blur="editingBody = false"
              @keydown.tab="tabBodyValue"
            />
          </div>
          <details v-if="bodyPresetResult.sources?.length" class="body-preset-origins">
            <summary>Presets override {{ bodyPresetResult.sources.length }} body fields</summary>
            <ul><li v-for="source in bodyPresetResult.sources" :key="JSON.stringify(source.path)"><code>{{ JSON.stringify(source.path) }}</code> · <button type="button" class="preset-link" @click="emit('edit-preset', source.preset)">{{ source.preset }}</button></li></ul>
          </details>
          <slot name="choices" location="body" />
        </div>

        </BodyEditor>
        <p v-if="session.error" class="error" role="alert">{{ session.error }}</p>
      </div>
      <footer ref="requestFooter" class="request-actions request-footer">
        <button
          class="primary"
          type="submit"
          :disabled="session.pending"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          title="Send request (Ctrl or ⌘ + Enter)"
        >{{ session.pending ? 'Sending…' : 'Send request' }} <RequestSendIcon v-if="!session.pending" /></button>
        <button v-if="session.pending && cancel" type="button" @click="cancel(session)">Cancel</button>
      </footer>
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
        <p v-if="session.result?.reception" class="muted reception-progress" role="status">
          {{ session.result?.reception.receiving ? (session.result?.reception.progress?.phase === 'parsing' ? 'Parsing response…' : 'Receiving response…') : 'Reception stopped; response incomplete.' }}
          {{ (session.result?.reception.byteLength / 1024 / 1024).toFixed(1) }} MiB received.
          Showing the previous complete response.
          <span v-if="session.result?.reception.error">{{ session.result?.reception.error }}</span>
        </p>
        <template v-if="session.result">
          <p v-if="responseStale" class="muted response-stale" :class="{ 'response-stale-info': !session.error }" role="status">{{ session.error ? (session.result?.incomplete ? 'Response reception did not complete. No complete preview is available.' : 'The latest request did not complete. Showing the previous response.') : 'Inputs changed. This response belongs to the previous request.' }}</p>
          <div class="response-content" :class="{ 'has-related': hasRelated, 'related-pinned': relatedPinned }">
          <div class="response-body">
            <ResponsePreview ref="responsePreview" :result="session.result" :presentation="previewPreferences" :selectors="selectors" :operation="operation" :pending="session.pending" :stale="responseStale">
              <template #actions><NextRequestsPanel ref="nextRequests" v-if="hasRelated" v-model:pinned="relatedPinned" :operation-key="operation.key" :pin-target="pinnedToolsHost"><slot name="related" :search-response="searchResponse" /></NextRequestsPanel></template>
            </ResponsePreview>

          </div>
          <div v-if="hasRelated" v-show="relatedPinned" ref="pinnedToolsHost" class="pinned-tools-host"></div>
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
.parameter-heading { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin-bottom: .35rem; }
.parameter-heading .field-label { display: block; min-width: 0; font-size: .88rem; font-weight: 650; overflow-wrap: anywhere; }
.parameter-heading .description-help { margin-left: auto; }

.settings-error { margin:.5rem .85rem; font-size:.8rem; }
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
.target-details { position:relative; font-size:.75rem; }
.target-details summary {cursor:pointer;color:var(--accent)}
.target-details > div {position:absolute;z-index:8;top:100%;left:0;width:min(30rem,75vw);padding:.7rem;background:var(--surface);border:1px solid var(--line);border-radius:.4rem;overflow-wrap:anywhere;box-shadow:0 5px 15px #0002}
.target-details code {display:block;margin:.4rem 0}
.active-host {display:inline-block;max-width:18rem;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;font-weight:400;color:var(--muted);font-size:.7rem}
.pane-header h3 { margin: 0; font-size: .88rem; }
.request-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
.request-footer { padding: 0 .85rem .85rem; }
.request-actions button, .request-actions :slotted(button) { font-size: .84rem; }
.pane-header button span { margin-left: .25rem; }
.pane-body { padding: .85rem; }
.response-stale.response-stale-info {
  margin: 0 0 .65rem;
  padding: .45rem .65rem;
  border-radius: .35rem;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: ui-monospace, Consolas, monospace;
  font-size: .8rem;
  line-height: 1.5;
}
.empty { margin: 0; font-size: .85rem; }
.preset-link { padding: .1rem .3rem; color: var(--accent); text-decoration: underline; text-underline-offset: .15rem; }
.body-preset-origins { font-size: .78rem; margin-top: .5rem; overflow-wrap: anywhere; }
.body-preset-origins summary { cursor: pointer; }
.body-origin, .body-schema { font-size: .78rem; margin: 0 0 .5rem; }
.body-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .35rem; }
.body-schema summary { cursor: pointer; color: var(--accent); }
.body-schema dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: .35rem; overflow-wrap: anywhere; }
.body-schema dd { margin: 0; color: var(--muted); }
.field + .field { margin-top: .85rem; }
.field p { margin: .35rem 0 0; font-size: .82rem; }
.field-label { display: grid; gap: .35rem; }
.body-heading label { font-weight: 650; font-size: .88rem; }
.body-heading small { margin-left: .4rem; color: var(--muted); font-weight: 400; }
.field > input, .field-label textarea { width: 100%; }
.preset-field {
  position: relative;
  width: fit-content;
  min-width: min(12rem, 100%);
  max-width: 100%;
  margin-bottom: .5rem;
}
.preset-field .preset-value {
  display: block;
  width: auto;
  min-width: 100%;
  max-width: 100%;
  field-sizing: content;
  padding-bottom: .75rem;
  border-color: var(--preset-color);
}
.preset-stamp {
  position: absolute;
  right: .45rem;
  bottom: 0;
  transform: translateY(40%);
  max-width: calc(100% - .9rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: .1rem .4rem;
  border: 1px solid var(--preset-color);
  border-radius: .3rem;
  background: color-mix(in srgb, var(--preset-color) 24%, var(--surface));
  font-size: .7rem;
  font-weight: 650;
  line-height: 1.2;
}
button.preset-stamp:hover { background: color-mix(in srgb, var(--preset-color) 34%, var(--surface)); }
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
  .response-content.related-pinned .pinned-tools-host { grid-column: 2; grid-row: 1; position: sticky; top: 1rem; max-height: calc(100dvh - 10rem); overflow: auto; }
}
.response-type { margin: 0 0 .35rem; color: var(--muted); font-size: .74rem; overflow-wrap: anywhere; }
pre { overflow: auto; max-height: 28rem; margin: 0; padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; }
</style>
