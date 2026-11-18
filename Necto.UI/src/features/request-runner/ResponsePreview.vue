<script setup>
import { expansionPlan } from './expansion.js'
import { responseCollection } from './responseCollection.js'
import { tablePreferenceKey } from '../workbench/previewPreferences.js'
import { computed, nextTick, ref, markRaw, useId, watch, reactive } from 'vue'
import { responseFilename } from '../workbench/response.js'
import CollectionTable from '../workbench/CollectionTable.vue'
import { tableColumns } from '../workbench/collectionTable.js'
import PreviewPager from './PreviewPager.vue'
import { pageRange, TEXT_PAGE_SIZE } from './preview.js'
import { usePreviewHeight } from './usePreviewHeight.js'
import PayloadSearch from '../payload-search/PayloadSearch.vue'
import { valueAtPath, pathLabel } from '../payload-search/search.js'
import JsonNode from './JsonNode.vue'
import XmlPreview from './XmlPreview.vue'
import { isXmlResponse } from './xmlDetection.js'
import { selectionLabel } from './selection.js'
const props = defineProps({
  result: { type: Object, required: true },
  selectors: { type: Array, default: () => [] },
  operation: Object,
  presentation: Object,
  pending: Boolean,
  stale: Boolean,
})
const responseTarget = computed(() => {
  try {
    const url = new URL(props.result.sentRequest.url)
    return url.host + url.pathname
  } catch {
    return 'Target not retained'
  }
})
const payloadFinder = ref(null)
async function searchWholeResponse(query) {
  raw.value = false
  table.value = false
  await toggleSearch(true)
  await payloadFinder.value?.setQuery(query)
  finderPanel.value?.scrollIntoView({ block: 'nearest' })
}
defineExpose({ searchWholeResponse })
const searchOpen = ref(false)
const finderButton = ref(null)
const finderPanel = ref(null)
const searchId = useId()
function handleFind(event) {
  if (props.result.json === undefined) return
  event.preventDefault()
  event.stopPropagation()
  toggleSearch(true)
}
async function toggleSearch(open = !searchOpen.value) {
  searchOpen.value = open
  await nextTick()
  if (open) finderPanel.value?.querySelector('input[type="search"]')?.focus()
  else finderButton.value?.focus()
}
const table = ref(false)
const tableReturn = ref(null)
const tableValue = computed(() => tableReturn.value?.value ?? previewValue.value)
const tablePath = computed(() => tableReturn.value?.path ?? focusPath.value)
const tableAvailable = computed(() => tableColumns(tableValue.value).length > 0)
async function inspectRow(path) {
  tableReturn.value ??= { value: previewValue.value, path: focusPath.value }
  focusPath.value = path
  table.value = false
  raw.value = false
  navigation.value = null
  await nextTick()
  preview.value?.focus()
}
const raw = ref(false)
const streamEvents = computed(() => props.result.stream?.events ?? [])
const textPage = ref(1)
const navigation = ref(null)
const focusPath = ref([])
const preview = ref(null)
const schedulePreviewHeight = usePreviewHeight()
watch([raw, table, textPage, focusPath], () => nextTick(schedulePreviewHeight))
let navigationId = 0
const expansionModes = reactive(new Map()),
  previewPages = reactive(new Map())
let expansionRevision = 0
const expansion = computed(() => ({
  commands: [...expansionModes.values()].flatMap((command) => {
    try {
      return [
        {
          ...command,
          ...(command.expanded
            ? expansionPlan(
                valueAtPath(props.result.json, command.path),
                command.path,
                previewPages
              )
            : { paths: new Set(), limited: false }),
        },
      ]
    } catch {
      return []
    }
  }),
}))
function toggleChildren({ path, expanded }) {
  for (const [key, command] of expansionModes)
    if (
      path.length <= command.path.length &&
      path.every((part, index) => part === command.path[index])
    )
      expansionModes.delete(key)
  expansionModes.set(JSON.stringify(path), {
    path: [...path],
    expanded,
    revision: ++expansionRevision,
  })
  nextTick(schedulePreviewHeight)
}
function previewPage({ path, page }) {
  previewPages.set(JSON.stringify(path), page)
}
const previewValue = computed(() => valueAtPath(props.result.json, focusPath.value))
const text = computed(() =>
  props.result.stream?.view?.selectedIndex !== undefined
    ? JSON.stringify(props.result.json, null, 2)
    : (props.result.rawText ?? props.result.text ?? '')
)
const xmlAvailable = computed(
  () =>
    text.value.length > 0 &&
    !props.result.incomplete &&
    !props.result.binary &&
    !props.result.stream &&
    props.result.json === undefined &&
    isXmlResponse(props.result.contentType, text.value)
)
const range = computed(() => pageRange(text.value.length, textPage.value, TEXT_PAGE_SIZE))
const visibleText = computed(() => text.value.slice(range.value.start, range.value.end))
watch(
  () => props.result,
  (result, previous) => {
    if (result.stream?.view && result.stream.view === previous?.stream?.view) return
    expansionModes.clear()
    previewPages.clear()
    textPage.value = 1
    raw.value = false
    table.value = Boolean(
      props.presentation?.view === 'table' &&
        props.presentation.viewKey === tablePreferenceKey(props.operation, [], result.json)
    )
    tableReturn.value = null
    navigation.value = null
    focusPath.value = responseCollection(props.operation, result)?.path ?? []
    navigationId++
  },
  { immediate: true }
)

