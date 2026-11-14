<script setup>
import { computed, nextTick, ref, toRef, watch } from 'vue'
import { usePayloadSearch } from './usePayloadSearch.js'
import { pathLabel, selectableOwner, SEARCH_PAGE_SIZE, MAX_QUERY_LENGTH } from './search.js'
import { pageRange } from '../request-runner/preview.js'
import PreviewPager from '../request-runner/PreviewPager.vue'
const props = defineProps({ result: Object, selectors: Array })
const emit = defineEmits(['reveal', 'select'])
const finder = usePayloadSearch(toRef(props, 'result'))
const { query, scope, caseSensitive, exact, field, state } = finder
defineExpose({ setQuery: async value => {
  const request = typeof value === 'object' ? value : { query: value }
  scope.value = 'values'; field.value = request.field ?? ''; query.value = String(request.query)
  await nextTick()
  finder.search(1)
} })
const active = ref(0)
const optionsOpen = ref(false)
const resultsOpen = ref(false)
function submitSearch() { if (!state.pending) state.total ? next(1) : finder.search() }
let desired = 'first'
let scrollOnResults = false
watch([query, scope, caseSensitive, exact, field], () => { scrollOnResults = false })
finder.onResults(() => {
  active.value = desired === 'last' ? Math.max(0, state.matches.length - 1) : 0
  desired = 'first'
  emit('reveal', state.matches[active.value] ?? null, scrollOnResults)
  scrollOnResults = false
})
const range = computed(() => pageRange(state.total, state.page, SEARCH_PAGE_SIZE))
const current = computed(() => (state.page - 1) * SEARCH_PAGE_SIZE + active.value + 1)
const rows = computed(() => state.matches.map(match => ({ ...match, owner: selectableOwner(props.result.json, match.path, props.selectors) })))
function reveal(index) { active.value = index; emit('reveal', state.matches[index]) }
function next(direction) {
  const index = active.value + direction
  if (index >= 0 && index < state.matches.length) reveal(index)
  else { desired = direction < 0 ? 'last' : 'first'; scrollOnResults = true; finder.search(state.page + direction) }
}
function select(row, index) { emit('select', row.owner); reveal(index) }
</script>
<template>
  <section class="payload-search" aria-label="Find in response">
    <form class="search-bar" @submit.prevent="submitSearch">
      <label class="query"><span class="sr-only">Search JSON</span><input v-model="query" type="search" :maxlength="MAX_QUERY_LENGTH" placeholder="Find in response…" autocomplete="off" @keydown.shift.enter.prevent="state.total && next(-1)"></label>
      <span v-if="field" class="field-filter">Field: {{ field }} <button type="button" aria-label="Search all fields" @click="field = ''">All fields</button></span>
      <span v-if="state.total && !state.pending" class="match-count">{{ current.toLocaleString() }}/{{ state.total.toLocaleString() }}</span>
      <button type="button" class="secondary" aria-label="Previous match" :disabled="state.pending || !state.total || current <= 1" @click="next(-1)">↑</button>
      <button type="button" class="secondary" aria-label="Next match" :disabled="state.pending || !state.total || current >= state.total" @click="next(1)">↓</button>
      <button type="button" class="secondary" :aria-expanded="optionsOpen" @click="optionsOpen = !optionsOpen">Options</button>
      <button v-if="state.pending" type="button" class="secondary" @click="finder.stop">Cancel search</button>
      <button v-if="query" type="button" class="secondary" aria-label="Clear search" @click="query = ''">×</button>
    </form>
    <div v-if="optionsOpen" class="search-options">
      <label>Search in <select v-model="scope" aria-label="Search scope"><option value="all">Keys and values</option><option value="values">Values only</option><option value="keys">Keys only</option></select></label>
      <label><input v-model="caseSensitive" type="checkbox"> Match case</label><label><input v-model="exact" type="checkbox"> Exact match</label>
    </div>
    <p v-if="state.pending || state.cancelled || state.total || query.trim()" class="search-status muted" role="status" aria-live="polite">
      <template v-if="state.pending">Searching the whole response… <template v-if="state.scanned">{{ state.scanned.toLocaleString() }} locations checked.</template></template>
      <template v-else-if="state.cancelled">Search stopped.</template>
      <template v-else-if="state.total">{{ state.total.toLocaleString() }} matching locations. Match {{ current.toLocaleString() }} of {{ state.total.toLocaleString() }}.</template>
      <template v-else-if="query.trim() && !state.error">No matches in this response.</template>
      <template v-else>All pages and nested objects · Enter: next match · Shift+Enter: previous</template>
    </p>
    <p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
    <div v-if="state.matches.length && !state.pending" class="current-match">
      <code :title="pathLabel(state.matches[active].path)">{{ pathLabel(state.matches[active].path) }}</code>
      <button v-if="!resultsOpen && rows[active]?.owner !== null" type="button" class="secondary" :aria-label="'Select mapped object for match ' + current" @click="select(rows[active], active)">Select object</button>
      <button type="button" class="secondary" :aria-expanded="resultsOpen" @click="resultsOpen = !resultsOpen">{{ resultsOpen ? 'Hide results' : 'Show results' }}</button>
    </div>
    <template v-if="resultsOpen && state.matches.length && !state.pending">
      <ol class="search-results" :start="range.start + 1" aria-label="Response search results">
        <li v-for="(row, index) in rows" :key="JSON.stringify(row.path)" :class="{ active: active === index }">
          <button type="button" class="match" :aria-current="active === index ? 'true' : undefined" :aria-label="'Show match ' + (range.start + index + 1)" @click="reveal(index)"><code>{{ pathLabel(row.path) }}</code><span>{{ row.snippet }}</span><small>{{ row.kind }}</small></button>
          <button v-if="row.owner !== null" type="button" class="secondary" :aria-label="'Select mapped object for match ' + (range.start + index + 1)" @click="select(row, index)">Select object</button>
        </li>
      </ol>
      <div v-if="state.pages > 1" class="search-pager"><PreviewPager :range="range" label="Search matches" @change="desired = 'first'; finder.search($event)" /></div>
    </template>
  </section>
</template>
<style scoped>
.payload-search { position: sticky; top: 0; z-index: 1; padding: .45rem; margin-bottom: .5rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--surface); font-size: .75rem; }
.search-bar, .search-options, .current-match { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; }.query { flex: 1 1 10rem; min-width: 0; }.query input { width: 100%; min-width: 0; padding: .35rem .5rem; }
button { padding: .3rem .45rem; font-size: .72rem; }.match-count { font-variant-numeric: tabular-nums; }.search-options { padding: .5rem 0; }.search-options label { display: flex; align-items: center; gap: .25rem; }.search-options select { padding: .25rem; font-size: .75rem; }
.search-status { margin: .3rem 0 0; font-size: .7rem; }.error { margin: .3rem 0; overflow-wrap: anywhere; }.current-match { margin-top: .3rem; }.current-match > code { flex: 1 1 10rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent); font-size: .7rem; }
.search-results { max-height: 14rem; overflow: auto; margin: .4rem 0; padding-left: 1.4rem; }.search-results li { padding: .3rem; border-radius: .3rem; }.search-results li.active { background: var(--accent-soft); }.match { display: grid; text-align: left; width: 100%; gap: .15rem; }.match code, .match span { overflow-wrap: anywhere; white-space: pre-wrap; }.match small { color: var(--muted); }.search-pager { padding: .15rem .5rem; border-radius: .35rem; background: #182420; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
