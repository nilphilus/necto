<script setup>
import { computed } from 'vue'
import { matchesPath } from '../related-endpoints/mappings.js'
const props = defineProps({ value: {}, path: { type: Array, required: true }, selectors: Array, selected: Array })
defineEmits(['select'])
const container = computed(() => props.value !== null && typeof props.value === 'object')
const array = computed(() => Array.isArray(props.value))
const entries = computed(() => container.value ? Object.entries(props.value) : [])
const selectable = computed(() => container.value && !array.value && props.selectors.some(path => matchesPath(path, props.path)))
const active = computed(() => props.selected && JSON.stringify(props.selected) === JSON.stringify(props.path))
const kind = computed(() => props.value === null ? 'null' : typeof props.value)
</script>

<template>
  <span v-if="!container" :class="'token-' + kind">{{ JSON.stringify(value) }}</span>
  <span v-else class="json-object" :class="{ selected: active }">
    <button v-if="selectable" type="button" class="object-selector" :aria-pressed="Boolean(active)"
      :aria-label="'Select object at ' + JSON.stringify(path)" @click="$emit('select', path)">{{ active ? 'Selected' : 'Select' }}</button>
    <span>{{ array ? '[' : '{' }}</span>
    <span v-for="([key, child], index) in entries" :key="key" class="json-entry">
      <span v-if="!array" class="token-key">{{ JSON.stringify(key) }}<span class="punctuation">: </span></span>
      <JsonNode :value="child" :path="[...path, array ? Number(key) : key]" :selectors="selectors" :selected="selected" @select="$emit('select', $event)" />{{ index < entries.length - 1 ? ',' : '' }}
    </span>
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
.object-selector { margin-right: .5rem; padding: .1rem .35rem; border: 1px solid #729b88; color: #bcf2dc; font: .72rem system-ui, sans-serif; }
.object-selector:hover { background: #355d49; }
</style>