async function reveal(match, scroll = true) {
  const id = ++navigationId
  navigation.value = match ? { ...match, id } : null
  if (!match) return
  if (scroll) {
    raw.value = false
    table.value = false
  }
  // Deep documents are shown at their containing object rather than mounting thousands of ancestors.
  focusPath.value = match.path.length > 32 ? match.path.slice(0, -1) : []
  await nextTick()
  await nextTick()
  if (!scroll || id !== navigationId) return
  const element =
    preview.value?.querySelector('[data-search-match="true"], [data-search-key="true"]') ??
    preview.value?.querySelector('[data-search-target="true"]')
  element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
}
function selectPath(path) {
  props.result.selectedPath = path
  if (props.result.stream?.view) props.result.stream.view.selectedPath = path
}
function inspectEvent(event) {
  expansionModes.clear()
  previewPages.clear()
  props.result.stream.view.selectedIndex = event.index
  props.result.json =
    event.data && typeof event.data === 'object' ? markRaw(event.data) : event.data
  selectPath(undefined)
  raw.value = false
  table.value = false
  focusPath.value = []
  textPage.value = 1
  navigation.value = null
}
function backToStream() {
  expansionModes.clear()
  previewPages.clear()
  props.result.stream.view.selectedIndex = undefined
  props.result.json = undefined
  selectPath(undefined)
  raw.value = false
  table.value = false
  focusPath.value = []
  textPage.value = 1
}
function showTable() {
  if (tableReturn.value) fullResponse()
  else {
    table.value = true
    raw.value = false
  }
  if (props.presentation) {
    props.presentation.view = 'table'
    props.presentation.viewKey = tablePreferenceKey(
      props.operation,
      focusPath.value,
      previewValue.value
    )
  }
}
function showPreview() {
  raw.value = false
  table.value = false
  if (props.presentation) props.presentation.view = 'json'
}
function showRaw() {
  raw.value = true
  if (props.presentation) props.presentation.view = 'json'
}
function fullResponse() {
  const previous = tableReturn.value
  focusPath.value = previous?.path ?? []
  table.value = Boolean(previous)
  raw.value = false
  tableReturn.value = null
  navigation.value = null
  navigationId++
}

