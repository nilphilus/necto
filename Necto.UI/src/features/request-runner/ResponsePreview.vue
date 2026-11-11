<script setup>
import { computed, ref, watch } from 'vue'
import PreviewPager from './PreviewPager.vue'
import { pageRange, TEXT_PAGE_SIZE } from './preview.js'
import JsonNode from './JsonNode.vue'
const props = defineProps({ result: { type: Object, required: true }, selectors: { type: Array, default: () => [] } })
const raw = ref(false)
const textPage = ref(1)
const text = computed(() => props.result.rawText ?? props.result.text ?? '')
const range = computed(() => pageRange(text.value.length, textPage.value, TEXT_PAGE_SIZE))
const visibleText = computed(() => text.value.slice(range.value.start, range.value.end))
watch(() => props.result, () => { textPage.value = 1; raw.value = false })
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
          <code role="status">Selected: {{ JSON.stringify(result.selectedPath) }}</code>
          <button type="button" @click="result.selectedPath = undefined">Clear selection</button>
        </template>
        <span v-else-if="selectors.length">Select an object to fill related request fields.</span>
      </template>
    </div>
    <div v-if="result.json !== undefined" v-show="!raw" class="json-preview" tabindex="0" aria-label="JSON response preview">
      <JsonNode :value="result.json" :path="[]" :selectors="selectors" :selected="result.selectedPath" @select="result.selectedPath = $event" />
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
.preview-toolbar button { padding: .25rem .4rem; border: 1px solid var(--line); }
.preview-toolbar button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.json-preview, pre { overflow: auto; max-height: 32rem; margin: 0; padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; font: .85rem/1.65 ui-monospace, Consolas, monospace; }
.json-preview { white-space: nowrap; }
.raw-preview { background: #182420; border-radius: .45rem; padding: .4rem; }
</style>
