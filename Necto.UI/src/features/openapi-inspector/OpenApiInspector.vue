<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import InspectorNode from './InspectorNode.vue'
import { pointerFor } from './pointers.js'
import { MAX_QUERY_LENGTH, SEARCH_PAGE_SIZE, searchPayload, valueAtPath } from '../payload-search/search.js'

const dialog = ref(null)
const context = ref(null)
const scope = ref('operation')
const selected = ref([])
const feedback = ref('')
const operationPath = computed(() => {
  const { document, method, path } = context.value ?? {}
  const item = document?.paths?.[path]
  if (item && Object.hasOwn(item, method)) return ['paths', path, method]
  const reference = item?.$ref
  if (typeof reference !== 'string' || !reference.startsWith('#/')) return null
  try {
    return [...decodeURIComponent(reference.slice(2)).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~')), method]
  } catch { return null }
})
const scopePath = computed(() => scope.value === 'document' ? [] : operationPath.value)
const location = ref(null)
const viewPath = computed(() => location.value ?? scopePath.value)
const preview = computed(() => viewPath.value && valueAtPath(context.value?.document, viewPath.value))
const selectedPointer = computed(() => pointerFor(selected.value))
function select(path) {
  selected.value = path
  feedback.value = ''
}
function setScope(value) {
  scope.value = value
  location.value = null
  select(viewPath.value ?? [])
}
async function copy(pointer = false) {
  try {
    const value = pointer ? selectedPointer.value : JSON.stringify(valueAtPath(context.value.document, selected.value), null, 2)
    if (value === undefined) return
    await navigator.clipboard.writeText(value)
    feedback.value = pointer ? 'JSON Pointer copied.' : 'Fragment copied.'
  } catch { feedback.value = 'Clipboard unavailable for this fragment.' }
}
const query = ref('')
const searchScope = ref('fragment')
const results = ref(null)
const activeMatch = ref(-1)
const searching = ref(false)
const searchError = ref('')
const searchBase = computed(() => searchScope.value === 'document' ? [] : scopePath.value)
let searchRevision = 0
async function find(page = 1, knownTotal, destination) {
  const revision = ++searchRevision
  if (!context.value || !query.value.trim() || !searchBase.value) return
  searching.value = true
  const base = searchBase.value
  try {
    const result = await searchPayload(valueAtPath(context.value.document, base), {
      query: query.value.trim(), page, knownTotal, shouldCancel: () => revision !== searchRevision,
    })
    if (revision !== searchRevision) return
    results.value = result
    activeMatch.value = -1
    if (destination !== undefined) reveal(destination < 0 ? result.matches.length - 1 : 0)
  } catch {
    if (revision === searchRevision) searchError.value = 'Could not search this document.'
  } finally {
    if (revision === searchRevision) searching.value = false
  }
}
watch([query, searchScope, scope, context], (_, __, onCleanup) => {
  searchRevision++
  results.value = null
  activeMatch.value = -1
  searchError.value = ''
  searching.value = Boolean(query.value.trim() && searchBase.value)
  if (!searching.value) return
  const timer = setTimeout(() => find(), 160)
  onCleanup(() => { clearTimeout(timer); searchRevision++ })
})
function reveal(index) {
  const match = results.value?.matches[index]
  if (!match) return
  activeMatch.value = index
  const path = [...searchBase.value, ...match.path]
  location.value = path
  select(path)
}
const matchNumber = computed(() => results.value && activeMatch.value >= 0
  ? (results.value.page - 1) * SEARCH_PAGE_SIZE + activeMatch.value + 1 : 0)
function nextMatch(direction) {
  if (searching.value || !results.value?.total) return
  const index = activeMatch.value < 0 && direction < 0 ? 0 : activeMatch.value + direction
  if (index >= 0 && index < results.value.matches.length) reveal(index)
  else {
    const page = results.value.page + direction
    if (page >= 1 && page <= results.value.pages) void find(page, results.value.total, direction)
  }
}
let returnFocus
async function open(documentContext, trigger) {
  context.value = documentContext
  query.value = ''
  searchScope.value = 'fragment'
  setScope('operation')
  returnFocus = trigger
  await nextTick()
  if (!dialog.value.open) dialog.value.showModal()
}
function restoreFocus() {
  returnFocus?.focus()
  context.value = null
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="inspector-dialog" aria-label="OpenAPI Inspector" @close="restoreFocus">
    <template v-if="context">
      <header>
        <h2>OpenAPI Inspector</h2>
        <button class="secondary" type="button" aria-label="Close OpenAPI Inspector" autofocus
          @click="dialog.close()">×</button>
      </header>
      <div class="document-context">
        <strong>{{ context.document?.info?.title || 'OpenAPI document' }}</strong>
        <span v-if="context.document?.info?.version">API {{ context.document.info.version }}</span>
        <span v-if="context.document?.openapi">OpenAPI {{ context.document.openapi }}</span>
        <span>{{ context.source }}</span>
      </div>
      <div class="scope-controls">
        <button type="button" class="secondary" :aria-pressed="scope === 'operation'"
          @click="setScope('operation')">{{ context.method.toUpperCase() }} {{ context.path }}</button>
        <button type="button" class="secondary" :aria-pressed="scope === 'document'"
          @click="setScope('document')">Whole document</button>
      </div>
      <form class="inspector-search" @submit.prevent="nextMatch(1)">
        <input v-model="query" type="search" aria-label="Search OpenAPI" placeholder="Find keys or values"
          :maxlength="MAX_QUERY_LENGTH" @keydown.shift.enter.prevent="nextMatch(-1)">
        <select v-model="searchScope" aria-label="Inspector search scope">
          <option value="fragment">Current fragment</option>
          <option value="document">Whole document</option>
        </select>
        <button type="button" class="secondary" aria-label="Previous OpenAPI match"
          :disabled="searching || matchNumber <= 1" @click="nextMatch(-1)">↑</button>
        <button type="submit" class="secondary" aria-label="Next OpenAPI match"
          :disabled="searching || !results?.total || matchNumber >= results.total">↓</button>
        <small v-if="query.trim()" role="status">{{ searching ? 'Searching…' : searchError ||
          (results?.total ? (matchNumber ? matchNumber + ' of ' : '') + results.total + ' matches' : 'No matches') }}</small>
      </form>
      <button v-if="location" type="button" class="secondary back-to-scope"
        @click="setScope(scope)">Back to {{ scope }}</button>
      <template v-if="preview !== undefined && viewPath">
        <div class="fragment-actions">
          <code>{{ selectedPointer || 'Document root' }}</code>
          <button class="secondary" type="button" @click="copy()">Copy fragment</button>
          <button class="secondary" type="button" @click="copy(true)">Copy JSON Pointer</button>
          <small role="status">{{ feedback }}</small>
        </div>
        <ul class="inspector-tree">
          <InspectorNode :key="pointerFor(viewPath)" :value="preview" :path="viewPath"
            :label="viewPath.at(-1) ?? 'Document'" :selected="selectedPointer" initially-open @select="select" />
        </ul>
      </template>
      <p v-else role="status">This operation is unavailable in the selected OpenAPI document.</p>
    </template>
  </dialog>
</template>

<style scoped>
.inspector-dialog { width: min(58rem, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); color: var(--text, inherit); background: var(--surface); border: 1px solid var(--line); border-radius: .75rem; }
.inspector-dialog::backdrop { background: #15251c70; }
header, .document-context, .scope-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; }
header { justify-content: space-between; }
h2 { margin: 0; font-size: 1.1rem; }
.document-context { margin-block: .65rem; color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
.scope-controls { margin-bottom: .6rem; }
.scope-controls [aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
.inspector-search { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-bottom: .55rem; }
.inspector-search input { min-width: 0; flex: 1 1 12rem; }
.back-to-scope { margin-bottom: .5rem; }
.fragment-actions { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: .55rem; }
.fragment-actions code { overflow-wrap: anywhere; }
.inspector-tree { overflow: auto; max-height: 58dvh; margin: 0; padding: .6rem; background: var(--subtle); border-radius: .45rem; }
</style>
