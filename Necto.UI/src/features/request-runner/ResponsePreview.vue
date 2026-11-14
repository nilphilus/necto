<script setup>
import { computed, nextTick, ref, markRaw, useId, watch } from 'vue'
import { responseFilename } from '../workbench/response.js'
import PreviewPager from './PreviewPager.vue'
import { pageRange, TEXT_PAGE_SIZE } from './preview.js'
import { usePreviewHeight } from './usePreviewHeight.js'
import PayloadSearch from '../payload-search/PayloadSearch.vue'
import { valueAtPath, pathLabel } from '../payload-search/search.js'
import JsonNode from './JsonNode.vue'
import { selectionLabel } from './selection.js'
const props = defineProps({ result: { type: Object, required: true }, selectors: { type: Array, default: () => [] }, operation: Object, pending: Boolean, stale: Boolean })
const searchOpen = ref(false)
const finderButton = ref(null)
const finderPanel = ref(null)
const searchId = useId()
async function toggleSearch(open = !searchOpen.value) {
  searchOpen.value = open
  await nextTick()
  if (open) finderPanel.value?.querySelector('input[type="search"]')?.focus()
  else finderButton.value?.focus()
}
const raw = ref(false)
const streamEvents = computed(() => props.result.stream?.events ?? [])
const textPage = ref(1)
const navigation = ref(null)
const focusPath = ref([])
const preview = ref(null)
const schedulePreviewHeight = usePreviewHeight()
watch([raw, textPage, focusPath], () => nextTick(schedulePreviewHeight))
let navigationId = 0
const previewValue = computed(() => valueAtPath(props.result.json, focusPath.value))
const text = computed(() => props.result.stream?.view?.selectedIndex !== undefined ? JSON.stringify(props.result.json, null, 2) : props.result.rawText ?? props.result.text ?? '')
const range = computed(() => pageRange(text.value.length, textPage.value, TEXT_PAGE_SIZE))
const visibleText = computed(() => text.value.slice(range.value.start, range.value.end))
watch(() => props.result, (result, previous) => { if (result.stream?.view && result.stream.view === previous?.stream?.view) return; textPage.value = 1; raw.value = false; navigation.value = null; focusPath.value = []; navigationId++ })
async function reveal(match, scroll = true) {
  const id = ++navigationId
  navigation.value = match ? { ...match, id } : null
  if (!match) return
  if (scroll) raw.value = false
  // Deep documents are shown at their containing object rather than mounting thousands of ancestors.
  focusPath.value = match.path.length > 32 ? match.path.slice(0, -1) : []
  await nextTick(); await nextTick()
  if (!scroll || id !== navigationId) return
  const element = preview.value?.querySelector('[data-search-match="true"], [data-search-key="true"]') ??
    preview.value?.querySelector('[data-search-target="true"]')
  element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
}
function selectPath(path) { props.result.selectedPath = path; if (props.result.stream?.view) props.result.stream.view.selectedPath = path }
function inspectEvent(event) {
  props.result.stream.view.selectedIndex = event.index
  props.result.json = event.data && typeof event.data === 'object' ? markRaw(event.data) : event.data
  selectPath(undefined); raw.value = false; focusPath.value = []; textPage.value = 1; navigation.value = null
}
function backToStream() { props.result.stream.view.selectedIndex = undefined; props.result.json = undefined; selectPath(undefined); raw.value = false; focusPath.value = []; textPage.value = 1 }
function fullResponse() { focusPath.value = []; navigation.value = null; navigationId++ }

