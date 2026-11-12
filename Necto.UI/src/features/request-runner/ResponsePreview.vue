<script setup>
import { ref } from 'vue'
import JsonNode from './JsonNode.vue'
defineProps({ result: { type: Object, required: true }, selectors: { type: Array, default: () => [] } })
const raw = ref(false)
</script>

<template>
  <div class="response-preview">
    <div v-if="result.json !== undefined" class="preview-toolbar">
      <button type="button" :aria-pressed="!raw" @click="raw = false">Preview</button>
      <button type="button" :aria-pressed="raw" @click="raw = true">Raw</button>
      <template v-if="result.selectedPath">
        <code role="status">Selected: {{ JSON.stringify(result.selectedPath) }}</code>
        <button type="button" @click="result.selectedPath = undefined">Clear selection</button>
      </template>
      <span v-else-if="selectors.length">Select an object to narrow related requests and values.</span>
    </div>
    <div v-if="!raw && result.json !== undefined" class="json-preview" tabindex="0" aria-label="JSON response preview">
      <JsonNode :value="result.json" :path="[]" :selectors="selectors" :selected="result.selectedPath" @select="result.selectedPath = $event" />
    </div>
    <pre v-else-if="result.text" tabindex="0"><code>{{ result.rawText ?? result.text }}</code></pre>
    <p v-else class="muted empty">Empty response body.</p>
  </div>
</template>

<style scoped>
.preview-toolbar { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: .5rem; font-size: .75rem; color: var(--muted); }
.preview-toolbar button { padding: .25rem .4rem; border: 1px solid var(--line); }
.preview-toolbar button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.json-preview, pre { overflow: auto; max-height: 32rem; margin: 0; padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; font: .85rem/1.65 ui-monospace, Consolas, monospace; }
.json-preview { white-space: nowrap; }
</style>
