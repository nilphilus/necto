<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import PreviewPager from './PreviewPager.vue'
import { pageRange, TEXT_PAGE_SIZE } from './preview.js'
import PayloadSearch from '../payload-search/PayloadSearch.vue'
import { valueAtPath, pathLabel } from '../payload-search/search.js'
import JsonNode from './JsonNode.vue'
import { selectionLabel } from './selection.js'
import { usePreviewHeight } from './usePreviewHeight.js'
const props = defineProps({ result: { type: Object, required: true }, selectors: { type: Array, default: () => [] }, operation: Object })
const raw = ref(false)
const textPage = ref(1)
const navigation = ref(null)
const focusPath = ref([])
const preview = ref(null)
const schedulePreviewHeight = usePreviewHeight()
watch([raw, textPage, focusPath], () => nextTick(schedulePreviewHeight))
let navigationId = 0
const previewValue = computed(() => valueAtPath(props.result.json, focusPath.value))
const text = computed(() => props.result.rawText ?? props.result.text ?? '')
const range = computed(() => pageRange(text.value.length, textPage.value, TEXT_PAGE_SIZE))
const visibleText = computed(() => text.value.slice(range.value.start, range.value.end))
watch(() => props.result, () => { textPage.value = 1; raw.value = false; navigation.value = null; focusPath.value = []; navigationId++ })
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
function fullResponse() { focusPath.value = []; navigation.value = null; navigationId++ }

function download() {
  const url = URL.createObjectURL(new Blob([text.value], { type: props.result.contentType || 'text/plain' }))
  const link = document.createElement('a')
  link.href = url; link.download = props.result.json === undefined ? 'response.txt' : 'response.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="response-preview">
    <div class="preview-toolbar">
      <span>{{ text.length.toLocaleString() }} characters</span>
      <button type="button" @click="download">Download response</button>
      <template v-if="result.json !== undefined">
        <span>Preview pages only · API response unchanged</span>
        <button type="button" :aria-pressed="!raw" @click="raw = false">Preview</button>
        <button type="button" :aria-pressed="raw" @click="raw = true">Raw</button>
        <template v-if="result.selectedPath">
          <span role="status" class="selection-label">{{ selectionLabel(operation, result) }}</span>
          <details class="selection-path"><summary>JSON path</summary><code>{{ pathLabel(result.selectedPath) }}</code></details>
          <button type="button" @click="result.selectedPath = undefined">Clear selection</button>
        </template>
        <span v-else-if="selectors.length">Select an object to fill related request fields.</span>
      </template>
    </div>
    <PayloadSearch v-if="result.json !== undefined" :result="result" :selectors="selectors" @reveal="reveal" @select="result.selectedPath = $event" />
    <div v-if="focusPath.length && !raw" class="preview-toolbar"><code>Focused object: {{ pathLabel(focusPath) }}</code><button type="button" @click="fullResponse">Back to full response</button></div>
    <div v-if="result.json !== undefined" v-show="!raw" ref="preview" class="json-preview" tabindex="0" aria-label="JSON response preview">
      <JsonNode :key="JSON.stringify(focusPath)" :value="previewValue" :path="focusPath" :root="true" :navigation="navigation" :selectors="selectors" :selected="result.selectedPath" @select="result.selectedPath = $event" />
    </div>
    <div v-if="text && (raw || result.json === undefined)" class="raw-preview">
      <PreviewPager :range="range" label="Text characters" @change="textPage = $event" />
      <pre tabindex="0"><code>{{ visibleText }}</code></pre>
    </div>
    <p v-if="!text && result.json === undefined" class="muted empty">Empty response body.</p>
  </div>
</template>

<style scoped>
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