function download() {
  const url = URL.createObjectURL(
    props.result.binary ??
      new Blob([props.result.rawText ?? props.result.text ?? text.value], {
        type: props.result.contentType || 'text/plain',
      })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = responseFilename(props.result)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function closeDetails(event) {
  const details = event.currentTarget
  details.open = false
  details.querySelector('summary').focus()
}
</script>

<template>
  <div class="response-preview" @keydown.ctrl.f="handleFind" @keydown.meta.f="handleFind">
    <div class="preview-toolbar" aria-label="Response tools">
      <h3>
        {{
          result.incomplete
            ? result.receiving
              ? 'Response in progress'
              : 'Incomplete response'
            : pending || stale
              ? 'Last response'
              : 'Response'
        }}
      </h3>
      <details
        v-if="operation"
        class="mobile-response-context"
        @keydown.esc.stop.prevent="closeDetails"
      >
        <summary :title="`${operation.method} ${operation.path} · ${responseTarget}`">
          <strong>{{ operation.method }} {{ operation.path }}</strong
          ><small>{{ responseTarget }}</small>
        </summary>
        <div>
          <strong
            >{{ pending || stale ? 'Last response' : 'Response' }} · {{ operation.method }}
            {{ operation.path }}</strong
          ><code>{{ responseTarget }}</code>
        </div>
      </details>
      <span
        class="status"
        :class="{ failed: !result.ok || (result.incomplete && !result.receiving) }"
        role="status"
        >{{ result.status }} {{ result.statusText }}</span
      >
      <span>{{ result.elapsed }} ms</span>
      <slot name="actions" />
      <template v-if="result.json !== undefined || xmlAvailable">
        <button type="button" :aria-pressed="!raw && !table" @click="showPreview">Preview</button>
        <button type="button" :aria-pressed="raw" @click="showRaw">Raw</button>
        <button
          v-if="tableAvailable"
          type="button"
          :aria-pressed="table && !raw"
          @click="showTable"
        >
          Table
        </button>
        <button
          v-if="result.json !== undefined"
          ref="finderButton"
          type="button"
          :aria-expanded="searchOpen"
          :aria-controls="searchId"
          title="Find in response (Ctrl or ⌘ + F while the preview is focused)"
          @click="toggleSearch()"
        >
          Find
        </button>
      </template>
      <details class="response-details" @keydown.esc.stop.prevent="closeDetails">
        <summary>Details</summary>
        <div class="response-details-content">
          <p>
            {{ result.contentType || 'Body' }} ·
            {{
              result.binary
                ? `${result.binary.size.toLocaleString()} bytes`
                : `${text.length.toLocaleString()} characters`
            }}
          </p>
          <button type="button" :disabled="result.incomplete" @click="download">
            Download response
          </button>
          <dl>
            <template v-for="(value, name) in result.headers" :key="name"
              ><dt>{{ name }}</dt>
              <dd>{{ value }}</dd></template
            >
          </dl>
          <p v-if="result.json !== undefined">
            Preview pagination does not change the API response. Select a mapped object to fill
            related request fields.
          </p>
        </div>
      </details>
    </div>
    <div v-if="result.selectedPath" class="selection-toolbar">
      <span role="status" class="selection-label">{{ selectionLabel(operation, result) }}</span>
      <details class="selection-path">
        <summary>JSON path</summary>
        <code>{{ pathLabel(result.selectedPath) }}</code>
      </details>
      <button type="button" @click="selectPath(undefined)">Clear selection</button>
    </div>
    <div
      v-show="searchOpen"
      :id="searchId"
      ref="finderPanel"
      @keydown.esc.stop.prevent="toggleSearch(false)"
    >
      <PayloadSearch
        ref="payloadFinder"
        v-if="result.json !== undefined"
        :result="result"
        :selectors="selectors"
        @reveal="reveal"
        @select="selectPath($event)"
      />
    </div>
    <div v-if="focusPath.length && !raw" class="preview-toolbar">
      <code>Focused object: {{ pathLabel(focusPath) }}</code
      ><span
        v-if="
          responseCollection(operation, result)?.total !== null &&
          responseCollection(operation, result)
        "
        >API total: {{ responseCollection(operation, result).total }}</span
      ><button type="button" @click="fullResponse">
        {{ tableReturn ? 'Back to table' : 'Back to full response' }}
      </button>
    </div>
    <CollectionTable
      v-if="tableAvailable"
      v-show="table && !raw"
      :value="tableValue"
      :presentation="presentation"
      :path="tablePath"
      :operation="operation"
      :status="result.status"
      :content-type="result.contentType"
      :selectors="selectors"
      :selected="result.selectedPath"
      @select="selectPath($event)"
      @inspect="inspectRow"
    />
    <div
      v-if="result.json !== undefined"
      v-show="!raw && !table"
      ref="preview"
      class="json-preview"
      tabindex="0"
      aria-label="JSON response preview"
    >
      <JsonNode
        :expansion="expansion"
        @toggle-children="toggleChildren"
        @page="previewPage"
        :key="JSON.stringify(focusPath)"
        :value="previewValue"
        :path="focusPath"
        :root="true"
        :navigation="navigation"
        :selectors="selectors"
        :selected="result.selectedPath"
        @select="selectPath($event)"
      />
    </div>
    <div v-if="result.stream?.view?.selectedIndex !== undefined" class="preview-toolbar">
      <strong>Event {{ result.stream.view.selectedIndex + 1 }}</strong
      ><button type="button" @click="backToStream">Back to stream</button>
    </div>
    <p v-if="result.incomplete" role="status">
      {{
        result.receiving
          ? result.progress?.phase === 'parsing'
            ? 'Parsing response…'
            : 'Receiving response…'
          : 'Reception stopped; response incomplete.'
      }}
      {{ (result.byteLength / 1024 / 1024).toFixed(1) }} MiB received.
      <template v-if="result.progress?.total"
        >Server reports {{ (result.progress.total / 1024 / 1024).toFixed(1) }} MiB (may differ after
        decompression).</template
      >
      Preview budget: {{ Math.round((result.progress?.limit || 0) / 1024 / 1024) }} MiB.
    </p>
    <p v-if="result.stream" role="status">
      {{ streamEvents.length }} events ·
      {{ result.stream.reason ? 'Interrupted' : result.stream.done ? 'Finished' : 'Receiving…'
      }}<template v-if="result.stream.limited">
        · Preview limit reached; connection closed.</template
      >
    </p>
    <details
      v-for="event in streamEvents"
      v-show="result.stream?.view?.selectedIndex === undefined"
      :key="event.index"
    >
      <summary>{{ event.index + 1 }} · {{ event.event }} {{ event.id }} {{ event.error }}</summary>
      <button type="button" :disabled="!!event.error" @click="inspectEvent(event)">
        Inspect event {{ event.index + 1 }}
      </button>
      <pre>{{ JSON.stringify(event.data, null, 2) }}</pre>
    </details>
    <XmlPreview v-if="xmlAvailable && !raw" :text="text" />
    <div
      v-if="
        (!result.stream || result.stream.view?.selectedIndex !== undefined) &&
        text &&
        (raw || (result.json === undefined && !xmlAvailable))
      "
      class="raw-preview"
    >
      <PreviewPager :range="range" label="Text characters" @change="textPage = $event" />
      <pre tabindex="0"><code>{{ visibleText }}</code></pre>
    </div>
    <p v-if="result.binary">
      Binary response · {{ result.binary?.size?.toLocaleString() }} bytes. Use Details to download
      the original file.
    </p>
    <ul v-if="result.assertions?.length">
      <li v-for="(check, index) in result.assertions" :key="index">
        {{ check.passed ? '✓' : '✗' }} {{ check.label }} · {{ check.actual }}
      </li>
    </ul>
    <p
      v-if="
        !text && result.json === undefined && !result.binary && !result.stream && !result.incomplete
      "
      class="muted empty"
    >
      Empty response body.
    </p>
  </div>
</template>

<style scoped>
.mobile-response-context {
  display: none;
  position: relative;
  min-width: 0;
}
.mobile-response-context summary {
  cursor: pointer;
  max-width: 11rem;
}
.mobile-response-context summary strong,
.mobile-response-context small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-response-context small {
  font-size: 0.65rem;
}
.mobile-response-context > div {
  position: absolute;
  left: 0;
  top: 100%;
  width: min(18rem, 75vw);
  z-index: 6;
  padding: 0.6rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  overflow-wrap: anywhere;
}
.mobile-response-context code {
  display: block;
  white-space: normal;
  margin-top: 0.3rem;
}
@media (max-width: 720px) {
  .mobile-response-context {
    display: block;
  }
  .preview-toolbar:has(.mobile-response-context) > h3 {
    display: none;
  }
}

.preview-toolbar h3 {
  margin: 0;
  font-size: 0.85rem;
}
.status {
  padding: 0.15rem 0.35rem;
  border-radius: 0.3rem;
  background: #ddf3e8;
  color: #125f41;
}
.status.failed {
  background: #ffe3e2;
  color: #8f2225;
}
.response-details {
  position: relative;
  margin-left: auto;
}
.response-details summary {
  cursor: pointer;
  padding: 0.25rem 0.4rem;
}
.response-details-content {
  position: absolute;
  right: 0;
  top: 100%;
  width: min(22rem, 75vw);
  padding: 0.6rem;
  z-index: 5;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: var(--surface);
  box-shadow: 0 6px 20px #20352c20;
  overflow-wrap: anywhere;
}
.response-details-content {
  max-height: min(60dvh, 32rem);
  overflow: auto;
}
.response-details-content dl {
  font-size: 0.75rem;
}
.response-details-content dd {
  margin: 0 0 0.5rem;
  white-space: pre-wrap;
}
.response-details-content dt {
  font-weight: 600;
}
.response-details-content p {
  margin: 0.2rem 0 0.5rem;
}
.selection-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
}
.selection-toolbar button {
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--line);
}
.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: var(--muted);
}
.selection-label {
  color: var(--accent);
  font-weight: 600;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.selection-path {
  max-width: 100%;
}
.selection-path summary {
  cursor: pointer;
}
.preview-toolbar code {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.preview-toolbar button {
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--line);
}
.preview-toolbar button[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
}
.json-preview,
pre {
  overflow: auto;
  max-height: var(--preview-height, 32rem);
  margin: 0;
  padding: 0.8rem;
  border-radius: 0.45rem;
  background: #182420;
  color: #e7f3eb;
  font:
    0.85rem/1.65 ui-monospace,
    Consolas,
    monospace;
}
.json-preview {
  white-space: nowrap;
}
.raw-preview {
  background: #182420;
  border-radius: 0.45rem;
  padding: 0.4rem;
}
.response-preview > .preview-toolbar:first-child {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--subtle);
  padding-block: 0.2rem;
}
</style>
