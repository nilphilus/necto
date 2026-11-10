<script setup>
defineProps({ group: { type: Object, required: true } })

function anchorFor(operation) {
  return 'endpoint-' + encodeURIComponent(operation.key)
}

defineExpose({ anchorFor })
</script>

<template>
  <section class="endpoint-group" aria-labelledby="group-title">
    <header class="group-header">
      <h2 id="group-title" tabindex="-1">{{ group.name }}</h2>
      <p class="muted">{{ group.operations.length }} {{ group.operations.length === 1 ? 'endpoint' : 'endpoints' }}</p>
    </header>
    <article v-for="operation in group.operations" :key="operation.key" class="endpoint">
      <h3 :id="anchorFor(operation)" tabindex="-1">
        <span class="method" :data-method="operation.method">{{ operation.method }}</span>
        {{ operation.name }}
      </h3>
      <code class="endpoint-path">{{ operation.path }}</code>
      <p v-if="operation.description" class="muted">{{ operation.description }}</p>
      <slot :operation="operation" />
    </article>
  </section>
</template>

<style scoped>
.endpoint-group { min-width: 0; }
.group-header { margin: 0 0 1.15rem; }
.group-header h2 { margin: 0; font-size: 1.65rem; }
.group-header p { margin: .2rem 0 0; }
.endpoint {
  padding: clamp(.85rem, 2vw, 1.35rem);
  margin-bottom: 1rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .9rem;
}
.endpoint h3 { display: flex; align-items: center; gap: .55rem; margin: 0 0 .35rem; scroll-margin-top: 1.5rem; }
.endpoint-path { display: block; overflow-wrap: anywhere; }
.endpoint p { margin: .45rem 0 0; }
.endpoint :deep(.runner) { margin-top: 1rem; }
</style>
