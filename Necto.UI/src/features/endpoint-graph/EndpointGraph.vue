<script setup>
import GraphMinimap from '../GraphMinimap.vue'
import { useGraphNavigation, MIN_ZOOM, MAX_ZOOM } from '../graph-navigation.js'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useGraphViewport } from '../graph-viewport.js'
import { routeConnection } from '../graph-layout.js'
import { buildEndpointGraph, endpointSize, layoutEndpoints } from './graph.js'
const props = defineProps({ operations: Array, mappings: Array, mappingError: String, initialOperationKey: String })
defineEmits(['open-operation'])
const search = ref('')
const selectedId = ref('')
const zoom = ref(1)
const direction = ref('all')
const connectedOnly = ref(false)
const focused = ref(false)
const canvas = ref(null)
const detailsTitle = ref(null)
const markerId = useId()
const graph = computed(() => buildEndpointGraph(props.operations, props.mappings))
const byId = computed(() => new Map(graph.value.nodes.map(node => [node.id, node])))
const filtered = computed(() => graph.value.nodes.filter(node => {
  const operation = node.operation
  return (!connectedOnly.value || node.incoming + node.outgoing > 0) &&
    `${operation.name} ${operation.method} ${operation.path} ${operation.id ?? ''} ${operation.tags.join(' ')}`
      .toLowerCase().includes(search.value.trim().toLowerCase())
}))
const selected = computed(() => byId.value.get(selectedId.value))
const incoming = computed(() => graph.value.edges.filter(edge => edge.to === selectedId.value))
const outgoing = computed(() => graph.value.edges.filter(edge => edge.from === selectedId.value))
const matchingEdges = computed(() => graph.value.edges.filter(edge =>
  (!selectedId.value || direction.value === 'all' ||
    (direction.value === 'incoming' ? edge.to : edge.from) === selectedId.value) &&
  (!focused.value || connected(edge))))
const visibleNodes = computed(() => {
  if (!focused.value || !selected.value) return filtered.value
  const ids = new Set(matchingEdges.value.flatMap(edge => [edge.from, edge.to]))
  return [selected.value, ...graph.value.nodes.filter(node => node.id !== selectedId.value && ids.has(node.id))]
})
const shownNodes = computed(() => visibleNodes.value.slice(0, 100))
const edges = computed(() => {
  const ids = new Set(shownNodes.value.map(node => node.id))
  return matchingEdges.value.filter(edge => ids.has(edge.from) && ids.has(edge.to))
})
const positions = computed(() => layoutEndpoints(shownNodes.value, edges.value, focused.value ? selectedId.value : ''))
const positioned = computed(() => new Map(positions.value.map(node => [node.id, node])))
const edgeIds = computed(() => new Set(edges.value.map(edge => edge.id)))
const width = computed(() => Math.max(650, ...positions.value.map(node => node.x + endpointSize.width + 90)))
const height = computed(() => Math.max(400, ...positions.value.map(node => node.y + 145)))
const { autoFit, fit, center } = useGraphViewport(canvas, width, height, zoom)
const {view,sync,zoomAt,wheel,navigate}=useGraphNavigation(canvas,width,height,zoom,autoFit)
const displayEdges = computed(() => selected.value
  ? [...edges.value].sort((a, b) => Number(connected(a)) - Number(connected(b)))
  : edges.value)
