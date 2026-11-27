<script setup>
import GraphMinimap from '../GraphMinimap.vue'
import { useGraphNavigation, MIN_ZOOM, MAX_ZOOM } from '../graph-navigation.js'
import IdentifierCatalog from './IdentifierCatalog.vue'
import { useIdentifierCatalog } from './useIdentifierCatalog.js'
import { computed, nextTick, ref, watch, useId } from 'vue'
import { fitGraphScale, useGraphViewport } from '../graph-viewport.js'
import { buildEntityGraph, connectionPath, entitySize, groupConnections, layoutGraph } from './graph.js'
const props = defineProps({ configuration: Object, authentication: Object, spec: Object, operations: Array, mappings: Array, mappingError: String, initialOperationKey: String, apis: { type: Array, default: () => [] } })
defineEmits(['open-operation'])
const search = ref('')
const selectedId = ref('')
const zoom = ref(1)
const kind = ref('all')
const searchOpen = ref(false)
const activeResult = ref(0)
const searchResultsId = useId()
const markerId = useId()
const detailsTitle = ref(null)
const canvas = ref(null)
const { entries, pending: catalogPending, error: catalogError, reload: reloadCatalog } = useIdentifierCatalog(props)
const graph = computed(() => buildEntityGraph(props.spec, props.operations, props.mappings, props.apis, entries.value))
const matches = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return []
  const entries = graph.value.nodes.filter(node => node.name.toLowerCase().includes(query) ||
    node.schemaKey?.toLowerCase().includes(query) || node.qualifiedType?.toLowerCase().includes(query))
  const rank = node => {
    const name = node.name.toLowerCase()
    return name === query ? 0 : name.startsWith(query) ? 1 : 2
  }
  return entries.sort((a, b) => rank(a) - rank(b))
})
const results = computed(() => matches.value.slice(0, 20))
const duplicateNames = computed(() => {
  const counts = new Map()
  for (const node of graph.value.nodes) counts.set(node.name, (counts.get(node.name) ?? 0) + 1)
  return counts
})
const showResults = computed(() => searchOpen.value && Boolean(search.value.trim()))
const resultSummary = computed(() => {
  const total = matches.value.length
  if (!total) return 'No matching entities'
  if (total > results.value.length) return 'Showing ' + results.value.length + ' of ' + total + ' matches. Refine your search for more.'
  return total === 1 ? '1 match' : total + ' matches'
})
const matchingEdges = computed(() => graph.value.edges.filter(edge => kind.value === 'all' || kind.value === edge.kind))
const selected = computed(() => graph.value.nodes.find(node => node.id === selectedId.value))
const relationships = computed(() => selected.value ? matchingEdges.value.filter(connected) : [])
const positions = computed(() => layoutGraph(graph.value.nodes, matchingEdges.value))
const byId = computed(() => new Map(positions.value.map(node => [node.id, node])))
const connections = computed(() => groupConnections(matchingEdges.value))
const names = computed(() => new Map(graph.value.nodes.map(node => [node.id, node.name])))
const width = computed(() => positions.value.reduce((max, node) => Math.max(max, node.x + 305), 620))
const height = computed(() => positions.value.reduce((max, node) => Math.max(max, node.y + 125), 380))
const { autoFit, fit, center } = useGraphViewport(canvas, width, height, zoom)
const { view, sync, zoomAt, wheel, navigate, isPanning, startPan, movePan, stopPan } = useGraphNavigation(canvas, width, height, zoom, autoFit)
const displayEdges = computed(() => selected.value
  ? [...connections.value].sort((a, b) => Number(connected(a)) - Number(connected(b)))
  : connections.value)
const miniEdges = computed(() => connections.value.map(edge => ({ ...edge, from:byId.value.get(edge.from), to:byId.value.get(edge.to) })).filter(edge=>edge.from&&edge.to))
watch(() => props.initialOperationKey, key => { selectedId.value = graph.value.nodes.find(node => node.endpoints.some(entry => entry.operation.key === key))?.id ?? '' }, { immediate: true })
watch(search, () => { activeResult.value = 0 })
watch(() => props.spec, () => { selectedId.value = ''; search.value = ''; searchOpen.value = false })

async function selectEntity(id, reveal = false) {
  selectedId.value = id
  await nextTick()
  if (reveal) await zoomToConnections()
  else if (window.matchMedia('(max-width: 800px)').matches) {
    detailsTitle.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
    detailsTitle.value?.focus({ preventScroll: true })
  }
}

