<script setup>
import { computed, nextTick, ref, watch, useId } from 'vue'
import { buildEntityGraph, layoutGraph } from './graph.js'
const props = defineProps({ spec: Object, operations: Array, mappings: Array, mappingError: String })
defineEmits(['open-operation'])
const search = ref('')
const selectedId = ref('')
const zoom = ref(1)
const kind = ref('all')
const markerId = useId()
const detailsTitle = ref(null)
const graph = computed(() => buildEntityGraph(props.spec, props.operations, props.mappings))
const filtered = computed(() => graph.value.nodes.filter(node => node.name.toLowerCase().includes(search.value.trim().toLowerCase())))
// Limit the overview, then search to inspect another part of a large catalog.
const positions = computed(() => layoutGraph(filtered.value.slice(0, 100)))
const byId = computed(() => new Map(positions.value.map(node => [node.id, node])))
const edges = computed(() => graph.value.edges.filter(edge => byId.value.has(edge.from) && byId.value.has(edge.to) &&
  (kind.value === 'all' || kind.value === edge.kind)))
const selected = computed(() => graph.value.nodes.find(node => node.id === selectedId.value))
const relationships = computed(() => graph.value.edges.filter(edge => (edge.from === selectedId.value || edge.to === selectedId.value) &&
  (kind.value === 'all' || kind.value === edge.kind)))
const names = computed(() => new Map(graph.value.nodes.map(node => [node.id, node.name])))
const width = computed(() => Math.max(620, ...positions.value.map(node => node.x + 305)))
const height = computed(() => Math.max(380, ...positions.value.map(node => node.y + 125)))
watch(() => props.spec, () => { selectedId.value = ''; search.value = '' })
function curve(edge) {
  const from = byId.value.get(edge.from), to = byId.value.get(edge.to)
  if (from.id === to.id) return `M ${from.x + 220} ${from.y + 25} C ${from.x + 290} ${from.y - 25}, ${from.x + 290} ${from.y + 105}, ${from.x + 220} ${from.y + 55}`
  const down = to.y > from.y || (to.y === from.y && to.x > from.x)
  const x1 = from.x + (down ? 110 : 0), y1 = from.y + (down ? 76 : 35)
  const x2 = to.x + (down ? 0 : 110), y2 = to.y + (down ? 35 : 76)
  return `M ${x1} ${y1} C ${x1} ${y1 + (down ? 55 : -55)}, ${x2} ${y2 + (down ? -55 : 55)}, ${x2} ${y2}`
}
async function selectEntity(id) {
  selectedId.value = id
  await nextTick()
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
      <label>Find an entity <input v-model="search" type="search" placeholder="Invoice, Customer…"></label>
      <label>Connections <select v-model="kind" aria-label="Connections"><option value="all">All connections</option><option value="schema">Schema references</option><option value="mapping">Value flows</option></select></label>
      <div class="zoom" role="group" aria-label="Graph zoom">
        <button type="button" class="secondary" :disabled="zoom <= .5" aria-label="Zoom out" @click="zoom = Math.max(.5, zoom - .25)">−</button>
        <button type="button" class="secondary" aria-label="Reset zoom" @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" class="secondary" :disabled="zoom >= 2" aria-label="Zoom in" @click="zoom = Math.min(2, zoom + .25)">+</button>
      </div>
    </div>
    <p class="legend"><span class="schema-key">— Schema reference</span><span class="mapping-key">┄ Value flow</span><span class="muted">Models come from OpenAPI; value flows come from Necto mappings.</span></p>
    <p v-if="mappingError" class="muted" role="status">{{ mappingError }} Schema references are still available.</p>
    <p v-else-if="!mappings.length" class="muted">No value mappings loaded. Schema references are available independently.</p>
    <p v-if="filtered.length > 100" class="muted" role="status">Showing the first 100 of {{ filtered.length }} matching entities. Refine the search to see others.</p>
    <div class="graph-workspace">
      <div class="graph-canvas" tabindex="0" aria-label="Scrollable entity graph">
        <svg v-if="positions.length" :width="width * zoom" :height="height * zoom" :viewBox="`0 0 ${width} ${height}`" role="group" aria-label="Entity relationships">
          <defs><marker :id="markerId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#718c80" /></marker></defs>
          <path v-for="edge in edges" :key="edge.id" :d="curve(edge)" fill="none" :stroke="edge.kind === 'mapping' ? '#ad7923' : '#759b8a'" :stroke-dasharray="edge.kind === 'mapping' ? '6 5' : undefined" :stroke-width="selectedId && connected(edge) ? 3 : 1.5" :opacity="connected(edge) ? .9 : .15" :marker-end="`url(#${markerId})`">
            <title>{{ names.get(edge.from) }} → {{ names.get(edge.to) }} · {{ edge.label }} · {{ edge.kind === 'schema' ? 'Schema reference' : 'Value flow' }}</title>
          </path>
          <foreignObject v-for="node in positions" :key="node.id" :x="node.x" :y="node.y" width="220" height="80">
            <button type="button" class="entity-node" :class="{ active: selectedId === node.id }" :aria-pressed="selectedId === node.id" :aria-label="'Inspect entity ' + node.name" @click="selectEntity(node.id)">
              <strong :title="node.name">{{ node.name }}</strong><small>{{ node.endpoints.length }} endpoints</small>
            </button>
          </foreignObject>
        </svg>
        <p v-else class="muted empty">{{ search ? 'No entities match your search.' : 'No object schemas found in request bodies or successful responses, or in OpenAPI components.' }}</p>
      </div>
      <aside class="entity-details" aria-label="Selected entity details">
        <template v-if="selected">
          <h3 ref="detailsTitle" tabindex="-1" aria-live="polite">{{ selected.name }}</h3>
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
              <button type="button" @click="selectEntity(edge.from === selectedId ? edge.to : edge.from)">{{ names.get(edge.from) }} → {{ names.get(edge.to) }}</button>
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
.zoom { display: flex; gap: .25rem; margin-left: auto; }
.legend { display: flex; flex-wrap: wrap; gap: .65rem; font-size: .78rem; }
.schema-key { color: #38684f; }.mapping-key { color: #805914; }
.graph-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 21rem); border: 1px solid var(--line); border-radius: .75rem; overflow: hidden; background: var(--surface); }
.graph-canvas { min-width: 0; height: 65vh; min-height: 26rem; overflow: auto; background-color: #f6f9f7; background-image: radial-gradient(#d4ded8 1px, transparent 1px); background-size: 18px 18px; }
svg { display: block; }
.entity-node { width: 100%; height: 76px; display: flex; flex-direction: column; justify-content: center; align-items: start; padding: .8rem 1rem; border: 1px solid #a5bdae; border-radius: .65rem; background: var(--surface); box-shadow: 0 3px 9px #1c4b3210; text-align: left; }
.entity-node:hover { border-color: var(--accent); background: var(--accent-soft); }
.entity-node.active { border: 2px solid var(--accent); background: var(--accent-soft); }
.entity-node strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }
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
