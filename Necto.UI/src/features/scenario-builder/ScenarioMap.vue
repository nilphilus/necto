<script setup>
import { CARD_HEIGHT, CARD_WIDTH, routeConnections, placeConnectionControls } from './edgeRouting.js'
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { inputProducers } from './variables.js'
import { canRetryStep } from './runner.js'
import { layers } from './model.js'
import { allConnections, connectionKey, hasTiming } from './connections.js'
const props = defineProps({ blueprint: Object, selected: String, steps: Array, disabled: Boolean, stale: Boolean, activeConnection: String })
const emit = defineEmits(['select', 'inspect', 'add-first', 'connect', 'configure', 'create-next', 'retry'])
const zoom = ref(1),
  canvas = ref(null),
  drag = ref(null),
  fromChoice = ref(''),
  toChoice = ref('')
const connectionsList = ref(null)
const connectionFilter = ref('')
const hoveredConnection = ref('')
const focusedConnection = ref('')
const highlightedKey = computed(() => props.activeConnection || hoveredConnection.value || focusedConnection.value)
const highlightedEdge = computed(() => layout.value.routed.find(edge => edge.key === highlightedKey.value))
const visibleConnections = computed(() => {
  const query = connectionFilter.value.trim().toLowerCase()
  return layout.value.edges.filter((edge) =>
    `${edge.fromLabel} → ${edge.toLabel}`.toLowerCase().includes(query))
})
async function showConnections(unrouted = false) {
  cancel()
  if (unrouted) connectionFilter.value = ''
  if (!connectionsList.value.open) connectionsList.value.showModal()
  if (!unrouted) return
  await nextTick()
  connectionsList.value.querySelector('[data-unrouted]')?.focus()
}
function connectionDetails(edge) {
  const target = props.blueprint.steps.find((step) => step.id === edge.to)
  const inputs = (target?.inputs ?? []).filter((input) =>
    edge.from !== null && inputProducers(input, props.blueprint).includes(edge.from))
  return [
    inputs.length ? `Passes ${inputs.map((input) => input.name || input.pointer || 'body').join(', ')}` : '',
    edge.delayMs !== undefined ? `Delay ${edge.delayMs} ms` : '',
    edge.waitFor ? `Repeat ${target?.method ?? 'request'} until ${edge.waitFor.pointer || '(root)'} matches` : '',
  ].filter(Boolean).join(' · ')
}
const states = computed(() => new Map((props.steps ?? []).map((step) => [step.id, step])))
const layout = computed(() => {
  let columns
  try {
    columns = layers(props.blueprint)
  } catch {
    columns = [props.blueprint.steps]
  }
  const rows = Math.max(1, ...columns.map((column) => column.length)),
    baseHeight = Math.max(300, rows * 132 + 80),
    baseWidth = Math.max(600, (columns.length - 1) * 280 + 416)
  const nodes = columns.flatMap((column, x) =>
    column.map((step, y) => ({
      step,
      x: 170 + x * 280,
      y: (baseHeight - column.length * 132) / 2 + y * 132,
    }))
  )
  const pinned = nodes
    .filter((node) => node.step.position)
    .map((node) => ({ ...node.step.position, width: 214, height: 112 }))
  const used = [...pinned]
  for (const node of nodes) {
    if (node.step.position) Object.assign(node, node.step.position)
    else {
      while (
        used.some(
          (rect) =>
            node.x < rect.x + rect.width + 16 &&
            node.x + 230 > rect.x &&
            node.y < rect.y + rect.height + 16 &&
            node.y + 128 > rect.y
        )
      )
        node.y += 132
      used.push({ x: node.x, y: node.y, width: 214, height: 112 })
    }
  }
  const height = Math.max(baseHeight, ...nodes.map((node) => node.y + 150)),
    width = Math.max(baseWidth, ...nodes.map((node) => node.x + 250))
  const byId = new Map(nodes.map((node) => [node.step.id, node]))
  const connections = allConnections(props.blueprint)
  const routes = routeConnections(nodes, height, connections)
  const edges = connections.flatMap((edge, index) => {
    const from = byId.get(edge.from),
      to = byId.get(edge.to)
    if (!to || (edge.from !== null && !from)) return []
    const geometry = routes[index]
    return [
      {
        ...edge,
        key: connectionKey(edge.from, edge.to),
        fromLabel: from?.step.label ?? 'Start',
        toLabel: to.step.label,
        data: to.step.inputs.some((input) =>
          inputProducers(input, props.blueprint).includes(edge.from)
        ),
        ...(geometry ?? { d: '', x: 0, y: 0 }),
        routed: Boolean(geometry),
      },
    ]
  })
  const routed = edges.filter((edge) => edge.routed)
  let routeWidth = width,
    routeHeight = height
  for (const edge of routed)
    for (const point of edge.points) {
      routeWidth = Math.max(routeWidth, point.x + 26)
      routeHeight = Math.max(routeHeight, point.y + 26)
    }
  return { width: routeWidth, height: routeHeight, startY: height / 2, nodes, edges, routed }
})
const controls = computed(() => placeConnectionControls(layout.value.routed, [
  { x: 24, y: layout.value.startY - 24, width: 84, height: 48 },
  ...layout.value.nodes.map(({ x, y }) => ({ x, y, width: CARD_WIDTH, height: CARD_HEIGHT })),
], zoom.value))
const configurableEdges = computed(() => layout.value.routed.filter(edge => controls.value.has(edge.key)))
const hasListOnlyConnections = computed(() => configurableEdges.value.length < layout.value.edges.length)
function curve(x, y, tx, ty) {
  return `M ${x} ${y} C ${x + 36} ${y}, ${tx - 36} ${ty}, ${tx} ${ty}`
}
const ghost = computed(
  () => drag.value && curve(drag.value.sx, drag.value.sy, drag.value.x, drag.value.y)
)
function begin(event, from, sx, sy) {
  if (props.disabled || (event.button !== undefined && event.button !== 0)) return
  event.preventDefault()
  event.currentTarget.focus({ preventScroll: true })
  drag.value = {
    from,
    sx,
    sy,
    x: sx + 35,
    y: sy,
    pointer: event.pointerId,
    moved: false,
    target: null,
  }
  if (event.pointerId !== undefined) event.currentTarget.setPointerCapture(event.pointerId)
}
function targetAt(event) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-input-step]')
    ?.dataset.inputStep
}
function blankAt(event) {
  const hit = document.elementFromPoint(event.clientX, event.clientY)
  return (
    hit?.closest('.map-scroll') === canvas.value?.closest('.map-scroll') &&
    !hit?.closest('.node-wrap,.edge-settings,.map-start')
  )
}
function move(event) {
  if (!drag.value) return
  const bounds = canvas.value.getBoundingClientRect(),
    x = (event.clientX - bounds.left) / zoom.value,
    y = (event.clientY - bounds.top) / zoom.value
  Object.assign(drag.value, {
    x,
    y,
    moved: drag.value.moved || Math.hypot(x - drag.value.sx, y - drag.value.sy) > 6,
    target: targetAt(event),
    blank: blankAt(event),
  })
}
function finish(event) {
  if (!drag.value || drag.value.pointer === null) return
  const target = targetAt(event),
    state = drag.value
  if (state.moved) {
    drag.value = null
    if (target) emit('connect', { from: state.from, to: target })
    else if (blankAt(event)) {
      const bounds = canvas.value.getBoundingClientRect()
      emit('create-next', {
        from: state.from,
        position: {
          x: (event.clientX - bounds.left) / zoom.value,
          y: (event.clientY - bounds.top) / zoom.value - 46,
        },
      })
    }
  } else drag.value.pointer = null
}
function chooseTarget(id) {
  if (props.disabled || !drag.value) return
  const from = drag.value.from
  drag.value = null
  emit('connect', { from, to: id })
}
function select(id) {
  if (drag.value) chooseTarget(id)
  else emit('select', id)
}
function connectByForm() {
  cancel()
  if (toChoice.value) emit('connect', { from: fromChoice.value || null, to: toChoice.value })
}
function cancel() {
  drag.value = null
}
function configure(edge, event) {
  cancel()
  emit('configure', edge, event)
}
function escape(event) {
  if (event.key === 'Escape') cancel()
}
window.addEventListener('keydown', escape)
window.addEventListener('blur', cancel)
onScopeDispose(() => {
  window.removeEventListener('keydown', escape)
  window.removeEventListener('blur', cancel)
})
watch(() => props.disabled, cancel)
watch(
  () => props.blueprint.id,
  () => {
    cancel()
    fromChoice.value = ''
    toChoice.value = ''
    connectionFilter.value = ''
    hoveredConnection.value = ''
    focusedConnection.value = ''
    connectionsList.value?.close()
  }
)
watch(zoom, cancel)
watch(() => props.blueprint.steps.map((step) => step.id).join('|'), cancel)
</script>
<template>
  <section class="scenario-map" aria-label="Scenario map">
    <header>
      <strong>Scenario map</strong
      ><span v-if="blueprint.steps.length">Drag ● to a request or empty space. ⚙ configures a connection.</span
      ><button v-if="selected && blueprint.steps.some(step => step.id === selected)" type="button" class="secondary"
        :disabled="disabled || blueprint.steps.length >= 100"
        @click="emit('create-next', { from: selected })">Add next request</button>
      <button v-if="blueprint.steps.length" type="button" class="secondary"
        :disabled="disabled || blueprint.steps.length >= 100" @click="emit('add-first')">+ Add request</button>
      <slot name="actions" />
      <button v-if="blueprint.steps.length" type="button" class="secondary" aria-haspopup="dialog" @click="showConnections()">
        Connections ({{ layout.edges.length }})
      </button><label v-if="blueprint.steps.length"
        >Zoom
        <select v-model.number="zoom">
          <option :value="0.65">65%</option>
          <option :value="0.8">80%</option>
          <option :value="1">100%</option>
        </select></label
      >
    </header>
    <p v-if="hasListOnlyConnections" class="route-notice" role="status">
      Some connection controls are available in the list.
      <button type="button" class="secondary" @click="showConnections(true)">
        Show connections
      </button>
    </p>
    <p v-if="drag" class="connect-hint" role="status">
      Connect to a request or release on empty space. Source:
      {{ blueprint.steps.find((step) => step.id === drag.from)?.label ?? 'Start' }}.
      <button type="button" @click="cancel">Cancel (Esc)</button>
    </p>
    <div class="map-scroll" tabindex="0" aria-label="Scroll scenario map">
      <div v-if="!blueprint.steps.length" class="map-empty">
        <p>Choose the first endpoint in your scenario.</p>
        <button type="button" class="primary" :disabled="disabled" @click="emit('add-first')">+ Add request</button>
      </div>
      <div
        v-else
        :style="{ width: layout.width * zoom + 'px', height: layout.height * zoom + 'px' }"
      >
        <div
          ref="canvas"
          class="map-canvas"
          :style="{
            width: layout.width + 'px',
            height: layout.height + 'px',
            transform: `scale(${zoom})`,
          }"
          @pointermove="move"
          @pointerup="finish"
          @pointercancel="cancel"
        >
          <svg :width="layout.width" :height="layout.height" aria-hidden="true">
            <defs>
              <marker
                id="builder-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <path
              v-for="edge in layout.routed"
              :key="edge.key"
              :d="edge.d"
              :data-route="edge.key"
              class="edge"
              :class="{ data: edge.data, timed: hasTiming(edge), muted: highlightedEdge && edge.key !== highlightedKey,
                        hidden: highlightedEdge && edge.key === highlightedKey }"
              marker-end="url(#builder-arrow)"
            />
            <path v-if="highlightedEdge" :d="highlightedEdge.d" class="edge highlighted"
              :data-highlighted-route="highlightedEdge.key" marker-end="url(#builder-arrow)" />
            <path v-if="ghost" :d="ghost" class="edge ghost" />
          </svg>
          <div
            v-if="drag?.blank"
            class="new-request-hint"
            :style="{ left: drag.x + 'px', top: Math.max(20, drag.y - 46) + 'px' }"
          >
            + New request<br /><small>Release to choose an endpoint</small>
          </div>
          <div class="map-start" :style="{ top: layout.startY - 24 + 'px' }">
            <strong>Start</strong
            ><button
              type="button"
              class="port output"
              :disabled="disabled"
              aria-label="Connect from Start"
              @pointerdown="begin($event, null, 108, layout.startY)"
              @click="(event) => event.detail === 0 && begin(event, null, 108, layout.startY)"
            >
              ●
            </button>
          </div>
          <div
            v-for="node in layout.nodes"
            :key="node.step.id"
            class="node-wrap"
            :data-input-step="node.step.id"
            :style="{ left: node.x + 'px', top: node.y + 'px' }"
          >
            <button
              type="button"
              class="port input"
              :disabled="disabled"
              :aria-label="'Connect to ' + node.step.label"
              @click.stop="chooseTarget(node.step.id)"
            >
              ●
            </button>
            <button
              type="button"
              class="map-node"
              :data-step-id="node.step.id"
              :data-status="states.get(node.step.id)?.status"
              :class="{ 'drop-target': drag?.target === node.step.id }"
              :aria-pressed="selected === node.step.id"
              @click="select(node.step.id)"
            >
              <span class="node-top"
                ><span class="method" :data-method="node.step.method">{{
                  node.step.method || '?'
                }}</span
                ><span v-if="drag || !states.has(node.step.id)" class="node-state">{{
                  states.get(node.step.id)?.status ?? 'Request'
                }}</span></span
              >
              <strong>{{ node.step.label }}</strong
              ><code>{{ node.step.path || 'Choose endpoint…' }}</code
              ><span v-if="node.step.inputs.length" class="node-inputs"
                >{{ node.step.inputs.length }} dynamic inputs<span
                  v-if="node.step.inputs.some((input) => input.source === 'human')"
                >
                  · Human input</span
                ></span
              >
            </button>
            <button v-if="!drag && states.has(node.step.id)" type="button" class="node-response"
              :aria-label="'View response for ' + node.step.label" @click="emit('inspect', node.step.id)">
              {{ states.get(node.step.id).httpStatus ?? states.get(node.step.id).status }}
            </button>
            <button v-if="!drag && canRetryStep(states.get(node.step.id))" type="button" class="node-retry"
              :disabled="disabled || stale" :aria-label="'Retry step ' + node.step.label"
              :title="stale ? 'Retry unavailable because the scenario changed' : 'Retry this step'"
              @click="emit('retry', node.step.id)">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M13.5 5.5A5.5 5.5 0 1 0 13 11M13.5 2.5v3.5H10" />
              </svg>
            </button>
            <button
              type="button"
              class="port output"
              :disabled="disabled"
              :aria-label="'Connect from ' + node.step.label"
              @pointerdown="begin($event, node.step.id, node.x + 214, node.y + 46)"
              @click="
                (event) =>
                  event.detail === 0 && begin(event, node.step.id, node.x + 214, node.y + 46)
              "
            >
              ●
            </button>
          </div>
          <button
            v-for="edge in configurableEdges"
            :key="edge.key"
            type="button"
            class="edge-settings"
            :class="{ timed: hasTiming(edge), active: highlightedKey === edge.key }"
            :data-connection="edge.key"
            :style="{ left: controls.get(edge.key).x + 'px', top: controls.get(edge.key).y + 'px', width: 32 / zoom + 'px', height: 32 / zoom + 'px' }"
            :aria-label="'Configure connection ' + edge.fromLabel + ' → ' + edge.toLabel"
            :aria-description="connectionDetails(edge) || undefined"
            :title="
              [edge.fromLabel + ' → ' + edge.toLabel, connectionDetails(edge)].filter(Boolean).join(' · ')
            "
            @mouseenter="hoveredConnection = edge.key"
            @mouseleave="hoveredConnection = ''"
            @focus="focusedConnection = edge.key"
            @blur="focusedConnection = ''"
            @click="configure(edge, $event)"
          >
            {{ hasTiming(edge) ? '◷' : '⚙' }}
          </button>
        </div>
      </div>
    </div>
    <dialog ref="connectionsList" class="map-connections" aria-label="Connections">
      <header>
        <h3>Connections ({{ layout.edges.length }})</h3>
        <button type="button" class="secondary" @click="connectionsList.close()">Close</button>
      </header>
      <label>Filter connections
        <input v-model="connectionFilter" type="search" placeholder="Search by step name">
      </label>
      <form @submit.prevent="connectByForm">
        <label
          >From<select v-model="fromChoice" :disabled="disabled" aria-label="Connection from">
            <option value="">Start</option>
            <option v-for="step in blueprint.steps" :key="step.id" :value="step.id">
              {{ step.label }}
            </option>
          </select></label
        ><label
          >To<select v-model="toChoice" :disabled="disabled" aria-label="Connection to">
            <option value="" disabled>Choose request</option>
            <option v-for="step in blueprint.steps" :key="step.id" :value="step.id">
              {{ step.label }}
            </option>
          </select></label
        ><button type="submit" class="secondary" :disabled="disabled || !toChoice">Connect</button
        ><button
          type="button"
          class="secondary"
          :disabled="disabled || blueprint.steps.length >= 100"
          @click="() => {
            cancel()
            connectionsList.close()
            emit('create-next', { from: fromChoice || null })
          }"
        >
          Add connected request
        </button>
      </form>
      <ul class="connection-list" aria-label="Connection list">
        <li v-for="edge in visibleConnections" :key="edge.key">
          <button
            type="button"
            :data-unrouted="controls.has(edge.key) ? undefined : ''"
            @click="configure(edge, $event)"
          >
            <strong>{{ edge.fromLabel }} → {{ edge.toLabel }}</strong>
            <small v-if="connectionDetails(edge)">{{ connectionDetails(edge) }}</small>
          </button>
        </li>
      </ul>
      <p v-if="!visibleConnections.length">No matching connections.</p>
    </dialog>
  </section>
