<script setup>
defineProps({
  documents: { type: Array, required: true },
  selected: String,
  disabled: Boolean,
  error: String,
})
const emit = defineEmits(['select'])

function select(event, active) {
  const url = event.target.value
  event.target.value = active ?? ''
  if (url) emit('select', url)
}
</script>

<template>
  <div v-if="documents.length > 1" class="document-picker">
    <label>
      <span>OpenAPI document</span>
      <select :value="selected ?? ''" :disabled="disabled" @change="select($event, selected)">
        <option v-if="!selected" value="" disabled>Choose server document</option>
        <option v-for="item in documents" :key="item.url" :value="item.url">{{ item.name }}</option>
      </select>
    </label>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.document-picker { margin-block: .4rem; min-width: 0; }
.document-picker label { display: grid; gap: .2rem; font-size: .8rem; }
.document-picker select { min-width: 0; width: 100%; }
.document-picker p { margin: .3rem 0 0; font-size: .75rem; color: var(--danger, #a12121); overflow-wrap: anywhere; }
</style>