function download() {
  const url = URL.createObjectURL(props.result.binary ?? new Blob([props.result.rawText ?? props.result.text ?? text.value], { type: props.result.contentType || 'text/plain' }))
  const link = document.createElement('a')
  link.href = url; link.download = responseFilename(props.result)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="response-preview" @keydown.ctrl.f.prevent.stop="toggleSearch(true)" @keydown.meta.f.prevent.stop="toggleSearch(true)">
    <div class="preview-toolbar" aria-label="Response tools">
      <h3>{{ pending || stale ? 'Last response' : 'Response' }}</h3>
      <span class="status" :class="{ failed: !result.ok }" role="status">{{ result.status }} {{ result.statusText }}</span>
      <span>{{ result.elapsed }} ms</span>
      <slot name="actions" />
      <template v-if="result.json !== undefined">
        <button type="button" :aria-pressed="!raw" @click="raw = false">Preview</button>
        <button type="button" :aria-pressed="raw" @click="raw = true">Raw</button>
        <button ref="finderButton" type="button" :aria-expanded="searchOpen" :aria-controls="searchId" title="Find in response (Ctrl or ⌘ + F while the preview is focused)" @click="toggleSearch()">Find</button>
      </template>
      <details class="response-details" @keydown.esc.stop.prevent="$event.currentTarget.open = false; $event.currentTarget.querySelector('summary').focus()">
        <summary>Details</summary>
        <div class="response-details-content">
          <p>{{ result.contentType || 'Body' }} · {{ result.binary ? `${result.binary.size.toLocaleString()} bytes` : `${text.length.toLocaleString()} characters` }}</p>
          <button type="button" @click="download">Download response</button>
          <dl><template v-for="(value, name) in result.headers" :key="name"><dt>{{ name }}</dt><dd>{{ value }}</dd></template></dl>
          <p v-if="result.json !== undefined">Preview pagination does not change the API response. Select a mapped object to fill related request fields.</p>
        </div>
      </details>
    </div>
    <div v-if="result.selectedPath" class="selection-toolbar">
      <span role="status" class="selection-label">{{ selectionLabel(operation, result) }}</span>
      <details class="selection-path"><summary>JSON path</summary><code>{{ pathLabel(result.selectedPath) }}</code></details>
      <button type="button" @click="selectPath(undefined)">Clear selection</button>
    </div>
    <div v-show="searchOpen" :id="searchId" ref="finderPanel" @keydown.esc.stop.prevent="toggleSearch(false)">
      <PayloadSearch v-if="result.json !== undefined" :result="result" :selectors="selectors" @reveal="reveal" @select="selectPath($event)" />
    </div>
    <div v-if="focusPath.length && !raw" class="preview-toolbar"><code>Focused object: {{ pathLabel(focusPath) }}</code><button type="button" @click="fullResponse">Back to full response</button></div>
    <div v-if="result.json !== undefined" v-show="!raw" ref="preview" class="json-preview" tabindex="0" aria-label="JSON response preview">
      <JsonNode :key="JSON.stringify(focusPath)" :value="previewValue" :path="focusPath" :root="true" :navigation="navigation" :selectors="selectors" :selected="result.selectedPath" @select="selectPath($event)" />
    </div>
    <div v-if="result.stream?.view?.selectedIndex !== undefined" class="preview-toolbar"><strong>Event {{ result.stream.view.selectedIndex + 1 }}</strong><button type="button" @click="backToStream">Back to stream</button></div>
    <p v-if="result.stream" role="status">{{ streamEvents.length }} events · {{ result.stream.reason ? "Interrupted" : result.stream.done ? "Finished" : "Receiving…" }}<template v-if="result.stream.limited"> · Preview limit reached; connection closed.</template></p>
    <details v-for="event in streamEvents" v-show="result.stream?.view?.selectedIndex === undefined" :key="event.index"><summary>{{ event.index + 1 }} · {{ event.event }} {{ event.id }} {{ event.error }}</summary><button type="button" :disabled="!!event.error" @click="inspectEvent(event)">Inspect event {{ event.index + 1 }}</button><pre>{{ JSON.stringify(event.data, null, 2) }}</pre></details>
    <div v-if="(!result.stream || result.stream.view?.selectedIndex !== undefined) && text && (raw || result.json === undefined)" class="raw-preview">
      <PreviewPager :range="range" label="Text characters" @change="textPage = $event" />
      <pre tabindex="0"><code>{{ visibleText }}</code></pre>
    </div>
    <p v-if="result.binary">Binary response · {{ result.binary?.size?.toLocaleString() }} bytes. Use Details to download the original file.</p>
    <ul v-if="result.assertions?.length"><li v-for="(check, index) in result.assertions" :key="index">{{ check.passed ? "✓" : "✗" }} {{ check.label }} · {{ check.actual }}</li></ul>
    <p v-if="!text && result.json === undefined && !result.binary && !result.stream" class="muted empty">Empty response body.</p>
  </div>
</template>

<style scoped>
.preview-toolbar h3 { margin: 0; font-size: .85rem; }
.status { padding: .15rem .35rem; border-radius: .3rem; background: #ddf3e8; color: #125f41; }
.status.failed { background: #ffe3e2; color: #8f2225; }
.response-details { position: relative; margin-left: auto; }
.response-details summary { cursor: pointer; padding: .25rem .4rem; }
.response-details-content { position: absolute; right: 0; top: 100%; width: min(22rem, 75vw); padding: .6rem; z-index: 5; border: 1px solid var(--line); border-radius: .4rem; background: var(--surface); box-shadow: 0 6px 20px #20352c20; overflow-wrap: anywhere; }
.response-details-content { max-height: min(60dvh, 32rem); overflow:auto; }
.response-details-content dl {font-size:.75rem}
.response-details-content dd {margin:0 0 .5rem;white-space:pre-wrap}
.response-details-content dt {font-weight:600}
.response-details-content p { margin: .2rem 0 .5rem; }
.selection-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-bottom: .35rem; font-size: .75rem; }
.selection-toolbar button { padding: .2rem .4rem; border: 1px solid var(--line); }
.preview-toolbar { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: .5rem; font-size: .75rem; color: var(--muted); }
.selection-label { color: var(--accent); font-weight: 600; overflow-wrap: anywhere; max-width: 100%; }
.selection-path { max-width: 100%; }
.selection-path summary { cursor: pointer; }
.preview-toolbar code { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.preview-toolbar button { padding: .25rem .4rem; border: 1px solid var(--line); }
.preview-toolbar button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.json-preview, pre { overflow: auto; max-height: var(--preview-height, 32rem); margin: 0; padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; font: .85rem/1.65 ui-monospace, Consolas, monospace; }
.json-preview { white-space: nowrap; }
.raw-preview { background: #182420; border-radius: .45rem; padding: .4rem; }
.response-preview > .preview-toolbar:first-child { position: sticky; top: 0; z-index: 3; background: var(--subtle); padding-block: .2rem; }
</style>
