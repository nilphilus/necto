<script setup>
import RelatedTarget from './RelatedTarget.vue'
defineProps({ targets: { type: Array, required: true }, sourcesFor: Function, canSend: { type: Function, required: true } })
defineEmits(['follow', 'edit-preset', 'search-response', 'open-source'])
</script>

<template>
  <section v-if="targets.length" class="related-targets" aria-label="Continue from this response">
    <ul>
      <RelatedTarget v-for="target in targets" :key="target.operation.key" :target="target" :can-send="canSend" :sources-for="sourcesFor" @open-source="$emit('open-source', $event)"
        @search-response="$emit('search-response', $event)" @follow="(operation, choices, send) => $emit('follow', operation, choices, send)" @edit-preset="$emit('edit-preset', $event)" />
    </ul>
  </section>
</template>

<style scoped>
.related-targets { padding: .75rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--surface); }
h4 { margin: 0 0 .45rem; color: var(--muted); font-size: .72rem; letter-spacing: .05em; text-transform: uppercase; }
ul { list-style: none; padding: 0; margin: 0; }
</style>
