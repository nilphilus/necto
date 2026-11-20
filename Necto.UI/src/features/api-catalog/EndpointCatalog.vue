<script setup>
import DescriptionHelp from '../workbench/DescriptionHelp.vue'
import { computed, ref, watch } from 'vue'

const props = defineProps({
  groups: { type: Array, required: true },
  activeGroup: { type: String, required: true },
  activeOperation: { type: String, required: true },
  externalCount: { type: Number, default: 0 },
  showExternal: Boolean,
  externalLoading: Boolean,
})
const emit = defineEmits(['select-operation', 'toggle-external'])

const filter = ref('')
const showPaths = ref(false)
const hideDeprecated = ref(false)
const hasDeprecated = computed(() => props.groups.some(group => group.operations.some(operation => operation.deprecated)))
const expanded = ref(new Set())
const collapsedMatches = ref(new Set())
const query = computed(() => filter.value.trim().toLowerCase())
const visibleGroups = computed(() => props.groups.map((group, index) => ({
  ...group,
  id: `catalog-group-${index}`,
  operations: group.operations.filter(operation =>
    (!hideDeprecated.value || !operation.deprecated) &&
    `${group.name} ${operation.method} ${operation.path} ${operation.name} ${operation.id ?? ''}`
      .toLowerCase().includes(query.value),
  ),
})).filter(group => group.operations.length))

watch(() => props.activeGroup, name => { if (name) expanded.value.add(name) }, { immediate: true })
watch(query, () => collapsedMatches.value.clear())

function isExpanded(name) {
  return query.value ? !collapsedMatches.value.has(name) : expanded.value.has(name)
}

function toggleGroup(name) {
  const open = isExpanded(name)
  if (query.value) {
    if (open) collapsedMatches.value.add(name)
    else collapsedMatches.value.delete(name)
  } else if (open) {
    expanded.value.delete(name)
  } else {
    expanded.value.add(name)
  }
}

</script>

<template>
  <nav class="catalog" aria-label="API endpoints">
    <header class="catalog-title-row">
      <h2 class="catalog-title">Endpoints</h2>
      <div class="catalog-options">
        <label class="option-toggle" title="Show paths instead of names">
          <input v-model="showPaths" type="checkbox" role="switch" aria-label="Show paths instead of names">
          <span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m7 5-5 5 5 5m6-10 5 5-5 5m-2-12-2 14" /></svg></span>
        </label>
        <label v-if="hasDeprecated" class="option-toggle" title="Hide deprecated">
          <input v-model="hideDeprecated" type="checkbox" role="switch" aria-label="Hide deprecated">
          <span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2 1.5 17h17L10 2Zm0 5v4m0 2v1M3 3l14 14" /></svg></span>
        </label>
      </div>
      <slot name="collapse" />
    </header>
    <div class="catalog-actions"><slot name="actions" /></div>
    <slot name="documents" />
    <div v-if="externalCount" class="api-visibility" aria-label="API visibility">
      <label><input type="checkbox" role="switch" :checked="showExternal" @change="$emit('toggle-external', $event.target.checked)"> External APIs ({{ externalCount }})</label>
      <small>{{ externalLoading ? 'Loading external services…' : showExternal ? 'Local + external services' : 'Local service only' }}</small>
    </div>
    <input v-model="filter" type="search" aria-label="Find an endpoint" placeholder="Find an endpoint">

    <p v-if="!visibleGroups.length" role="status">
      {{ groups.length ? 'No matching endpoints.' : 'No endpoints in this document.' }}
    </p>

    <section v-for="group in visibleGroups" :key="group.name" class="catalog-group">
      <h3>
        <button
          type="button"
          class="group-toggle"
          :aria-label="`${isExpanded(group.name) ? 'Collapse' : 'Expand'} ${group.name}`"
          :aria-expanded="isExpanded(group.name)"
          :aria-controls="group.id"
          @click="toggleGroup(group.name)"
        >
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <button type="button" class="group-label" :class="{ selected: activeGroup === group.name }" @click="toggleGroup(group.name)" :aria-expanded="isExpanded(group.name)" :aria-controls="group.id">
          <span>{{ group.name }}</span>
          <small>{{ group.operations.length }}</small>
        </button>
        <DescriptionHelp :label="'About group ' + group.name" :description="group.description" />
      </h3>
      <ul v-show="isExpanded(group.name)" :id="group.id">
        <li v-for="operation in group.operations" :key="operation.key">
          <button
            type="button"
            class="catalog-operation"
            :class="{ deprecated: operation.deprecated }"
            :aria-current="activeGroup === group.name && activeOperation === operation.key ? 'page' : undefined"
            @click="$emit('select-operation', operation, group.name)"
          >
            <span class="method" :data-method="operation.method">{{ operation.method }}</span>
            <code v-if="showPaths">{{ operation.path }}</code>
            <strong v-else>{{ operation.name }}</strong>
            <small v-if="operation.deprecated" class="deprecated-label">Deprecated</small>
          </button>
        </li>
      </ul>
    </section>
  </nav>
