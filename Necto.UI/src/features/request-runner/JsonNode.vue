<script setup>
import { computed, ref, watch } from 'vue'
import { matchesPath } from '../related-endpoints/mappings.js'
import { childEntries, pageRange, PREVIEW_PAGE_SIZE, STRING_PAGE_SIZE } from './preview.js'
import { isPrefix } from '../payload-search/search.js'
import PreviewPager from './PreviewPager.vue'
import XmlPreview from './XmlPreview.vue'
import { looksLikeXml } from './xmlDetection.js'
const props = defineProps({ value: {}, path: { type: Array, required: true }, selectors: Array, selected: Array, navigation: Object, root: Boolean })
defineEmits(['select'])
const xmlOpen = ref(false)
const xmlAvailable = computed(() => looksLikeXml(props.value))
watch(() => props.value, () => { xmlOpen.value = false })
const container = computed(() => props.value !== null && typeof props.value === 'object')
const array = computed(() => Array.isArray(props.value))
const keys = computed(() => container.value && !array.value ? Object.keys(props.value) : [])
const count = computed(() => array.value ? props.value.length : keys.value.length)
const page = ref(1)
const expanded = ref(props.root || props.path.length < 2)
const range = computed(() => pageRange(container.value ? count.value : typeof props.value === 'string' ? props.value.length : 0,
  page.value, container.value ? PREVIEW_PAGE_SIZE : STRING_PAGE_SIZE))
const entries = computed(() => expanded.value && container.value ? childEntries(props.value, range.value, keys.value) : [])
const selectable = computed(() => container.value && !array.value && props.selectors.some(path => matchesPath(path, props.path)))
const active = computed(() => props.selected && JSON.stringify(props.selected) === JSON.stringify(props.path))
const kind = computed(() => props.value === null ? 'null' : typeof props.value)
const scalar = computed(() => JSON.stringify(typeof props.value === 'string'
  ? props.value.slice(range.value.start, range.value.end) : props.value))
watch(() => props.value, () => { page.value = 1; expanded.value = props.root || props.path.length < 2 })
const target = computed(() => props.navigation && props.navigation.path.length === props.path.length && isPrefix(props.path, props.navigation.path))
const parts = computed(() => {
  if (!target.value || !props.navigation.length || props.navigation.kind === 'key') return null
  const string = typeof props.value === 'string'
  const text = string ? props.value.slice(range.value.start, range.value.end) : JSON.stringify(props.value)
  const offset = props.navigation.offset - (string ? range.value.start : 0)
  if (offset < 0 || offset >= text.length) return null
  const encode = value => string ? JSON.stringify(value).slice(1, -1) : value
  return { before: encode(text.slice(0, offset)), match: encode(text.slice(offset, offset + props.navigation.length)),
    after: encode(text.slice(offset + props.navigation.length)), quoted: string }
})
function keyTarget(key) {
  const path = [...props.path, key]
  return props.navigation?.kind !== 'value' && props.navigation?.path.length === path.length && isPrefix(path, props.navigation.path)
}
watch([() => props.navigation, () => props.value], () => {
  const navigation = props.navigation
  if (!navigation) return
  if (target.value) xmlOpen.value = false
  if (!isPrefix(props.path, navigation.path)) { expanded.value = props.root || props.path.length < 2; return }
  if (container.value) {
    expanded.value = true
    const child = navigation.path[props.path.length]
    if (child !== undefined) {
      const index = array.value ? child : keys.value.indexOf(child)
      if (index >= 0) page.value = Math.floor(index / PREVIEW_PAGE_SIZE) + 1
    }
  } else if (typeof props.value === 'string' && target.value && navigation.kind !== 'key') {
    page.value = Math.floor(navigation.offset / STRING_PAGE_SIZE) + 1
  }
}, { immediate: true })

</script>

<template>
  <span v-if="!container" :data-search-target="target ? 'true' : undefined" :class="{ 'search-hit': target }">
    <button v-if="xmlAvailable" type="button" class="object-selector" :aria-expanded="xmlOpen" :aria-label="(xmlOpen ? 'Close XML preview at ' : 'Preview XML at ') + JSON.stringify(path)" @click="xmlOpen = !xmlOpen">{{ xmlOpen ? 'Back to string' : 'XML preview' }}</button>
    <XmlPreview v-if="xmlOpen" :text="value" />
    <span v-else :class="'token-' + kind"><template v-if="parts">{{ parts.quoted ? '"' : '' }}{{ parts.before }}<mark data-search-match="true">{{ parts.match }}</mark>{{ parts.after }}{{ parts.quoted ? '"' : '' }}</template><template v-else>{{ scalar }}</template></span>
    <PreviewPager v-if="kind === 'string' && !xmlOpen" :range="range" label="String characters" @change="page = $event" />
  </span>
  <span v-else class="json-object" :data-search-target="target ? 'true' : undefined" :class="{ selected: active, 'search-hit': target }">
    <button v-if="selectable" type="button" class="object-selector" :aria-pressed="Boolean(active)"
      :aria-label="'Select object at ' + JSON.stringify(path)" @click="$emit('select', path)">{{ active ? 'Selected' : 'Select' }}</button>
    <button v-if="count" type="button" class="object-selector" :aria-expanded="expanded"
      :aria-label="(expanded ? 'Collapse' : 'Expand') + ' ' + JSON.stringify(path)" @click="expanded = !expanded">{{ expanded ? '−' : '+' }}</button>
    <span>{{ array ? '[' : '{' }}</span>
    <template v-if="expanded">
      <PreviewPager :range="range" :label="array ? 'Items' : 'Properties'" @change="page = $event" />
      <span v-for="([key, child], index) in entries" :key="key" class="json-entry">
        <span v-if="!array" class="token-key" :class="{ 'search-key': keyTarget(key) }" :data-search-key="keyTarget(key) ? 'true' : undefined">{{ JSON.stringify(key) }}<span class="punctuation">: </span></span>
        <span v-else class="item-index">{{ key }}: </span>
        <JsonNode :value="child" :path="[...path, key]" :selectors="selectors" :selected="selected" :navigation="navigation" @select="$emit('select', $event)" />{{ range.start + index < count - 1 ? ',' : '' }}
      </span>
    </template>
    <span v-else class="item-index"> … {{ count.toLocaleString() }} {{ array ? 'items' : 'properties' }} </span>
    <span>{{ array ? ']' : '}' }}</span>
  </span>
</template>

<style scoped>
mark { background: #ffe29a; color: #33280d; border-radius: .15rem; }
.search-hit { outline: 1px solid #d4b777; border-radius: .15rem; }
.search-key { background: #5a4922; color: #ffe29a; }
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
