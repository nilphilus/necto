<script setup>
import { computed } from 'vue'
import { pointerFor } from './pointers.js'

const props = defineProps({ value: null, path: { type: Array, required: true }, label: String, selected: String, initiallyOpen: Boolean, treeState: Map })
const emit = defineEmits(['select', 'follow'])
const open = computed({
  get: () => props.treeState.get(pointer.value)?.open ?? props.initiallyOpen,
  set: value => props.treeState.set(pointer.value, { open: value, page: page.value }),
})
const page = computed({
  get: () => props.treeState.get(pointer.value)?.page ?? 0,
  set: value => props.treeState.set(pointer.value, { open: open.value, page: value }),
})
const pageSize = 40
const container = computed(() => props.value !== null && typeof props.value === 'object')
const keys = computed(() => container.value ? Object.keys(props.value) : [])
const shown = computed(() => keys.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
const pointer = computed(() => pointerFor(props.path))
const kind = computed(() => props.value === null ? 'null' : typeof props.value)
const scalar = computed(() => {
  const value = JSON.stringify(typeof props.value === 'string' && props.value.length > 500 ? props.value.slice(0, 500) + '…' : props.value)
  return props.value === undefined ? '' : value
})
</script>

<template>
  <li class="inspector-node">
    <div class="node-row" :class="{ selected: selected === pointer }">
      <button v-if="keys.length" type="button" class="secondary node-toggle" :aria-expanded="open"
        :aria-label="(open ? 'Collapse ' : 'Expand ') + label" @click="open = !open">{{ open ? '▾' : '▸' }}</button>
      <button type="button" class="node-value" :aria-pressed="selected === pointer" @click="emit('select', path)">
        <code class="key">{{ label }}</code>
        <code v-if="container" class="metadata">{{ Array.isArray(value) ? '[' + keys.length + ']' : '{' + keys.length + '}' }}</code>
        <code v-else :class="kind">{{ scalar }}</code>
      </button>
      <button v-if="path.at(-1) === '$ref' && typeof value === 'string'" type="button" class="secondary"
        @click="emit('follow', value)">Follow reference</button>
    </div>
    <ul v-if="open && shown.length">
      <InspectorNode v-for="key in shown" :key="key" :label="key" :path="[...path, key]"
        :value="value[key]" :selected="selected" :tree-state="treeState" @select="emit('select', $event)" @follow="emit('follow', $event)" />
    </ul>
    <div v-if="open && keys.length > pageSize" class="node-pages">
      <button class="secondary" type="button" :disabled="page === 0" @click="page--">Previous</button>
      <span>{{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, keys.length) }} of {{ keys.length }}</span>
      <button class="secondary" type="button" :disabled="(page + 1) * pageSize >= keys.length" @click="page++">Next</button>
    </div>
  </li>
</template>

<style scoped>
.inspector-node { list-style: none; min-width: 0; }
.node-row { display: flex; align-items: start; gap: .2rem; border-radius: .3rem; }
.node-row.selected { background: var(--accent-soft); }
.node-toggle { padding: .15rem .25rem; min-width: 1.6rem; }
.node-value { display: flex; flex-wrap: wrap; column-gap: .5rem; min-width: 0; padding: .22rem .35rem; color: inherit; text-align: left; }
code { overflow-wrap: anywhere; white-space: pre-wrap; }
.key { font-weight: 700; color: var(--accent); }
.string { color: light-dark(#17593d, #a3e5b9); }
.number { color: light-dark(#843e08, #ffbc86); }
.boolean, .null { color: light-dark(#66349b, #dcb3fb); }
.metadata { color: var(--muted); }
ul { margin: 0 0 0 .7rem; padding-left: .65rem; border-left: 1px solid var(--line); }
.node-pages { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; margin: .25rem 0 .25rem 1rem; font-size: .75rem; }
</style>
