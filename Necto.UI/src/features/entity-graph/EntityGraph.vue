<script setup>
import GraphMinimap from '../GraphMinimap.vue'
import { useGraphNavigation, MIN_ZOOM, MAX_ZOOM } from '../graph-navigation.js'
import IdentifierCatalog from './IdentifierCatalog.vue'
import { computed, nextTick, ref, watch, useId } from 'vue'
import { useGraphViewport } from '../graph-viewport.js'
import { buildEntityGraph, connectionPath, entitySize, groupConnections, layoutGraph } from './graph.js'
const props = defineProps({ configuration: Object, authentication: Object, spec: Object, operations: Array, mappings: Array, mappingError: String, initialOperationKey: String, apis: { type: Array, default: () => [] } })
defineEmits(['open-operation'])
const search = ref('')
const selectedId = ref('')
const zoom = ref(1)
const kind = ref('all')
const focused = ref(false)
const markerId = useId()
const detailsTitle = ref(null)
const canvas = ref(null)
const graph = computed(() => buildEntityGraph(props.spec, props.operations, props.mappings, props.apis))
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return graph.value.nodes.filter(node => node.name.toLowerCase().includes(query) ||
    node.schemaKey?.toLowerCase().includes(query))
})
const matchingEdges = computed(() => graph.value.edges.filter(edge => kind.value === 'all' || kind.value === edge.kind))
const selected = computed(() => graph.value.nodes.find(node => node.id === selectedId.value))
const relationships = computed(() => matchingEdges.value.filter(edge => connected(edge) && selectedId.value))
const visibleNodes = computed(() => {
  if (!focused.value || !selected.value) return filtered.value
  const ids = new Set(relationships.value.flatMap(edge => [edge.from, edge.to]))
  return [selected.value, ...graph.value.nodes.filter(node => node.id !== selectedId.value && ids.has(node.id))]
})
const visibleGraph = computed(() => {
  const nodes = visibleNodes.value.slice(0, 100)
  const ids = new Set(nodes.map(node => node.id))
  const edges = matchingEdges.value.filter(edge => ids.has(edge.from) && ids.has(edge.to) &&
    (!focused.value || connected(edge)))
  return { nodes, edges }
})
const positions = computed(() => layoutGraph(visibleGraph.value.nodes, visibleGraph.value.edges, focused.value ? selectedId.value : ''))
const byId = computed(() => new Map(positions.value.map(node => [node.id, node])))
const connections = computed(() => groupConnections(visibleGraph.value.edges))
const names = computed(() => new Map(graph.value.nodes.map(node => [node.id, node.name])))
const width = computed(() => Math.max(620, ...positions.value.map(node => node.x + 305)))
const height = computed(() => Math.max(380, ...positions.value.map(node => node.y + 125)))
const { autoFit, fit, center } = useGraphViewport(canvas, width, height, zoom)
const { view, sync, zoomAt, wheel, navigate, isPanning, startPan, movePan, stopPan } = useGraphNavigation(canvas, width, height, zoom, autoFit)
const displayEdges = computed(() => selected.value
  ? [...connections.value].sort((a, b) => Number(connected(a)) - Number(connected(b)))
  : connections.value)