async function zoomToConnections() {
  const viewport = canvas.value
  const node = byId.value.get(selectedId.value)
  if (!viewport || !node) return
  let left = node.x, top = node.y, right = node.x + entitySize.width, bottom = node.y + entitySize.height
  for (const edge of relationships.value) {
    const neighbor = byId.value.get(edge.from === node.id ? edge.to : edge.from)
    if (!neighbor) continue
    left = Math.min(left, neighbor.x)
    top = Math.min(top, neighbor.y)
    right = Math.max(right, neighbor.x + entitySize.width)
    bottom = Math.max(bottom, neighbor.y + entitySize.height)
  }
  autoFit.value = false
  zoom.value = fitGraphScale({ width: viewport.clientWidth, height: viewport.clientHeight },
    { width: right - left, height: bottom - top })
  await nextTick()
  center({ x: left, y: top }, { width: right - left, height: bottom - top })
}

function chooseResult(node) {
  search.value = node.name
  searchOpen.value = false
  void selectEntity(node.id, true)
}

async function moveResult(event, direction) {
  if (!results.value.length) return
  event.preventDefault()
  const last = results.value.length - 1
  activeResult.value = showResults.value ? Math.max(0, Math.min(last, activeResult.value + direction)) : direction > 0 ? 0 : last
  searchOpen.value = true
  await nextTick()
  document.getElementById(searchResultsId + '-' + activeResult.value)?.scrollIntoView({ block: 'nearest' })
}

function chooseActiveResult(event) {
  if (event.isComposing || !showResults.value || !results.value[activeResult.value]) return
  event.preventDefault()
  chooseResult(results.value[activeResult.value])
}
function connected(edge) { return !selectedId.value || edge.from === selectedId.value || edge.to === selectedId.value }
</script>

