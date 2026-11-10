<script setup>
defineProps({
  group: { type: Object, required: true },
  activeOperation: { type: String, required: true },
})
defineEmits(['select-operation'])

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
    <ul class="group-index" aria-label="Endpoints in this group">
      <li v-for="operation in group.operations" :key="operation.key">
        <button class="endpoint-link" type="button" @click="$emit('select-operation', operation)">
          <span class="method" :data-method="operation.method">{{ operation.method }}</span>
          <span>{{ operation.name }}</span>
        </button>
      </li>
    </ul>
    <article
      v-for="operation in group.operations"
      :key="operation.key"
      class="endpoint"
      :class="{ active: operation.key === activeOperation }"
    >
      <header class="endpoint-header">
        <h3 :id="anchorFor(operation)" tabindex="-1">
          <span class="method" :data-method="operation.method">{{ operation.method }}</span>
          {{ operation.name }}
        </h3>
        <code class="endpoint-path">{{ operation.path }}</code>
        <p v-if="operation.description" class="muted">{{ operation.description }}</p>
      </header>
      <slot :operation="operation" />
    </article>
  </section>
</template>

<style scoped>
.endpoint-group { min-width: 0; }
.group-header { margin-bottom: 1rem; overflow-wrap: anywhere; }
.group-header h2 { margin: 0; font-size: 1.75rem; letter-spacing: -.035em; }
.group-header p { margin: .25rem 0 0; font-size: .85rem; }
.group-index {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
  gap: .25rem;
  margin: 0 0 1.5rem;
  padding: .5rem;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .5rem;
}
.endpoint-link { display: flex; align-items: baseline; gap: .5rem; width: 100%; padding: .5rem; text-align: left; font-size: .85rem; overflow-wrap: anywhere; }
.endpoint {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .65rem;
}
.endpoint + .endpoint { margin-top: 1rem; }
.endpoint.active { border-color: #a7c6b9; }
.endpoint-header { padding: 1rem; overflow-wrap: anywhere; }
.endpoint h3 { margin: 0 0 .25rem; font-size: 1.05rem; }
.endpoint h3 .method { margin-right: .25rem; vertical-align: .1em; }
.endpoint-path { color: var(--muted); overflow-wrap: anywhere; font-size: .82rem; }
.endpoint-header p { margin: .5rem 0 0; font-size: .875rem; }
.endpoint :deep(.runner) { border-width: 1px 0 0; border-radius: 0 0 .65rem .65rem; }
</style>