</template>
<style scoped>
.scenario-map {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 22rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.65rem;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.8rem;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.8rem;
}
header span {
  color: var(--muted);
  font-size: 0.7rem;
}
header label {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
header select {
  padding: 0.2rem;
}
.map-scroll {
  flex: 1;
  overflow: auto;
  min-height: 20rem;
  background: radial-gradient(var(--line) 1px, transparent 1px);
  background-size: 18px 18px;
}
.map-canvas {
  position: relative;
  transform-origin: top left;
}
.map-canvas svg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.route-notice {
  margin: 0.4rem 0.8rem;
  font-size: 0.72rem;
  color: var(--muted);
}
.edge {
  stroke-linejoin: round;
  fill: none;
  stroke: #849e91;
  stroke-width: 2;
  stroke-dasharray: 5 4;
}
.edge.muted { opacity: .3; }
.edge.hidden { visibility: hidden; }
.edge.highlighted {
  stroke: var(--accent);
  stroke-width: 4;
  stroke-dasharray: none;
  filter: drop-shadow(0 0 2px var(--surface));
}
.edge.data {
  stroke: var(--accent);
  stroke-dasharray: none;
}
.edge.timed {
  stroke: #96732e;
}
.ghost {
  stroke: #257f67;
  stroke-dasharray: 4 4;
}
marker path {
  fill: var(--accent);
}
.node-wrap {
  position: absolute;
  width: 214px;
}
.map-node {
  display: grid;
  gap: 0.35rem;
  width: 214px;
  height: 112px;
  min-height: 112px;
  padding: 0.65rem;
  border: 1px solid #afc4b7;
  border-radius: 0.6rem;
  background: var(--surface);
  text-align: left;
  box-shadow: 0 2px 6px #203b2810;
}
.map-node[aria-pressed='true'] {
  outline: 2px solid var(--accent);
  background: var(--accent-soft);
}
.map-node.drop-target {
  outline: 3px solid #318d6c;
}
.map-node[data-status='completed'] {
  border-color: #2d8868;
}
.map-node[data-status='failed'] {
  border-color: #b83d40;
  background: #fff0ef;
}
.map-node[data-status='needs-input'] {
  border-color: #bb842c;
  background: #fff6df;
}
.map-node[data-status='retry-wait'],
.map-node[data-status='delaying'] {
  border-color: #8c7a48;
  background: #fff9ec;
}
.map-node[data-status='running'] {
  box-shadow: 0 0 0 3px #318d6c33;
}
.node-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
}
.node-retry {
  position: absolute;
  z-index: 2;
  inset-block-start: .45rem;
  inset-inline-end: 3.4rem;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  color: var(--accent);
}
.node-response {
  position: absolute;
  right: .45rem;
  top: .35rem;
  border: 1px solid var(--line);
  border-radius: .3rem;
  background: var(--surface);
  color: var(--accent);
  font-size: .7rem;
  padding: .15rem .4rem;
}
.node-state,
.node-inputs {
  font-size: 0.65rem;
  color: var(--muted);
}
.map-node strong,
.map-node code,
.node-inputs {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.map-node strong {
  font-size: 0.82rem;
}
.map-node code {
  font-size: 0.68rem;
}
.port {
  position: absolute;
  z-index: 2;
  top: 34px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #afc4b7;
  border-radius: 50%;
  background: var(--surface);
  color: var(--accent);
  touch-action: none;
  font-size: 0.8rem;
}
.input {
  left: -12px;
}
.output {
  right: -12px;
}
.port:hover {
  background: var(--accent);
  color: white;
}
.map-start {
  position: absolute;
  left: 24px;
  width: 84px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 2rem;
  background: var(--accent-soft);
  font-size: 0.8rem;
}
.map-start .output {
  top: 12px;
}
.edge-settings {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #afc4b7;
  background: var(--surface);
  color: var(--accent);
  font-size: 1rem;
}
.edge-settings.timed {
  background: #fff5d8;
  border-color: #b79b55;
  color: #755018;
}
.edge-settings:hover, .edge-settings:focus-visible, .edge-settings.active {
  z-index: 4;
  outline: 2px solid var(--accent);
}
.new-request-hint {
  position: absolute;
  pointer-events: none;
  width: 214px;
  padding: 1rem 0.7rem;
  border: 2px dashed var(--accent);
  border-radius: 0.6rem;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 0.8rem;
  opacity: 0.9;
}
.connect-hint {
  position: absolute;
  z-index: 4;
  top: 3rem;
  left: 0.6rem;
  right: 0.6rem;
  pointer-events: none;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  box-shadow: 0 2px 8px #17342618;
  margin: 0;
  padding: 0.45rem 0.7rem;
  font-size: 0.75rem;
  background: var(--accent-soft);
}
.connect-hint button {
  pointer-events: auto;
  text-decoration: underline;
}
.map-empty {
  padding: 3rem 1.5rem;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.7;
  text-align: center;
}
.map-connections {
  width: min(38rem, calc(100vw - 1.5rem));
  max-height: calc(100dvh - 1.5rem);
  overflow: auto;
  padding: .85rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .65rem;
  font-size: .8rem;
}
.map-connections::backdrop { background: #0006; }
.map-connections header { justify-content: space-between; padding: 0 0 .65rem; margin-bottom: .65rem; }
.map-connections h3 { margin: 0; font-size: 1rem; }
.connection-list {
  max-height: min(45dvh, 24rem);
  overflow: auto;
  overscroll-behavior: contain;
  list-style: none;
  padding: .15rem;
  margin: .55rem 0 0;
}
.connection-list li + li { border-top: 1px solid var(--line); }
.connection-list button { display: grid; gap: .2rem; padding: .5rem; width: 100%; text-align: left; overflow-wrap: anywhere; }
.connection-list small { color: var(--muted); }
.map-connections form { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; margin: .55rem 0; }
.map-connections label { display: grid; gap: .25rem; min-width: 0; margin: 0; }
.map-connections select { max-width: min(14rem, 100%); padding: .3rem; }
</style>
