<script setup>
import { computed, ref, watch } from 'vue'
import PreviewPager from './PreviewPager.vue'
import { pageRange, STRING_PAGE_SIZE } from './preview.js'
const props = defineProps({ value: { type: String, required: true }, escape: Boolean, attribute: Boolean })
const page = ref(1)
const range = computed(() => pageRange(props.value.length, page.value, STRING_PAGE_SIZE))
const visible = computed(() => {
  const value = props.value.slice(range.value.start, range.value.end)
  if (!props.escape && !props.attribute) return value
  const encoded = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return props.attribute ? encoded.replaceAll('"', '&quot;') : encoded
})
watch(() => props.value, () => { page.value = 1 })
</script>
<template><span class="xml-text">{{ visible }}</span><PreviewPager :range="range" label="XML characters" @change="page = $event" /></template>
<style scoped>.xml-text { white-space: pre-wrap; overflow-wrap: anywhere; }</style>
