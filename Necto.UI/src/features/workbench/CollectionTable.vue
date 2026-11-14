<script setup>
import { tablePreferenceKey, rememberColumns } from './previewPreferences.js'
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue';
import { tableColumns, tableCell, discoverTableColumns, contractTableColumns } from './collectionTable.js';
import { pageRange, PREVIEW_PAGE_SIZE } from '../request-runner/preview.js';
import PreviewPager from '../request-runner/PreviewPager.vue';
import { matchesPath } from '../related-endpoints/mappings.js';
const props = defineProps({
  value: Array,
  presentation: Object,
  path: Array,
  selectors: Array,
  selected: Array,
  operation: Object,
  status: [String, Number],
  contentType: String
});
const emit = defineEmits(['select', 'inspect']);
const rowMenu = ref(null), rowMenuElement = ref(null)
let menuTrigger
async function openRowMenu(row, event) {
  menuTrigger = event.currentTarget
  const rect = menuTrigger.getBoundingClientRect()
  rowMenu.value = { row, top: Math.max(8, Math.min(rect.bottom + 4, innerHeight - 130)), left: Math.max(8, Math.min(rect.right - 180, innerWidth - 190)) }
  await nextTick(); rowMenuElement.value?.querySelector('button')?.focus()
}
function closeRowMenu(focus = true) { rowMenu.value = null; if (focus && menuTrigger?.isConnected) menuTrigger.focus() }
function chooseRow(action) {
  const row = rowMenu.value.row
  closeRowMenu(action === 'select')
  emit(action, row.path)
}
function outsideMenu(event) { if (rowMenu.value && !rowMenuElement.value?.contains(event.target) && event.target !== menuTrigger) closeRowMenu(false) }
function resizeMenu() { closeRowMenu(false) }
function menuKeys(event) {
  if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...rowMenuElement.value.querySelectorAll('button')], index = buttons.indexOf(document.activeElement)
  buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
}
onMounted(() => { document.addEventListener('pointerdown', outsideMenu); window.addEventListener('resize', resizeMenu) })
onScopeDispose(() => { document.removeEventListener('pointerdown', outsideMenu); window.removeEventListener('resize', resizeMenu) })
watch([() => props.value, () => props.path], () => closeRowMenu(false))
const page = ref(1),
  selectedColumns = ref([]);
const preferenceKey = computed(() => tablePreferenceKey(props.operation, props.path, props.value))
const columns = ref([]), cursor = ref(25), discovering = ref(false)
let discoveryId = 0
function mergeColumns(names) { columns.value = [...new Set([...columns.value, ...names])].slice(0, 100) }
watch(page, () => mergeColumns(discoverTableColumns(props.value, range.value.start)))
async function discover() {
  const id = ++discoveryId
  discovering.value = true
  await new Promise(resolve => setTimeout(resolve, 0))
  if (id !== discoveryId) return
  mergeColumns(discoverTableColumns(props.value, cursor.value, 250))
  cursor.value = Math.min(props.value.length, cursor.value + 250)
  discovering.value = false
}
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
    discoveryId++; discovering.value = false
    page.value = 1
    columns.value = []
    mergeColumns(props.path?.length ? [] : contractTableColumns(props.operation, props.status, props.contentType))
    mergeColumns(tableColumns(props.value))
    cursor.value = Math.min(25, props.value.length)
    const saved = props.presentation?.tables?.[preferenceKey.value]
    if (saved) mergeColumns(saved)
    selectedColumns.value = saved ? [...saved] : columns.value.slice(0, 6);
  },
  { immediate: true }
);
watch(selectedColumns, names => rememberColumns(props.presentation, preferenceKey.value, names), { deep: true })
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
        >Fields from the contract, first 25 rows and visited pages. Nested fields remain in Inspect. Up to 100 fields.
      </small><button v-if="cursor < value.length && columns.length < 100" type="button" :disabled="discovering" @click="discover">{{ discovering ? 'Discovering…' : 'Discover more fields' }}</button><small role="status">Discovery scans up to 250 rows per click; checked through row {{ cursor }}. {{ columns.length }} fields available.</small
      >
    </details>
    <PreviewPager :range="range" label="Rows" @change="page = $event" />
    <div
      class="table-scroll" @scroll="closeRowMenu(false)"
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
            <td class="row-actions">
              <button type="button" class="mobile-row-trigger" :aria-label="`Actions for row ${row.index + 1}`" aria-haspopup="menu" :aria-expanded="rowMenu?.row.index === row.index" @click="openRowMenu(row, $event)">⋯</button>
              <span class="desktop-row-actions"><button
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
              </button></span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Teleport to="body"><div v-if="rowMenu" ref="rowMenuElement" class="row-action-menu" role="menu" :aria-label="`Actions for row ${rowMenu.row.index + 1}`" :style="{top:rowMenu.top+'px',left:rowMenu.left+'px'}" @keydown.esc.stop.prevent="closeRowMenu()" @keydown="menuKeys" @keydown.tab="closeRowMenu(false)">
      <button v-if="selectable(rowMenu.row.path)" type="button" role="menuitem" :aria-label="`Select row ${rowMenu.row.index + 1}`" @click="chooseRow('select')">{{ active(rowMenu.row.path) ? 'Selected object' : 'Select object' }}</button>
      <button type="button" role="menuitem" :aria-label="`Inspect row ${rowMenu.row.index + 1}`" @click="chooseRow('inspect')">Inspect row</button>
    </div></Teleport>
  </div>
</template>
<style scoped>
.mobile-row-trigger { display:none; }
.mobile-row-trigger:hover, .mobile-row-trigger:focus-visible, .mobile-row-trigger[aria-expanded='true'] { background:#315947; color:#e7f3eb; }
.row-action-menu { position:fixed; z-index:50; width:180px; padding:.35rem; display:grid; gap:.25rem; border:1px solid var(--line); border-radius:.4rem; background:var(--surface); color:var(--text); box-shadow:0 6px 20px #0003; }
.row-action-menu button { text-align:left; min-height:44px; padding:.45rem .6rem; color:inherit; border-color:var(--line); }
@media(max-width:720px) {
  .desktop-row-actions { display:none; }
  .mobile-row-trigger { display:inline-block; min-width:44px; min-height:44px; font-size:1.1rem; padding:0; margin:0; }
  th:last-child, td:last-child { position:sticky; right:0; background:#254737; box-shadow:-2px 0 3px #0003; white-space:nowrap; }
  th:last-child { z-index:2; }
  tr.selected td:last-child { background:#315947; }
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
