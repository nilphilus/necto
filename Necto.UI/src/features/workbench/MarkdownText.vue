<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
const props = defineProps({ text: String })
const html = computed(() => DOMPurify.sanitize(marked.parse(props.text ?? ''), {
  USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'form', 'input', 'button', 'style', 'video', 'audio']
}))
</script>
<template><div class="markdown-text" v-html="html" /></template>
<style scoped>
.markdown-text { overflow-wrap:anywhere; font-size:.85rem; }
.markdown-text :deep(pre) { overflow:auto; max-height:40dvh; padding:.6rem; background:var(--subtle); }
.markdown-text :deep(table) { display:block; overflow:auto; }
.markdown-text :deep(p:first-child) { margin-top:0; }
.markdown-text :deep(p:last-child) { margin-bottom:0; }
</style>
