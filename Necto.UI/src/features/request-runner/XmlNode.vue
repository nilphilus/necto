<script setup>
import { computed, ref } from 'vue'
import PreviewPager from './PreviewPager.vue'
import XmlText from './XmlText.vue'
import { pageRange, PREVIEW_PAGE_SIZE } from './preview.js'
const props = defineProps({ nodes: Array, index: Number, depth: { type: Number, default: 0 } })
defineEmits(['inspect'])
const node = computed(() => props.nodes[props.index])
const inlineText = computed(() => node.value.kind === 'element' && node.value.children.length === 1 &&
  props.nodes[node.value.children[0]].kind === 'text' && props.nodes[node.value.children[0]].value.length <= 160 &&
  !props.nodes[node.value.children[0]].value.includes('\n'))
const expanded = ref(props.depth < 2)
const page = ref(1), attributePage = ref(1), attributesOpen = ref(false)
const range = computed(() => pageRange(node.value.children?.length ?? 0, page.value, PREVIEW_PAGE_SIZE))
const children = computed(() => node.value.children?.slice(range.value.start, range.value.end) ?? [])
const attributeRange = computed(() => pageRange(node.value.attributes?.length ?? 0, attributePage.value, PREVIEW_PAGE_SIZE))
const attributes = computed(() => node.value.attributes?.slice(attributeRange.value.start, attributeRange.value.end) ?? [])
</script>
<template>
  <span v-if="node.kind === 'element' || node.kind === 'document'" class="xml-node">
    <template v-if="node.kind === 'element'">
      <button v-if="node.children.length && !inlineText" type="button" class="xml-toggle" :aria-label="(expanded ? 'Collapse ' : 'Expand ') + node.name.slice(0, 200)" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '−' : '+' }}</button>
      <span class="xml-punctuation">&lt;</span><span class="xml-name">{{ node.name.slice(0, 200) }}</span>
      <template v-if="node.attributes.length <= 3"><template v-for="(attribute, index) in attributes" :key="index">{{ ' ' }}<span class="xml-attribute">{{ attribute.name.slice(0, 200) }}</span><span class="xml-punctuation">="</span><span class="xml-value"><XmlText :value="attribute.value" attribute /></span><span class="xml-punctuation">"</span></template></template>
      <button v-else type="button" class="xml-toggle" :aria-expanded="attributesOpen" @click="attributesOpen = !attributesOpen">{{ node.attributes.length }} attributes</button>
      <span class="xml-punctuation">{{ node.children.length ? '>' : ' />' }}</span>
      <span v-if="node.attributes.length > 3 && attributesOpen" class="xml-attributes">
        <PreviewPager :range="attributeRange" label="Attributes" @change="attributePage = $event" />
        <span v-for="(attribute, index) in attributes" :key="index" class="xml-attribute-row"><span class="xml-attribute">{{ attribute.name.slice(0, 200) }}</span>="<span class="xml-value"><XmlText :value="attribute.value" attribute /></span>"</span>
      </span>
    </template>
    <XmlText v-if="inlineText" :value="nodes[node.children[0]].value" escape />
    <template v-else-if="expanded || node.kind === 'document'">
      <template v-if="depth < 24">
        <PreviewPager :range="range" label="XML nodes" @change="page = $event" />
        <span v-for="child in children" :key="child" class="xml-child"><XmlNode :nodes="nodes" :index="child" :depth="depth + 1" @inspect="$emit('inspect', $event)" /></span>
      </template>
      <button v-else type="button" class="xml-toggle" @click="$emit('inspect', index)">Inspect subtree</button>
    </template>
    <span v-else-if="node.children.length" class="xml-summary"> … {{ node.children.length.toLocaleString() }} nodes </span>
    <template v-if="node.kind === 'element' && node.children.length"><span class="xml-punctuation">&lt;/</span><span class="xml-name">{{ node.name.slice(0, 200) }}</span><span class="xml-punctuation">&gt;</span></template>
  </span>
  <span v-else :class="'xml-' + node.kind"><span v-if="node.kind === 'comment'">&lt;!--</span><span v-if="node.kind === 'cdata'">&lt;![CDATA[</span><span v-if="node.kind === 'instruction'">&lt;?</span><XmlText :value="node.value" :escape="node.kind === 'text'" /><span v-if="node.kind === 'comment'">--&gt;</span><span v-if="node.kind === 'cdata'">]]&gt;</span><span v-if="node.kind === 'instruction'">?&gt;</span></span>
</template>
<style scoped>
.xml-child, .xml-attribute-row { display: block; padding-left: 1.25rem; }
.xml-node { overflow-wrap: anywhere; white-space: normal; }
.xml-name { color: #9bd9fa; }.xml-attribute { color: #ffd09a; }.xml-value, .xml-cdata { color: #c1e6a0; }
.xml-comment, .xml-summary { color: #a0b5ac; }.xml-instruction { color: #d8b8ff; }.xml-punctuation { color: #e7f3eb; }
.xml-toggle { margin-right: .35rem; padding: .1rem .35rem; border: 1px solid #729b88; color: #bcf2dc; font: .72rem system-ui, sans-serif; }
.xml-attributes { display: block; }
</style>
