<script setup>
import { computed, ref, watch } from 'vue'
import { hasExpandableChildren } from './expansion.js'
import { matchesPath } from '../related-endpoints/mappings.js'
import { childEntries, pageRange, PREVIEW_PAGE_SIZE, STRING_PAGE_SIZE } from './preview.js'
import { isPrefix } from '../payload-search/search.js'
import PreviewPager from './PreviewPager.vue'
import XmlPreview from './XmlPreview.vue'
import { looksLikeXml } from './xmlDetection.js'
const props = defineProps({ value: {}, path: { type: Array, required: true }, selectors: Array, canSelect: Function, selectionNote: String, selected: Array, navigation: Object, root: Boolean, expansion: Object })
const emit=defineEmits(['select','page','toggle-children'])
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
const selectable = computed(() => container.value && !array.value && props.selectors.some(path => matchesPath(path, props.path)) && (props.canSelect?.(props.path) ?? true))
const active = computed(() => props.selected && JSON.stringify(props.selected) === JSON.stringify(props.path))
const kind = computed(() => props.value === null ? 'null' : typeof props.value)
const scalar = computed(() => JSON.stringify(typeof props.value === 'string'
  ? props.value.slice(range.value.start, range.value.end) : props.value))
watch(() => props.value, () => { page.value = 1; expanded.value = props.root || props.path.length < 2 })
function changePage(value){page.value=value;emit('page',{path:props.path,page:value})}
const expansionKey=computed(()=>JSON.stringify(props.path))
const activeExpansion=computed(()=>props.expansion?.commands.findLast(command=>isPrefix(command.path,props.path)))
const childrenExpanded=computed(()=>Boolean(activeExpansion.value?.expanded&&activeExpansion.value.paths.has(expansionKey.value)))
const canToggleChildren = computed(() => props.expansion && container.value && count.value > 0 &&
  ((childrenExpanded.value && activeExpansion.value.path.length === props.path.length) ||
   hasExpandableChildren(props.value, range.value, keys.value)))
const childrenToggleTitle = computed(() => (childrenExpanded.value ? 'Collapse' : 'Expand') +
  (array.value ? ' children in this list.' : ' children under this object.') +
  ' Visible pages only; preview limits remain active.')
const forcedExpansion=computed(()=>{
 const command=activeExpansion.value
 return command?{expanded:props.root||command.path.length===props.path.length||childrenExpanded.value,revision:command.revision}:null
})
watch(()=>forcedExpansion.value?forcedExpansion.value.revision+':'+forcedExpansion.value.expanded:null,()=>{
 if(forcedExpansion.value)expanded.value=forcedExpansion.value.expanded
},{immediate:true})
function toggleChildren(){expanded.value=true;emit('toggle-children',{path:props.path,expanded:!childrenExpanded.value})}
const expansionLimited=computed(()=>activeExpansion.value?.expanded&&activeExpansion.value.limited&&activeExpansion.value.path.length===props.path.length)
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
  if (!isPrefix(props.path, navigation.path)) { expanded.value = forcedExpansion.value?.expanded ?? (props.root || props.path.length < 2); return }
  if (container.value) {
    expanded.value = true
    const child = navigation.path[props.path.length]
    if (child !== undefined) {
      const index = array.value ? child : keys.value.indexOf(child)
      if (index >= 0) changePage(Math.floor(index / PREVIEW_PAGE_SIZE) + 1)
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
    <small v-if="active && selectionNote" class="object-selector">{{ selectionNote }}</small>
    <button v-if="count" type="button" class="object-selector" :aria-expanded="expanded"
      :aria-label="(expanded ? 'Collapse' : 'Expand') + ' ' + JSON.stringify(path)" @click="expanded = !expanded">{{ expanded ? '−' : '+' }}</button>
    <button v-if="canToggleChildren" type="button" class="object-selector children-toggle" :aria-pressed="childrenExpanded" :aria-label="(childrenExpanded?'Collapse':'Expand')+' children at '+expansionKey" :title="childrenToggleTitle" @click="toggleChildren"><svg class="children-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 2v12 M3 4h3 M3 8h3 M3 12h3" /><path :d="childrenExpanded ? 'M11 13V3 M8.5 5.5 11 3l2.5 2.5' : 'M11 3v10 M8.5 10.5 11 13l2.5-2.5'" /></svg></button>
    <span>{{ array ? '[' : '{' }}</span>
    <template v-if="expanded">
      <span v-if="expansionLimited" class="expansion-note" role="status">Some branches remain collapsed to keep the preview responsive. Expand them individually or use Find.</span>
      <PreviewPager :range="range" :label="array ? 'Items' : 'Properties'" @change="changePage" />
      <span v-for="([key, child], index) in entries" :key="key" class="json-entry">
        <span v-if="!array" class="token-key" :class="{ 'search-key': keyTarget(key) }" :data-search-key="keyTarget(key) ? 'true' : undefined">{{ JSON.stringify(key) }}<span class="punctuation">: </span></span>
        <span v-else class="item-index">{{ key }}: </span>
        <JsonNode :value="child" :path="[...path, key]" :selectors="selectors" :can-select="canSelect" :selection-note="selectionNote" :selected="selected" :navigation="navigation" :expansion="expansion" @page="emit('page',$event)" @toggle-children="emit('toggle-children',$event)" @select="$emit('select', $event)" />{{ range.start + index < count - 1 ? ',' : '' }}
      </span>
    </template>
    <span v-else class="item-index"> … {{ count.toLocaleString() }} {{ array ? 'items' : 'properties' }} </span>
    <span>{{ array ? ']' : '}' }}</span>
  </span>
</template>

<style scoped>
.children-icon { display:inline-block; vertical-align:middle; }
.children-toggle[aria-pressed="true"] { background:#355d49; border-color:#bcf2dc; }.children-toggle:focus-visible { outline:2px solid #bcf2dc; outline-offset:2px; }.expansion-note { display:block; font:.72rem/1.4 system-ui,sans-serif; color:#c2ded3; white-space:normal; max-width:40rem; margin:.3rem 0; }

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
