<script setup>
import { useId } from 'vue'
defineProps({ range: Object, label: { type: String, default: 'Items' } })
defineEmits(['change'])
const id = useId()
</script>
<template>
  <span v-if="range.pages > 1" class="preview-pager" role="group" :aria-label="label + ' pages'">
    <span>{{ label }} {{ range.start + 1 }}–{{ range.end }} / {{ range.total.toLocaleString() }}</span>
    <button type="button" :disabled="range.page === 1" aria-label="Previous page" @click="$emit('change', range.page - 1)">‹</button>
    <label :for="id">Page</label>
    <input :id="id" type="number" :value="range.page" min="1" :max="range.pages" @change="$emit('change', $event.target.value)">
    <span>/ {{ range.pages.toLocaleString() }}</span>
    <button type="button" :disabled="range.page === range.pages" aria-label="Next page" @click="$emit('change', range.page + 1)">›</button>
  </span>
</template>
<style scoped>
.preview-pager { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .4rem; padding: .35rem 0; font: .75rem system-ui, sans-serif; color: #c2ded3; white-space: normal; }
.preview-pager button { border: 1px solid #729b88; padding: .15rem .45rem; color: #e7f3eb; }
.preview-pager button:hover { background: #355d49; }
.preview-pager input { width: 6rem; padding: .2rem .3rem; font: inherit; }
</style>
