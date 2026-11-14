<script setup>
import { computed, ref, watch } from 'vue';
import { tableColumns, tableCell } from './collectionTable.js';
import { pageRange, PREVIEW_PAGE_SIZE } from '../request-runner/preview.js';
import PreviewPager from '../request-runner/PreviewPager.vue';
import { matchesPath } from '../related-endpoints/mappings.js';
const props = defineProps({
  value: Array,
  path: Array,
  selectors: Array,
  selected: Array
});
defineEmits(['select', 'inspect']);
const page = ref(1),
  selectedColumns = ref([]);
const columns = computed(() => tableColumns(props.value));
const visibleColumns = computed(() =>
  columns.value.filter((name) => selectedColumns.value.includes(name))
);
const range = computed(() =>
  pageRange(props.value.length, page.value, PREVIEW_PAGE_SIZE)
);
const rows = computed(() =>
  props.value
    .slice(range.value.start, range.value.end)
    .map((value, index) => ({
      value,
      path: [...props.path, range.value.start + index],
      index: range.value.start + index
    }))
);
watch(
  [() => props.value, () => props.path],
  () => {
    page.value = 1;
    selectedColumns.value = columns.value.slice(0, 6);
  },
  { immediate: true }
);
const selectable = (path) =>
  props.selectors.some((template) => matchesPath(template, path));
const active = (path) =>
  JSON.stringify(path) === JSON.stringify(props.selected);
</script>
<template>
  <div class="collection-table">
    <details>
      <summary>Columns ({{ visibleColumns.length }})</summary>
      <label v-for="name in columns" :key="name"
        ><input v-model="selectedColumns" type="checkbox" :value="name" />
        {{ name }}</label
      ><small
        >Columns sampled from the first 25 rows; nested fields remain in
        Inspect.</small
      >
    </details>
    <PreviewPager :range="range" label="Rows" @change="page = $event" />
    <div
      class="table-scroll"
      tabindex="0"
      aria-label="Collection response table"
    >
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th v-for="name in visibleColumns" :key="name">{{ name }}</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.index"
            :class="{ selected: active(row.path) }"
          >
            <th>{{ row.index + 1 }}</th>
            <td v-for="name in visibleColumns" :key="name">
              {{ tableCell(row.value?.[name]) }}
            </td>
            <td>
              <button
                v-if="selectable(row.path)"
                type="button"
                :aria-pressed="active(row.path)"
                :aria-label="`Select row ${row.index + 1}`"
                @click="$emit('select', row.path)"
              >
                {{ active(row.path) ? 'Selected' : 'Select' }}</button
              ><button
                type="button"
                :aria-label="`Inspect row ${row.index + 1}`"
                @click="$emit('inspect', row.path)"
              >
                Inspect
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<style scoped>
@media(max-width:720px) {
  th:last-child, td:last-child { position:sticky; right:0; background:#254737; box-shadow:-2px 0 3px #0003; white-space:nowrap; }
  th:last-child { z-index:2; }
  tr.selected td:last-child { background:#315947; }
  td:last-child button { min-height:2.5rem; padding:.35rem .45rem; }
}

.collection-table {
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  padding: 0.6rem;
  background: #182420;
  color: #e7f3eb;
  font-size: 0.8rem;
}
.collection-table details {
  margin-bottom: 0.5rem;
}
.collection-table summary {
  cursor: pointer;
}
.collection-table label {
  display: inline-flex;
  gap: 0.25rem;
  margin: 0.4rem;
}
.collection-table small {
  display: block;
  color: #bcd4c7;
}
.table-scroll {
  overflow: auto;
  max-height: var(--preview-height, 32rem);
}
table {
  border-collapse: collapse;
  width: 100%;
  white-space: nowrap;
}
th,
td {
  padding: 0.4rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid #496555;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
thead th {
  position: sticky;
  top: 0;
  background: #254737;
  z-index: 1;
}
tr.selected {
  background: #315947;
}
button {
  font-size: 0.75rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid #729b88;
  color: inherit;
  margin-right: 0.3rem;
}
</style>
