<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import InspectorNode from './InspectorNode.vue'
import { findOperationPath, referenceTarget } from './references.js'
import { pointerFor } from './pointers.js'
import { MAX_QUERY_LENGTH, SEARCH_PAGE_SIZE, searchPayload, valueAtPath } from '../payload-search/search.js'

const dialog = ref(null)
const context = ref(null)
const scope = ref('operation')
const selected = ref([])
const feedback = ref('')
const operationPath = computed(() => context.value?.document
  ? findOperationPath(context.value, context.value.path, context.value.method)
  : null)
const scopePath = computed(() => scope.value === 'document' ? [] : operationPath.value)
const location = ref(null)
const referenceSource = ref(null)
const referenceHistory = ref([])
const referenceError = ref('')
const tree = ref(null)
const treeStates = new Map()
const treeState = computed(() => {
  const document = visibleSource.value?.document
  if (!treeStates.has(document)) treeStates.set(document, reactive(new Map()))
  return treeStates.get(document)
})
const visibleSource = computed(() => referenceSource.value ?? context.value)
const viewPath = computed(() => location.value ?? scopePath.value)
const preview = computed(() => viewPath.value && valueAtPath(visibleSource.value?.document, viewPath.value))
const selectedPointer = computed(() => pointerFor(selected.value))
function select(path) {
  selected.value = path
  feedback.value = ''
}
function setScope(value) {
  scope.value = value
  location.value = null
  referenceSource.value = null
  referenceHistory.value = []
  referenceError.value = ''
  select(viewPath.value ?? [])
}
async function copy(pointer = false) {
  try {
    const value = pointer ? selectedPointer.value : JSON.stringify(valueAtPath(visibleSource.value.document, selected.value), null, 2)
    if (value === undefined) return
    await navigator.clipboard.writeText(value)
    feedback.value = pointer ? 'JSON Pointer copied.' : 'Fragment copied.'
  } catch { feedback.value = 'Clipboard unavailable for this fragment.' }
}
function followReference(reference) {
  referenceError.value = ''
  const target = referenceTarget(visibleSource.value, reference, context.value.documents)
  if (!target) {
    referenceError.value = 'Reference target is unavailable in the loaded documents.'
    return
  }
  const current = { source: visibleSource.value, path: viewPath.value }
  if ([...referenceHistory.value, current].some(entry =>
    entry.source.document === target.source.document && pointerFor(entry.path) === pointerFor(target.path))) {
    referenceError.value = 'This reference leads back to a fragment already visited. Use Back to return.'
    return
  }
  referenceHistory.value.push({ ...current, selected: selected.value, scrollTop: tree.value?.scrollTop ?? 0 })
  referenceSource.value = target.source
  location.value = target.path
  select(target.path)
}
async function backReference() {
  const previous = referenceHistory.value.pop()
  if (!previous) return
  referenceError.value = ''
  referenceSource.value = previous.source
  location.value = previous.path
  select(previous.selected)
  await nextTick()
  if (tree.value) tree.value.scrollTop = previous.scrollTop
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
  referenceSource.value = null
  referenceHistory.value = []
  referenceError.value = ''
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
  treeStates.clear()
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
  treeStates.clear()
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
        <strong>{{ visibleSource.document?.info?.title || 'OpenAPI document' }}</strong>
        <span v-if="visibleSource.document?.info?.version">API {{ visibleSource.document.info.version }}</span>
        <span v-if="visibleSource.document?.openapi">OpenAPI {{ visibleSource.document.openapi }}</span>
        <span>{{ visibleSource.source }}</span>
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
      <button v-if="referenceHistory.length" type="button" class="secondary back-to-scope" @click="backReference">Back from reference</button>
      <p v-if="referenceError" class="error" role="status">{{ referenceError }}</p>
      <button v-if="location && !referenceHistory.length" type="button" class="secondary back-to-scope"
        @click="setScope(scope)">Back to {{ scope }}</button>
      <template v-if="preview !== undefined && viewPath">
        <div class="fragment-actions">
          <code>{{ selectedPointer || 'Document root' }}</code>
          <button class="secondary" type="button" @click="copy()">Copy fragment</button>
          <button class="secondary" type="button" @click="copy(true)">Copy JSON Pointer</button>
          <small role="status">{{ feedback }}</small>
        </div>
        <ul ref="tree" class="inspector-tree">
          <InspectorNode :key="(visibleSource.url ?? '') + pointerFor(viewPath)" :value="preview" :path="viewPath"
            :label="viewPath.at(-1) ?? 'Document'" :selected="selectedPointer" :tree-state="treeState" initially-open @select="select" @follow="followReference" />
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