<template>
  <section class="entity-page" aria-labelledby="entity-title">
    <header>
      <div><h2 id="entity-title">Entity graph</h2><p class="muted">Explore API models and the requests connected to them.</p></div>
      <span class="counts">{{ graph.nodes.length }} entities · {{ graph.edges.length }} connections</span>
    </header>
    <div class="graph-controls">
      <IdentifierCatalog :available="Boolean(configuration?.entityCatalogUrl)" :entries="entries" :pending="catalogPending"
        :error="catalogError" :reload="reloadCatalog" :operations="operations" @open-operation="$emit('open-operation', $event)" />
      <div class="entity-search" @focusout="event => { if (!event.currentTarget.contains(event.relatedTarget)) searchOpen = false }">
        <label>Find an entity
          <input v-model="search" type="search" role="combobox" autocomplete="off" placeholder="Invoice, Customer…"
            aria-autocomplete="list" :aria-expanded="showResults" :aria-controls="searchResultsId"
            :aria-activedescendant="showResults && results[activeResult] ? searchResultsId + '-' + activeResult : undefined"
            @focus="searchOpen = true" @click="searchOpen = true" @input="searchOpen = true" @keydown.down="moveResult($event, 1)"
            @keydown.up="moveResult($event, -1)" @keydown.enter="chooseActiveResult" @keydown.esc.stop.prevent="searchOpen = false">
        </label>
        <div v-show="showResults" class="entity-search-results">
          <small role="status">{{ resultSummary }}</small>
          <ul :id="searchResultsId" role="listbox" aria-label="Matching entities">
            <li v-for="(node, index) in results" :id="searchResultsId + '-' + index" :key="node.id" role="option"
              :aria-selected="index === activeResult" @mousedown.prevent @click="chooseResult(node)">
              <strong>{{ node.name }}</strong>
              <small v-if="duplicateNames.get(node.name) > 1">{{ node.qualifiedType || node.schemaKey }}</small>
            </li>
          </ul>
        </div>
      </div>
      <label>Connections <select v-model="kind" aria-label="Connections"><option value="all">All connections</option><option value="schema">Schema references</option><option value="mapping">Value flows</option></select></label>
      <button type="button" class="secondary" :disabled="!selected" @click="zoomToConnections">Zoom to connections</button>
      <button type="button" class="secondary" @click="fit">Fit to view</button>
      <button type="button" class="secondary" :disabled="!selected" @click="center(byId.get(selectedId), entitySize)">Center selection</button>
      <div class="zoom" role="group" aria-label="Graph zoom">
        <button type="button" class="secondary" :disabled="zoom <= MIN_ZOOM" aria-label="Zoom out" @click="zoomAt(Math.max(MIN_ZOOM, zoom / 1.35))">−</button>
        <button type="button" class="secondary" aria-label="Reset zoom" @click="zoomAt(1)">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" class="secondary" :disabled="zoom >= MAX_ZOOM" aria-label="Zoom in" @click="zoomAt(Math.min(MAX_ZOOM, zoom * 1.35))">+</button>
      </div>
    </div>
    <p class="legend"><span class="schema-key">— Schema reference</span><span class="mapping-key">┄ Value flow</span><span class="muted">Ctrl + scroll to zoom · Left-click and drag the background to pan · Use the overview to navigate. Models come from OpenAPI; value flows come from Necto mappings.</span></p>
    <p v-if="mappingError" class="muted" role="status">{{ mappingError }} Schema references are still available.</p>
    <p v-else-if="!mappings.length" class="muted">No value mappings loaded. Schema references are available independently.</p>
    <div class="graph-workspace">
      <div class="graph-stage">
      <div ref="canvas" class="graph-canvas" :class="{ pannable: positions.length, panning: isPanning }"
        tabindex="0" aria-label="Scrollable entity graph" @scroll="sync" @wheel="positions.length && $event.ctrlKey && wheel($event)"
        @pointerdown="positions.length && startPan($event)" @pointermove="movePan"
        @pointerup="stopPan" @pointercancel="stopPan" @lostpointercapture="stopPan">
        <svg v-if="positions.length" :width="width * zoom" :height="height * zoom" :viewBox="`0 0 ${width} ${height}`" role="group" aria-label="Entity relationships">
          <defs><marker :id="markerId" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
          <path v-for="edge in displayEdges" :key="edge.id" :d="connectionPath(edge, byId.get(edge.from), byId.get(edge.to))" fill="none" :stroke="edge.kind === 'mapping' ? '#ad7923' : selected && connected(edge) ? 'var(--accent)' : '#57806d'" :stroke-dasharray="edge.kind === 'mapping' ? '6 5' : undefined" :stroke-width="selected && connected(edge) ? 4 : 1.5" :opacity="selected && connected(edge) ? 1 : connected(edge) ? .9 : .45" :marker-start="edge.reverse ? `url(#${markerId})` : undefined" :marker-end="edge.forward ? `url(#${markerId})` : undefined">
            <title>{{ edge.edges.map(link => `${names.get(link.from)} → ${names.get(link.to)} · ${link.label}`).join('\n') }}</title>
          </path>
          <foreignObject v-for="node in positions" :key="node.id" :x="node.x" :y="node.y" :width="entitySize.width" :height="entitySize.height + 4">
            <button type="button" class="entity-node" :class="{ active: selectedId === node.id }" :aria-pressed="selectedId === node.id" :aria-label="'Inspect entity ' + node.name" @click="selectEntity(node.id)">
              <strong>{{ node.name }}</strong>
              <small>{{ node.endpoints.length }} endpoints</small>
            </button>
          </foreignObject>
        </svg>
        <p v-else class="muted empty">No object schemas found in the endpoints’ requests or successful responses.</p>
      </div>
      <GraphMinimap v-if="positions.length" :width="width" :height="height" :nodes="positions" :edges="miniEdges" :view="view" :selected-id="selectedId" @navigate="navigate" />
      </div>
      <aside class="entity-details" aria-label="Selected entity details">
        <template v-if="selected">
          <h3 ref="detailsTitle" tabindex="-1" aria-live="polite">{{ selected.name }}</h3>
          <p v-if="selected.qualifiedType && selected.qualifiedType !== selected.name" class="muted schema-key">CLR type <code>{{ selected.qualifiedType }}</code></p>
          <p v-if="selected.schemaKey && selected.schemaKey !== selected.qualifiedType" class="muted schema-key">Schema <code>{{ selected.schemaKey }}</code></p>
          <p v-if="selected.schema.description" class="muted">{{ selected.schema.description }}</p>
          <h4>Connected endpoints ({{ selected.endpoints.length }})</h4>
          <ul class="endpoint-list">
            <li v-for="entry in selected.endpoints" :key="entry.operation.key">
              <button type="button" @click="$emit('open-operation', entry.operation)">
                <span class="method" :data-method="entry.operation.method">{{ entry.operation.method }}</span>
                <strong>{{ entry.operation.name }}</strong><code>{{ entry.operation.path }}</code><small>{{ entry.roles.join(' · ') }}</small>
              </button>
            </li>
          </ul>
          <h4>Connections ({{ relationships.length }})</h4>
          <ul class="relationship-list">
            <li v-for="edge in relationships" :key="edge.id">
              <button type="button" @click="selectEntity(edge.from === selectedId ? edge.to : edge.from, true)">{{ names.get(edge.from) }} → {{ names.get(edge.to) }}</button>
              <code>{{ edge.label }}</code><small>{{ edge.kind === 'schema' ? 'Schema reference' : 'Value flow' }}</small>
            </li>
          </ul>
          <p v-if="!relationships.length" class="muted">No connections for the current filter.</p>
        </template>
        <div v-else class="details-empty"><h3>Follow the connections</h3><p class="muted">Select an entity to see where it is used and open a connected endpoint.</p></div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.entity-page { flex: 1; min-height: 0; overflow: auto; padding: 1.5rem; background: var(--canvas); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
h2 { margin: 0; font-size: 1.75rem; letter-spacing: -.035em; }
header p { margin: .4rem 0 1rem; font-size: .9rem; }
.counts { color: var(--muted); font-size: .85rem; }
.graph-controls { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; }
.graph-controls label { display: grid; gap: .3rem; font-size: .8rem; }
.entity-search { position: relative; min-width: min(16rem, 100%); }
.entity-search-results { position: absolute; z-index: 2; inset: calc(100% + .25rem) 0 auto; background: var(--surface); border: 1px solid var(--line); border-radius: .4rem; box-shadow: 0 5px 15px #0002; }
.entity-search-results ul { max-height: min(19rem, 45vh); overflow: auto; }
.entity-search-results li { display: grid; gap: .15rem; padding: .45rem .65rem; cursor: pointer; overflow-wrap: anywhere; font-size: .85rem; }
.entity-search-results li:hover, .entity-search-results li[aria-selected="true"] { background: var(--accent-soft); }
.entity-search-results > small { display: block; padding: .4rem .65rem; color: var(--muted); }
.entity-search-results li small { color: var(--muted); }
.zoom { display: flex; gap: .25rem; margin-left: auto; }
.legend { display: flex; flex-wrap: wrap; gap: .65rem; font-size: .78rem; }
.schema-key { color: #38684f; }.mapping-key { color: #805914; }
.graph-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 21rem); border: 1px solid var(--line); border-radius: .75rem; overflow: hidden; background: var(--surface); }
.graph-stage { position:relative; min-width:0; overflow:hidden; }
.graph-canvas { min-width: 0; height: 65vh; min-height: 26rem; overflow: auto; background-color: var(--canvas); background-image: radial-gradient(var(--line) 1px, transparent 1px); background-size: 18px 18px; }
.graph-canvas.pannable { cursor: grab; user-select: none; }
.graph-canvas.panning, .graph-canvas.panning .entity-node { cursor: grabbing; }
.entity-node { cursor: pointer; }
svg { display: block; }
.entity-node { width: 100%; height: 76px; display: flex; flex-direction: column; justify-content: center; align-items: start; padding: .8rem 1rem; border: 1px solid #a5bdae; border-radius: .65rem; background: var(--surface); box-shadow: 0 3px 9px #1c4b3210; text-align: left; }
.entity-node:hover { border-color: var(--accent); background: var(--accent-soft); }
.entity-node.active { border: 2px solid var(--accent); background: var(--accent-soft); }
.entity-node strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }
.schema-key { overflow-wrap: anywhere; }
.entity-node small { margin-top: .25rem; color: var(--muted); font-size: .75rem; }
.entity-details { min-width: 0; padding: 1rem; border-left: 1px solid var(--line); max-height: 65vh; overflow: auto; }
h3 { margin: 0 0 .5rem; overflow-wrap: anywhere; }h4 { font-size: .8rem; margin: 1rem 0 .5rem; }
.entity-details p { font-size: .85rem; }
ul { list-style: none; padding: 0; margin: 0; }
.endpoint-list li + li, .relationship-list li + li { border-top: 1px solid var(--line); }
.endpoint-list button { width: 100%; display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: .3rem .45rem; padding: .65rem .25rem; text-align: left; }
.endpoint-list strong { font-size: .82rem; }.endpoint-list code, .endpoint-list small { grid-column: 1 / -1; overflow-wrap: anywhere; font-size: .72rem; color: var(--muted); }
.relationship-list li { padding: .45rem 0; }.relationship-list button { padding: .2rem 0; font-size: .8rem; text-align: left; overflow-wrap: anywhere; color: var(--accent); }
.relationship-list code, .relationship-list small { display: block; font-size: .72rem; color: var(--muted); overflow-wrap: anywhere; }
.empty { padding: 1.25rem; font-size: .9rem; }
@media (max-width: 800px) { .entity-page { padding: 1rem; }.graph-workspace { grid-template-columns: minmax(0, 1fr); }.entity-details { border-left: 0; border-top: 1px solid var(--line); max-height: none; }.graph-canvas { height: 25rem; min-height: 0; }.zoom { margin-left: 0; } }
</style>