</template>

<style scoped>
.catalog-title-row { display: flex; gap: .35rem; align-items: center; margin-bottom: .25rem; }
.catalog-options { display: flex; gap: .2rem; margin-left: auto; }
.option-toggle { position: relative; display: inline-flex; cursor: pointer; }
.option-toggle input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.option-toggle span { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border: 1px solid var(--line); border-radius: .35rem; color: var(--muted); }
.option-toggle svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.option-toggle:hover span, .option-toggle input:checked + span { color: var(--accent); background: var(--accent-soft); }
.option-toggle input:checked + span { border-color: var(--accent); }
.option-toggle input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
.catalog-actions { display: flex; align-items: center; justify-content: flex-end; gap: .35rem; }
.catalog-actions:empty { display: none; }

.catalog {
  min-width: 0;
  overflow: auto;
  padding: 1rem;
  border-right: 1px solid var(--line);
}
.api-visibility { padding: .6rem; margin-bottom: .75rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--accent-soft); font-size: .8rem; }
.api-visibility label { display: flex; align-items: center; gap: .35rem; }
.api-visibility small { display: block; color: var(--muted); margin-top: .25rem; }
.catalog-title { margin: 0; font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; }
.catalog input[type="search"] { width: 100%; margin-block: .4rem; }
.catalog-group + .catalog-group { margin-top: .25rem; }
.catalog-group h3 { display: flex; align-items: stretch; margin: 0; font-size: .875rem; }
.group-toggle { display: grid; flex: 0 0 1.75rem; place-items: center; padding: 0; }
.group-label { display: flex; flex: 1; align-items: center; gap: .65rem; min-width: 0; padding: .5rem; font-weight: 700; text-align: left; overflow-wrap: anywhere; }
.group-label.selected { color: var(--accent); }
.group-label small { margin-left: auto; color: var(--muted); font-weight: 500; }
.chevron { width: .375rem; height: .375rem; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg); }
[aria-expanded="true"] .chevron { transform: rotate(45deg); }
.catalog ul { list-style: none; padding: 0 0 0 .75rem; margin: .125rem 0 .5rem; }
.catalog-operation {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  align-items: center;
  gap: .5rem;
  width: 100%;
  padding: .4375rem .5rem;
  text-align: left;
  font-size: .8rem;
  overflow-wrap: anywhere;
}
.catalog-operation .method { justify-self: start; font-size: .625rem; }
.catalog-operation.deprecated { color: var(--muted); }
.catalog-operation.deprecated .method { filter: grayscale(1); }
.deprecated-label { grid-column: 2; color: var(--muted); font-size: .68rem; margin-block-start: -.35rem; }
.catalog-operation strong { font-weight: 550; }
.catalog-operation[aria-current] { background: var(--accent-soft); box-shadow: inset 2px 0 var(--accent); }
@media (max-width: 760px) {
  .catalog { max-height: 18rem; border-right: 0; border-bottom: 1px solid var(--line); }
}
</style>
