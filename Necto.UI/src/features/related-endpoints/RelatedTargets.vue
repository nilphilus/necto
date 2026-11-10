<script setup>
defineProps({ targets: { type: Array, required: true } })
defineEmits(['navigate'])
</script>

<template>
  <section v-if="targets.length" class="related-targets" aria-label="Related endpoints">
    <h4>Related endpoints</h4>
    <ul>
      <li v-for="target in targets" :key="target.key">
        <button type="button" class="secondary" @click="$emit('navigate', target)">
          <span class="method" :data-method="target.method">{{ target.method }}</span>
          {{ target.name }} <span aria-hidden="true">→</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.related-targets { margin-top: 1.25rem; }
.related-targets h4 { margin: 0 0 .5rem; }
.related-targets ul { display: flex; flex-wrap: wrap; gap: .45rem; list-style: none; padding: 0; margin: 0; }
</style>
