<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  groups: { type: Array, required: true },
  activeGroup: { type: String, required: true },
  activeOperation: { type: String, required: true },
})
defineEmits(['select-group', 'select-operation'])

const filter = ref('')
const showPaths = ref(false)
const visibleGroups = computed(() => {
  const query = filter.value.trim().toLowerCase()
  return props.groups.map(group => ({
    ...group,
    operations: group.operations.filter(operation =>
      `${group.name} ${operation.method} ${operation.path} ${operation.name} ${operation.id ?? ''}`
        .toLowerCase().includes(query),
    ),
  })).filter(group => group.operations.length)
})
</script>

<template>
  <nav class="catalog" aria-label="API endpoints">
    <label for="operation-filter">Find an endpoint</label>
    <input id="operation-filter" v-model="filter" type="search" placeholder="Method, path, or name">
    <label class="mode">
      <input v-model="showPaths" type="checkbox" role="switch">
      Show paths instead of names
    </label>

    <p v-if="!visibleGroups.length" role="status">
      {{ groups.length ? 'No matching endpoints.' : 'No endpoints in this document.' }}
    </p>

    <section v-for="group in visibleGroups" :key="group.name" class="catalog-group">
      <h2>
        <button type="button" class="group-label" @click="$emit('select-group', group.name)">
          {{ group.name }}
        </button>
      </h2>
      <ul>
        <li v-for="operation in group.operations" :key="operation.key">
          <button
            type="button"
            class="catalog-operation"
            :aria-current="activeGroup === group.name && activeOperation === operation.key ? 'location' : undefined"
            @click="$emit('select-operation', operation, group.name)"
          >
            <span class="method" :data-method="operation.method">{{ operation.method }}</span>
            <code v-if="showPaths">{{ operation.path }}</code>
            <strong v-else>{{ operation.name }}</strong>
            <small v-if="operation.description">{{ operation.description }}</small>
          </button>
        </li>
      </ul>
    </section>
  </nav>
</template>

<style scoped>
.catalog {
  align-self: start;
  position: sticky;
  top: 1.5rem;
  max-height: calc(100dvh - 3rem);
  overflow: auto;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .9rem;
}
.catalog > label:first-child { display: block; font-weight: 650; margin-bottom: .35rem; }
.catalog input[type="search"] { width: 100%; }
.mode { display: flex; align-items: center; gap: .45rem; margin: .65rem 0 1.35rem; font-size: .85rem; }
.catalog-group + .catalog-group { margin-top: 1.15rem; }
.catalog-group h2 { margin: 0 0 .25rem; font-size: .85rem; }
.group-label { padding: .2rem .45rem; color: var(--muted); font-weight: 750; }
.catalog ul { list-style: none; padding: 0; margin: 0; }
.catalog-operation {
  display: flex;
  align-items: center;
  gap: .4rem;
  flex-wrap: wrap;
  width: 100%;
  padding: .5rem .45rem;
  text-align: left;
  font-size: .875rem;
  overflow-wrap: anywhere;
}
.catalog-operation small { flex-basis: 100%; color: var(--muted); }
.catalog-operation[aria-current] { background: var(--accent-soft); }
@media (max-width: 760px) {
  .catalog { position: static; max-height: 20rem; }
}
</style>