const miniEdges = computed(() => connections.value.map(edge => ({ ...edge, from:byId.value.get(edge.from), to:byId.value.get(edge.to) })).filter(edge=>edge.from&&edge.to))
watch(() => props.initialOperationKey, key => { selectedId.value = graph.value.nodes.find(node => node.endpoints.some(entry => entry.operation.key === key))?.id ?? '' }, { immediate: true })
watch(selected, value => { if (!value) focused.value = false })
watch(search, () => { focused.value = false; if (!filtered.value.some(node => node.id === selectedId.value)) selectedId.value = '' })
watch(() => props.spec, () => { selectedId.value = ''; search.value = '' })
watch([focused, kind, search], () => canvas.value?.scrollTo(0, 0))
async function selectEntity(id, reveal = false) {
  selectedId.value = id
  if (focused.value || !byId.value.has(id)) {
    focused.value = true
    canvas.value?.scrollTo(0, 0)
  }
  await nextTick()
  if (reveal) center(byId.value.get(id), entitySize)
  if (window.matchMedia('(max-width: 800px)').matches) {
    detailsTitle.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
    detailsTitle.value?.focus({ preventScroll: true })
  }
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
      <IdentifierCatalog :configuration="configuration" :authentication="authentication" :operations="operations" @open-operation="$emit('open-operation', $event)" />
      <label>Find an entity <input v-model="search" type="search" placeholder="Invoice, Customer…"></label>
      <label>Connections <select v-model="kind" aria-label="Connections"><option value="all">All connections</option><option value="schema">Schema references</option><option value="mapping">Value flows</option></select></label>
      <button type="button" class="secondary" :disabled="!selected" :aria-pressed="focused" @click="focused = !focused">Focus on selected entity</button>
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
    <p v-if="visibleNodes.length > 100" class="muted" role="status">Showing 100 of {{ visibleNodes.length }} entities. {{ focused ? 'All direct connections are listed in the details.' : 'Refine the search to see others.' }}</p>
    <div class="graph-workspace">
      <div class="graph-stage">
      <div ref="canvas" class="graph-canvas" :class="{ pannable: positions.length, panning: isPanning }"
        tabindex="0" aria-label="Scrollable entity graph" @scroll="sync" @wheel="positions.length && $event.ctrlKey && wheel($event)"
        @pointerdown="positions.length && startPan($event)" @pointermove="movePan"
        @pointerup="stopPan" @pointercancel="stopPan" @lostpointercapture="stopPan">
        <svg v-if="positions.length" :width="width * zoom" :height="height * zoom" :viewBox="`0 0 ${width} ${height}`" role="group" aria-label="Entity relationships">
          <defs><marker :id="markerId" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
          <path v-for="edge in displayEdges" :key="edge.id" :d="connectionPath(edge, byId.get(edge.from), byId.get(edge.to))" fill="none" :stroke="edge.kind === 'mapping' ? '#ad7923' : selected && connected(edge) ? 'var(--accent)' : '#57806d'" :stroke-dasharray="edge.kind === 'mapping' ? '6 5' : undefined" :stroke-width="selected && connected(edge) ? 4 : 1.5" :opacity="selected && connected(edge) ? 1 : connected(edge) ? .9 : .15" :marker-start="edge.reverse ? `url(#${markerId})` : undefined" :marker-end="edge.forward ? `url(#${markerId})` : undefined">
            <title>{{ edge.edges.map(link => `${names.get(link.from)} → ${names.get(link.to)} · ${link.label}`).join('\n') }}</title>
          </path>
          <foreignObject v-for="node in positions" :key="node.id" :x="node.x" :y="node.y" :width="entitySize.width" :height="entitySize.height + 4">
            <button type="button" class="entity-node" :class="{ active: selectedId === node.id }" :aria-pressed="selectedId === node.id" :aria-label="'Inspect entity ' + node.name" @click="selectEntity(node.id)">
              <strong>{{ node.name }}</strong>
              <small v-if="selectedId === node.id && node.schemaKey && node.schemaKey !== node.name"
                class="node-schema" :title="node.schemaKey">{{ node.schemaKey }}</small>
              <small v-else>{{ node.endpoints.length }} endpoints</small>
            </button>
          </foreignObject>
        </svg>
        <p v-else class="muted empty">{{ search ? 'No entities match your search.' : 'No object schemas found in request bodies or successful responses, or in OpenAPI components.' }}</p>
      </div>
      <GraphMinimap v-if="positions.length" :width="width" :height="height" :nodes="positions" :edges="miniEdges" :view="view" :selected-id="selectedId" @navigate="navigate" />
      </div>
      <aside class="entity-details" aria-label="Selected entity details">
        <template v-if="selected">
          <h3 ref="detailsTitle" tabindex="-1" aria-live="polite">{{ selected.name }}</h3>
          <p v-if="selected.schemaKey" class="muted schema-key">Schema <code>{{ selected.schemaKey }}</code></p>
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
          <p v-if="!selected.endpoints.length" class="muted">This schema is not used by a request body, successful response, or mapped input.</p>
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
.graph-controls button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
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
.node-schema { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
