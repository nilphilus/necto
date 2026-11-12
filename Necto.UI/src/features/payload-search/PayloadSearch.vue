<script setup>
import { computed, ref, toRef, watch } from 'vue'
import { usePayloadSearch } from './usePayloadSearch.js'
import { pathLabel, selectableOwner, SEARCH_PAGE_SIZE, MAX_QUERY_LENGTH } from './search.js'
import { pageRange } from '../request-runner/preview.js'
import PreviewPager from '../request-runner/PreviewPager.vue'
const props = defineProps({ result: Object, selectors: Array })
const emit = defineEmits(['reveal', 'select'])
const finder = usePayloadSearch(toRef(props, 'result'))
const { query, scope, caseSensitive, exact, state } = finder
const active = ref(0)
let desired = 'first'
let scrollOnResults = false
watch([query, scope, caseSensitive, exact], () => { scrollOnResults = false })
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
  <details class="payload-search">
    <summary>Search entire response</summary>
    <form @submit.prevent="desired = 'first'; finder.search()">
      <label class="query">Search JSON <input v-model="query" type="search" :maxlength="MAX_QUERY_LENGTH" placeholder="Invoice number, ID or field name" autocomplete="off"></label>
      <label>Search in <select v-model="scope" aria-label="Search scope"><option value="all">Keys and values</option><option value="values">Values only</option><option value="keys">Keys only</option></select></label>
      <label class="check"><input v-model="caseSensitive" type="checkbox"> Match case</label>
      <label class="check"><input v-model="exact" type="checkbox"> Exact match</label>
      <button type="submit" class="secondary" :disabled="!query.trim() || state.pending">Search</button>
      <button v-if="state.pending" type="button" class="secondary" @click="finder.stop">Cancel search</button>
      <button v-if="query" type="button" class="secondary" @click="query = ''">Clear search</button>
    </form>
    <p class="search-status muted" role="status" aria-live="polite">
      <template v-if="state.pending">Searching the whole response… <template v-if="state.scanned">{{ state.scanned.toLocaleString() }} locations checked.</template></template>
      <template v-else-if="state.cancelled">Search stopped.</template>
      <template v-else-if="state.total">{{ state.total.toLocaleString() }} matching locations. Match {{ current.toLocaleString() }} of {{ state.total.toLocaleString() }}.</template>
      <template v-else-if="query.trim() && !state.error">No matches in this response.</template>
      <template v-else>Search every page and nested object. No additional API requests.</template>
    </p>
    <p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
    <template v-if="state.matches.length && !state.pending">
      <div class="match-navigation">
        <button type="button" class="secondary" :disabled="current <= 1" @click="next(-1)">Previous match</button>
        <button type="button" class="secondary" :disabled="current >= state.total" @click="next(1)">Next match</button>
      </div>
      <ol class="search-results" :start="range.start + 1" aria-label="Response search results">
        <li v-for="(row, index) in rows" :key="JSON.stringify(row.path)" :class="{ active: active === index }">
          <button type="button" class="match" :aria-current="active === index ? 'true' : undefined" :aria-label="'Show match ' + (range.start + index + 1)" @click="reveal(index)">
            <code>{{ pathLabel(row.path) }}</code><span>{{ row.snippet }}</span><small>{{ row.kind }}</small>
          </button>
          <button v-if="row.owner !== null" type="button" class="secondary select-result" :aria-label="'Select mapped object for match ' + (range.start + index + 1)" @click="select(row, index)">Select object</button>
        </li>
      </ol>
      <div v-if="state.pages > 1" class="search-pager"><PreviewPager :range="range" label="Search matches" @change="desired = 'first'; finder.search($event)" /></div>
    </template>
  </details>
</template>
<style scoped>
.payload-search { margin-bottom: .65rem; padding: .65rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--surface); font-size: .8rem; }
summary { cursor: pointer; color: var(--accent); font-weight: 650; width: fit-content; }
form { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; margin-top: .65rem; }label { display: grid; gap: .25rem; }.query { flex: 1 1 15rem; min-width: 0; }.query input { width: 100%; min-width: 0; }.check { display: flex; gap: .25rem; align-items: center; min-height: 2.25rem; }
form button, .match-navigation button { font-size: .75rem; padding: .45rem .6rem; }
.search-status { margin: .6rem 0 0; font-size: .76rem; }.error { font-size: .78rem; overflow-wrap: anywhere; }
.match-navigation { display: flex; gap: .35rem; margin-top: .5rem; }
.search-results { padding-left: 1.65rem; margin: .5rem 0; max-height: 15rem; overflow: auto; }
.search-results li { padding: .25rem .35rem; border-radius: .35rem; }.search-results li.active { background: var(--accent-soft); }
.match { display: grid; gap: .15rem; width: 100%; min-width: 0; padding: .2rem; text-align: left; }.match code, .match span { overflow-wrap: anywhere; white-space: pre-wrap; }.match code { font-size: .73rem; color: var(--accent); }.match span { font-size: .76rem; }.match small { color: var(--muted); font-size: .68rem; }
.select-result { padding: .2rem .4rem; margin: .2rem 0; font-size: .7rem; color: var(--accent); }
.search-pager { padding: .15rem .5rem; border-radius: .35rem; background: #182420; }
</style>