const miniEdges=computed(()=>edges.value.map(edge=>({...edge,from:positioned.value.get(edge.from),to:positioned.value.get(edge.to)})).filter(edge=>edge.from&&edge.to))
watch(() => props.initialOperationKey, key => { if (byId.value.has(key)) selectedId.value = key }, { immediate: true })
watch(selected, value => {
  if (!value) {
    selectedId.value = ''
    focused.value = false
    direction.value = 'all'
  }
})
watch([search, connectedOnly], () => { focused.value = false; if (!filtered.value.some(node => node.id === selectedId.value)) selectedId.value = '' })
watch([focused, search, direction, connectedOnly], resetCanvas, { flush: 'post' })
function curve(edge) {
  const from = positioned.value.get(edge.from), to = positioned.value.get(edge.to)
  const reciprocal = from.id !== to.id && edgeIds.value.has(JSON.stringify([edge.to, edge.from]))
  const lane = reciprocal ? (from.id < to.id ? -9 : 9) : 0
  return routeConnection(from, to, endpointSize, lane)
}
function connected(edge) { return !selectedId.value || edge.from === selectedId.value || edge.to === selectedId.value }
function resetCanvas() {
  if (autoFit.value) { fit(); return }
  if (!canvas.value) return
  const node = focused.value && positioned.value.get(selectedId.value)
  const left = node ? (node.x + endpointSize.width / 2) * zoom.value - canvas.value.clientWidth / 2 : 0
  canvas.value.scrollTo(Math.max(0, left), 0)
}
async function inspect(id) {
  if (!positioned.value.has(id)) focused.value = true
  selectedId.value = id
  await nextTick()
  if (focused.value) resetCanvas()
  if (window.matchMedia('(max-width: 800px)').matches) {
    detailsTitle.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
    detailsTitle.value?.focus({ preventScroll: true })
  }
}
</script>

