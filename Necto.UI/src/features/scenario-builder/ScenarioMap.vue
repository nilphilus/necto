<script setup>
import { computed, ref } from 'vue'
import { dependencies, layers } from './model.js'
const props = defineProps({ blueprint: Object, selected: String, steps: Array })
const emit = defineEmits(['select'])
const zoom = ref(1)
const layout = computed(() => {
  let columns
  try { columns = layers(props.blueprint) } catch { columns = [props.blueprint.steps] }
  const rowHeight = props.blueprint.steps.some(step => step.delayMs !== undefined || step.waitFor) ? 156 : 132
  const rows = Math.max(1, ...columns.map(column => column.length)), height = Math.max(300, rows * rowHeight + 60), width = Math.max(480, columns.length * 260 + 50)
  const nodes = columns.flatMap((column, x) => column.map((step, y) => ({ step, x: 24 + x * 260, y: (height - column.length * rowHeight) / 2 + y * rowHeight })))
  const byId = new Map(nodes.map(node => [node.step.id, node]))
  const edges = nodes.flatMap(to => dependencies(to.step).flatMap(id => {
    const from = byId.get(id)
    if (!from) return []
    const x = from.x + 214, y = from.y + 46, tx = to.x, ty = to.y + 46
    return [{ key: id + ':' + to.step.id, from: from.step.label, to: to.step.label,
      data: to.step.inputs.some(input => input.source === 'response' && input.stepId === id),
      d: `M ${x} ${y} C ${x + 32} ${y}, ${tx - 32} ${ty}, ${tx} ${ty}` }]
  }))
  return { width, height, nodes, edges }
})
const states = computed(() => new Map((props.steps ?? []).map(step => [step.id, step])))
</script>
<template>
  <section class="scenario-map" aria-label="Scenario map">
    <header><strong>Scenario map</strong><span>Solid: response value · Dashed: run after</span><label>Zoom <select v-model.number="zoom"><option :value=".65">65%</option><option :value=".8">80%</option><option :value="1">100%</option></select></label></header>
    <div class="map-scroll" tabindex="0" aria-label="Scroll scenario map">
      <p v-if="!blueprint.steps.length" class="map-empty">Add requests to start. Independent steps run in parallel.<br>Connect them with “Run after” or a response input.</p>
      <div v-else :style="{ width: layout.width * zoom + 'px', height: layout.height * zoom + 'px' }">
        <div class="map-canvas" :style="{ width: layout.width + 'px', height: layout.height + 'px', transform: `scale(${zoom})` }">
          <svg :width="layout.width" :height="layout.height" aria-hidden="true">
            <defs><marker id="builder-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
            <path v-for="edge in layout.edges" :key="edge.key" :d="edge.d" class="edge" :class="{ data: edge.data }" marker-end="url(#builder-arrow)"><title>{{ edge.from }} → {{ edge.to }}</title></path>
          </svg>
          <button v-for="node in layout.nodes" :key="node.step.id" type="button" class="map-node" :data-step-id="node.step.id" :data-status="states.get(node.step.id)?.status" :aria-pressed="selected === node.step.id"
            :style="{ left: node.x + 'px', top: node.y + 'px' }" @click="emit('select', node.step.id)">
            <span class="node-top"><span class="method" :data-method="node.step.method">{{ node.step.method }}</span><span v-if="states.get(node.step.id)" class="node-state">{{ states.get(node.step.id).status }}</span><span v-else class="node-state">{{ dependencies(node.step).length ? 'After dependencies' : 'Start' }}</span></span>
            <strong>{{ node.step.label }}</strong><code>{{ node.step.path }}</code><span v-if="node.step.delayMs !== undefined || node.step.waitFor" class="node-inputs"><span v-if="node.step.delayMs !== undefined">Delay {{ node.step.delayMs }} ms</span><span v-if="node.step.waitFor">{{ node.step.delayMs !== undefined ? ' · ' : '' }}Wait for {{ node.step.waitFor.pointer || '(root)' }}</span><span v-if="states.get(node.step.id)?.attempt"> · {{ states.get(node.step.id).attempt }}/{{ states.get(node.step.id).maxAttempts }}</span></span>
            <span v-if="node.step.inputs.length" class="node-inputs">{{ node.step.inputs.length }} dynamic inputs<span v-if="node.step.inputs.some(input => input.source === 'human')"> · Human input</span></span>
          </button>
        </div>
      </div>
    </div>
    <details v-if="layout.edges.length" class="map-connections"><summary>Connections ({{ layout.edges.length }})</summary><ul><li v-for="edge in layout.edges" :key="edge.key">{{ edge.from }} → {{ edge.to }} · {{ edge.data ? 'response value' : 'wait for completion' }}</li></ul></details>
  </section>
</template>
<style scoped>
.scenario-map { display:flex; flex-direction:column; min-width:0; min-height:22rem; background:var(--surface); border:1px solid var(--line); border-radius:.65rem; overflow:hidden; }
header { display:flex; align-items:center; flex-wrap:wrap; gap:.4rem .8rem; padding:.6rem .8rem; border-bottom:1px solid var(--line); font-size:.8rem; }
header span { color:var(--muted); font-size:.7rem; } header label { margin-left:auto; display:flex; align-items:center; gap:.4rem; } header select { padding:.2rem; }
.map-scroll { flex:1; overflow:auto; min-height:20rem; background:radial-gradient(var(--line) 1px,transparent 1px); background-size:18px 18px; }
.map-canvas { position:relative; transform-origin:top left; }.map-canvas svg { position:absolute; inset:0; pointer-events:none; }
.edge { fill:none; stroke:#849e91; stroke-width:2; stroke-dasharray:5 4; }.edge.data { stroke:var(--accent); stroke-dasharray:none; }marker path { fill:var(--accent); }
.map-node { position:absolute; display:grid; gap:.35rem; width:214px; min-height:96px; padding:.65rem; border:1px solid #afc4b7; border-radius:.6rem; background:var(--surface); text-align:left; box-shadow:0 2px 6px #203b2810; }
.map-node[aria-pressed=true] { outline:2px solid var(--accent); background:var(--accent-soft); }
.map-node[data-status=completed] { border-color:#2d8868; }.map-node[data-status=failed] { border-color:#b83d40; background:#fff0ef; }.map-node[data-status=needs-input] { border-color:#bb842c; background:#fff6df; }.map-node[data-status=retry-wait],.map-node[data-status=delaying] { border-color:#8c7a48; background:#fff9ec; }.map-node[data-status=running] { box-shadow:0 0 0 3px #318d6c33; }
.node-top { display:flex; align-items:center; justify-content:space-between; gap:.3rem; }.node-inputs { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.node-state,.node-inputs { font-size:.65rem; color:var(--muted); }.map-node strong { font-size:.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.map-node code { font-size:.68rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.map-empty { padding:3rem 1.5rem; color:var(--muted); font-size:.9rem; line-height:1.7; text-align:center; }.map-connections { padding:.5rem .8rem; font-size:.75rem; border-top:1px solid var(--line); }.map-connections ul { margin:.4rem 0; padding-left:1rem; }
</style>
