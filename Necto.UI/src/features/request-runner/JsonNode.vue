<script setup>
import { computed, ref, watch } from 'vue'
import { matchesPath } from '../related-endpoints/mappings.js'
import { childEntries, pageRange, PREVIEW_PAGE_SIZE, STRING_PAGE_SIZE } from './preview.js'
import PreviewPager from './PreviewPager.vue'
const props = defineProps({ value: {}, path: { type: Array, required: true }, selectors: Array, selected: Array })
defineEmits(['select'])
const container = computed(() => props.value !== null && typeof props.value === 'object')
const array = computed(() => Array.isArray(props.value))
const keys = computed(() => container.value && !array.value ? Object.keys(props.value) : [])
const count = computed(() => array.value ? props.value.length : keys.value.length)
const page = ref(1)
const expanded = ref(props.path.length < 2)
const range = computed(() => pageRange(container.value ? count.value : typeof props.value === 'string' ? props.value.length : 0,
  page.value, container.value ? PREVIEW_PAGE_SIZE : STRING_PAGE_SIZE))
const entries = computed(() => expanded.value && container.value ? childEntries(props.value, range.value, keys.value) : [])
const selectable = computed(() => container.value && !array.value && props.selectors.some(path => matchesPath(path, props.path)))
const active = computed(() => props.selected && JSON.stringify(props.selected) === JSON.stringify(props.path))
const kind = computed(() => props.value === null ? 'null' : typeof props.value)
const scalar = computed(() => JSON.stringify(typeof props.value === 'string'
  ? props.value.slice(range.value.start, range.value.end) : props.value))
watch(() => props.value, () => { page.value = 1; expanded.value = props.path.length < 2 })
</script>

<template>
  <span v-if="!container">
    <span :class="'token-' + kind">{{ scalar }}</span>
    <PreviewPager v-if="kind === 'string'" :range="range" label="String characters" @change="page = $event" />
  </span>
  <span v-else class="json-object" :class="{ selected: active }">
    <button v-if="selectable" type="button" class="object-selector" :aria-pressed="Boolean(active)"
      :aria-label="'Select object at ' + JSON.stringify(path)" @click="$emit('select', path)">{{ active ? 'Selected' : 'Select' }}</button>
    <button v-if="count" type="button" class="object-selector" :aria-expanded="expanded"
      :aria-label="(expanded ? 'Collapse' : 'Expand') + ' ' + JSON.stringify(path)" @click="expanded = !expanded">{{ expanded ? '−' : '+' }}</button>
    <span>{{ array ? '[' : '{' }}</span>
    <template v-if="expanded">
      <PreviewPager :range="range" :label="array ? 'Items' : 'Properties'" @change="page = $event" />
      <span v-for="([key, child], index) in entries" :key="key" class="json-entry">
        <span v-if="!array" class="token-key">{{ JSON.stringify(key) }}<span class="punctuation">: </span></span>
        <span v-else class="item-index">{{ key }}: </span>
        <JsonNode :value="child" :path="[...path, key]" :selectors="selectors" :selected="selected" @select="$emit('select', $event)" />{{ range.start + index < count - 1 ? ',' : '' }}
      </span>
    </template>
    <span v-else class="item-index"> … {{ count.toLocaleString() }} {{ array ? 'items' : 'properties' }} </span>
    <span>{{ array ? ']' : '}' }}</span>
  </span>
</template>

<style scoped>
.json-entry { display: block; padding-left: 1.5rem; }
.json-object.selected { outline: 1px solid #7fddbb; border-radius: .2rem; background: #254638; }
.token-key { color: #9bd9fa; }
.token-string { color: #c1e6a0; white-space: pre-wrap; overflow-wrap: anywhere; }
.token-number { color: #ffd09a; }
.token-boolean, .token-null { color: #d8b8ff; }
.punctuation { color: #e7f3eb; }
.item-index { color: #a0b5ac; font-size: .75rem; }
.object-selector { margin-right: .5rem; padding: .1rem .35rem; border: 1px solid #729b88; color: #bcf2dc; font: .72rem system-ui, sans-serif; }
.object-selector:hover { background: #355d49; }
</style>