<template>
  <section class="endpoint-page" aria-labelledby="endpoint-graph-title">
    <header><div><h2 id="endpoint-graph-title">Endpoint graph</h2><p class="muted">See which requests can reuse values from another response.</p></div>
      <span class="counts">{{ graph.nodes.length }} endpoints · {{ graph.edges.length }} connections</span>
    </header>
    <div class="graph-controls">
      <label>Find an endpoint <input v-model="search" type="search" placeholder="Name, method, path or tag"></label>
      <label>Direction <select v-model="direction" aria-label="Connection direction" :disabled="!selected">
        <option value="all">All connections</option><option value="incoming">Incoming to selection</option><option value="outgoing">Outgoing from selection</option>
      </select></label>
      <label class="check"><input v-model="connectedOnly" type="checkbox"> Connected endpoints only</label>
      <button type="button" class="secondary" :disabled="!selected" :aria-pressed="focused" @click="focused = !focused">Focus on selected endpoint</button>
      <button type="button" class="secondary" @click="fit">Fit to view</button>
      <button type="button" class="secondary" :disabled="!selected" @click="center(positioned.get(selectedId), endpointSize)">Center selection</button>
      <div class="zoom" role="group" aria-label="Endpoint graph zoom">
        <button type="button" class="secondary" :disabled="zoom <= MIN_ZOOM" aria-label="Zoom out" @click="zoomAt(Math.max(MIN_ZOOM,zoom/1.35))">−</button>
        <button type="button" class="secondary" aria-label="Reset zoom" @click="zoomAt(1)">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" class="secondary" :disabled="zoom >= MAX_ZOOM" aria-label="Zoom in" @click="zoomAt(Math.min(MAX_ZOOM,zoom*1.35))">+</button>
      </div>
    </div>
    <p class="legend">Scroll to zoom · Use the overview to navigate. Response → Request · Arrows show Necto value mappings, independently of shared entity schemas.</p>
    <p v-if="mappingError" class="muted" role="status">{{ mappingError }} Endpoints are shown without unavailable connections.</p>
    <p v-else-if="!graph.edges.length" class="muted" role="status">No valid endpoint mappings are available. Endpoints remain visible; shared schemas alone do not create arrows.</p>
    <p v-if="visibleNodes.length > 100" class="muted" role="status">Showing 100 of {{ visibleNodes.length }} endpoints. {{ focused ? 'All direct connections are listed in the details.' : 'Refine the search to see others.' }}</p>
    <div class="graph-workspace">
      <div class="graph-stage">
      <div ref="canvas" @scroll="sync" @wheel="positions.length && wheel($event)" class="graph-canvas" tabindex="0" aria-label="Scrollable endpoint graph">
        <svg v-if="positions.length" :width="width * zoom" :height="height * zoom" :viewBox="`0 0 ${width} ${height}`" role="group" aria-label="Endpoint relationships">
          <defs><marker :id="markerId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
          <path v-for="edge in displayEdges" :key="edge.id" :d="curve(edge)" fill="none" :stroke="selected && connected(edge) ? 'var(--accent)' : '#759b8a'" :stroke-width="selected && connected(edge) ? 4 : 1.5" :opacity="selected && connected(edge) ? 1 : connected(edge) ? .95 : .15" :marker-end="`url(#${markerId})`">
            <title>{{ byId.get(edge.from).operation.name }} → {{ byId.get(edge.to).operation.name }} · {{ edge.values.length }} mapped fields</title>
          </path>
          <foreignObject v-for="node in positions" :key="node.id" :x="node.x" :y="node.y" :width="endpointSize.width" :height="endpointSize.height + 4">
            <button type="button" class="endpoint-node" :class="{ active: selectedId === node.id }" :aria-pressed="selectedId === node.id"
              :aria-label="'Inspect endpoint ' + node.operation.method + ' ' + node.operation.path + (node.operation.apiId && node.operation.apiId !== 'local' ? ' [' + node.operation.apiId + ']' : '')" @click="inspect(node.id)">
              <span class="node-title"><span class="method" :data-method="node.operation.method">{{ node.operation.method }}</span><strong :title="node.operation.name">{{ node.operation.name }}</strong></span>
              <code :title="node.operation.path">{{ node.operation.path }}</code>
              <small>{{ node.operation.apiId && node.operation.apiId !== 'local' ? node.operation.apiName + ' [' + node.operation.apiId + '] · ' : '' }}{{ node.incoming }} incoming · {{ node.outgoing }} outgoing</small>
            </button>
          </foreignObject>
        </svg>
        <p v-else class="muted empty">{{ operations.length ? 'No endpoints match your filters.' : 'No endpoints available.' }}</p>
      </div>
      <GraphMinimap v-if="positions.length" label="Endpoint graph minimap" :width="width" :height="height" :nodes="positions" :edges="miniEdges" :view="view" :node-size="endpointSize" :selected-id="selectedId" @navigate="navigate" />
      </div>
      <aside class="endpoint-details" aria-label="Selected endpoint details">
        <template v-if="selected">
          <h3 ref="detailsTitle" tabindex="-1" aria-live="polite">{{ selected.operation.name }}</h3>
          <p v-if="selected.operation.apiId && selected.operation.apiId !== 'local'" class="muted">{{ selected.operation.apiName }} [{{ selected.operation.apiId }}]</p>
          <div class="selected-route"><span class="method" :data-method="selected.operation.method">{{ selected.operation.method }}</span><code>{{ selected.operation.path }}</code></div>
          <p v-if="selected.operation.description" class="muted">{{ selected.operation.description }}</p>
          <button type="button" class="primary open-request" @click="$emit('open-operation', selected.operation)">Open request</button>
          <template v-for="group in [{ name: 'Incoming', entries: incoming, peer: 'from' }, { name: 'Outgoing', entries: outgoing, peer: 'to' }]" :key="group.name">
            <section v-if="direction === 'all' || direction === group.name.toLowerCase()" :aria-label="group.name + ' endpoint connections'">
              <h4>{{ group.name }} ({{ group.entries.length }})</h4>
              <ul>
                <li v-for="edge in group.entries" :key="edge.id">
                  <button type="button" class="peer" @click="inspect(edge[group.peer])">
                    <span class="method" :data-method="byId.get(edge[group.peer]).operation.method">{{ byId.get(edge[group.peer]).operation.method }}</span>
                    {{ byId.get(edge[group.peer]).operation.name }}
                  </button>
                  <code class="peer-path">{{ byId.get(edge[group.peer]).operation.path }}</code>
                  <p v-for="value in edge.values" :key="JSON.stringify([value.selector, value.location, value.name])" class="mapping-detail">
                    <code>{{ value.selector }} → {{ value.location }}:{{ value.name ?? 'body' }}</code><small>{{ value.match }} match</small>
                  </p>
                </li>
              </ul>
              <p v-if="!group.entries.length" class="muted">No {{ group.name.toLowerCase() }} value mappings.</p>
            </section>
          </template>
        </template>
        <template v-else><h3>Follow the requests</h3><p class="muted">Select an endpoint to see which responses can feed it and which requests can use its output.</p></template>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.endpoint-page { flex: 1; min-height: 0; overflow: auto; padding: 1.5rem; background: var(--canvas); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
h2 { margin: 0; font-size: 1.75rem; letter-spacing: -.035em; } header p { margin: .4rem 0 1rem; font-size: .9rem; }
.counts { color: var(--muted); font-size: .85rem; }
.graph-controls { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; }
.graph-controls label { display: grid; gap: .3rem; font-size: .8rem; }.graph-controls .check { display: flex; align-items: center; min-height: 2.5rem; }
.graph-controls button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
.zoom { display: flex; gap: .25rem; margin-left: auto; }.legend { color: var(--muted); font-size: .8rem; }
.graph-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem); border: 1px solid var(--line); border-radius: .75rem; overflow: hidden; background: var(--surface); }
.graph-stage { position:relative; min-width:0; overflow:hidden; }
.graph-canvas { min-width: 0; height: 65vh; min-height: 26rem; overflow: auto; background-color: var(--canvas); background-image: radial-gradient(var(--line) 1px, transparent 1px); background-size: 18px 18px; }
svg { display: block; }.endpoint-node { width: 100%; height: 110px; display: flex; flex-direction: column; justify-content: center; align-items: start; gap: .4rem; padding: .8rem; border: 1px solid #a5bdae; border-radius: .65rem; background: var(--surface); box-shadow: 0 3px 9px #1c4b3210; text-align: left; }
.endpoint-node:hover { background: var(--accent-soft); border-color: var(--accent); }.endpoint-node.active { border: 2px solid var(--accent); background: var(--accent-soft); }
.node-title { display: flex; gap: .4rem; align-items: baseline; width: 100%; }.node-title strong, .endpoint-node code { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-title strong { font-size: .82rem; }.endpoint-node code { font-size: .7rem; }.endpoint-node small { font-size: .72rem; color: var(--muted); }
.endpoint-details { min-width: 0; padding: 1rem; border-left: 1px solid var(--line); max-height: 65vh; overflow: auto; }
h3 { margin: 0 0 .6rem; overflow-wrap: anywhere; }h4 { font-size: .82rem; margin: 1rem 0 .5rem; }.endpoint-details p { font-size: .8rem; }
.selected-route { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; font-size: .75rem; }.selected-route code { overflow-wrap: anywhere; }.open-request { margin-top: .7rem; font-size: .82rem; }
ul { list-style: none; padding: 0; margin: 0; }li { padding: .5rem 0; }li + li { border-top: 1px solid var(--line); }.peer { color: var(--accent); padding: .15rem 0; text-align: left; font-size: .8rem; }.peer-path { display: block; font-size: .7rem; overflow-wrap: anywhere; color: var(--muted); }
.mapping-detail { margin: .4rem 0 0; padding: .4rem; border-radius: .3rem; background: var(--subtle); }.mapping-detail code { font-size: .72rem; overflow-wrap: anywhere; }.mapping-detail small { display: block; margin-top: .2rem; font-size: .68rem; color: var(--muted); }
.empty { padding: 1rem; }
@media (max-width: 800px) { .endpoint-page { padding: 1rem; }.graph-workspace { grid-template-columns: minmax(0, 1fr); }.endpoint-details { border-left: 0; border-top: 1px solid var(--line); max-height: none; }.graph-canvas { height: 25rem; min-height: 0; }.zoom { margin-left: 0; } }
</style>
