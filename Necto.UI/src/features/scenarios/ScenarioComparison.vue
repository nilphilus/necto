<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import TracePayload from './TracePayload.vue'
import { pathLabel } from './scenario.js'
import { traceSteps } from './trace.js'

const props = defineProps({ steps: { type: Array, required: true }, pending: Boolean })
defineEmits(['inspect'])
const cards = computed(() => traceSteps(props.steps))
const content = ref(null)
const hovered = ref('')
const focused = ref('')
const pinned = ref('')
const active = computed(() => hovered.value || pinned.value || focused.value)
const curves = ref([])
let observer

function measure() {
  if (!active.value || !content.value) {
    curves.value = []
    return
  }
  const bounds = content.value.getBoundingClientRect()
  const anchors = [...content.value.querySelectorAll('[data-trace-source]')]
    .filter(anchor => anchor.dataset.traceSource === active.value)
  const origin = anchors.find(anchor => anchor.dataset.traceRole === 'source')
  if (!origin) {
    curves.value = []
    return
  }
  const from = origin.getBoundingClientRect()
  const x1 = from.right - bounds.left
  const y1 = (from.top + from.bottom) / 2 - bounds.top
  curves.value = anchors.filter(anchor => anchor !== origin).map(anchor => {
    const to = anchor.getBoundingClientRect()
    const x2 = to.left - bounds.left
    const y2 = (to.top + to.bottom) / 2 - bounds.top
    const bend = Math.max(18, Math.min(72, (x2 - x1) / 3))
    const lift = Math.min(65, Math.min(y1, y2) - 8)
    return { color: origin.style.getPropertyValue('--binding-color'),
      path: `M ${x1} ${y1} C ${x1 + bend} ${y1 - lift}, ${x2 - bend} ${y2 - lift}, ${x2} ${y2}` }
  })
}

watch([active, cards], measure, { flush: 'post' })
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(content.value)
})
onUnmounted(() => observer?.disconnect())

function anchorAttributes(binding, role) {
  return { 'data-trace-source': binding.id, 'data-trace-role': role, style: { '--binding-color': binding.color },
    'aria-pressed': pinned.value === binding.id,
    onClick: () => { pinned.value = pinned.value === binding.id ? '' : binding.id },
    onPointerenter: () => { hovered.value = binding.id },
    onPointerleave: () => { hovered.value = '' },
    onFocus: () => { focused.value = binding.id },
    onBlur: () => { focused.value = '' } }
}

async function resizeTrace() {
  await nextTick()
  measure()
}
</script>

<template>
  <div class="trace-scroll" tabindex="0" aria-label="Scenario requests and responses, scroll horizontally"
    @keydown.esc="pinned = ''; hovered = ''; focused = ''">
    <div ref="content" class="trace-content" @toggle.capture="resizeTrace">
      <article v-for="({ step, request, inputs, outputs }, index) in cards" :key="index" class="trace-step">
        <header>
          <button type="button" class="secondary" :disabled="pending" @click="$emit('inspect', index)">
            <span class="method" :data-method="step.operation.method">{{ step.operation.method }}</span>
            {{ index + 1 }}. {{ step.operation.name }}
          </button>
          <span class="muted">{{ step.status }}<template v-if="step.elapsed !== undefined"> · {{ step.elapsed }} ms</template></span>
          <code>{{ step.operation.path }}</code>
          <small v-if="step.error" class="error">{{ step.error }}</small>
        </header>
        <div class="trace-columns">
          <section class="trace-column">
            <h4>Request</h4>
            <template v-if="request">
              <code class="request-url">{{ request.url }}</code>
              <button v-for="binding in inputs" :key="binding.target" type="button" class="binding"
                :class="{ active: active === binding.id }" v-bind="anchorAttributes(binding, 'target')">
                <span>{{ binding.target }}</span><code>{{ binding.value }}</code>
              </button>
              <details v-if="Object.keys(request.headers).length">
                <summary>Headers</summary>
                <TracePayload :value="request.headers" />
              </details>
              <TracePayload v-if="request.body !== undefined" :value="request.body" />
            </template>
            <p v-else class="muted">No request sent.</p>
          </section>
          <section class="trace-column">
            <h4>Response <span v-if="step.httpStatus !== undefined">{{ step.httpStatus }}</span></h4>
            <button v-for="binding in outputs" :key="binding.id" type="button" class="binding"
              :class="{ active: active === binding.id }" v-bind="anchorAttributes(binding, 'source')">
              <span>{{ pathLabel(binding.path) }}</span><code>{{ binding.value }}</code>
            </button>
            <TracePayload v-if="step.response && (step.response.json !== undefined || step.response.text)"
              :value="step.response.json" :text="step.response.text" />
            <p v-else class="muted">{{ step.response ? 'Empty response body.' : 'No response received.' }}</p>
          </section>
        </div>
      </article>
      <svg v-if="curves.length" class="trace-links" aria-hidden="true">
        <g v-for="curve in curves" :key="curve.path" fill="none" stroke-linecap="round">
          <path :d="curve.path" stroke="white" stroke-width="5" />
          <path :d="curve.path" :stroke="curve.color" stroke-width="2.5" />
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.trace-scroll { overflow-x: auto; min-width: 0; padding: .4rem .25rem .75rem; }
.trace-content { position: relative; display: flex; align-items: start; gap: 1rem; width: max-content; }
.trace-step { display: grid; width: 36rem; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: .65rem; background: var(--surface); }
.trace-step header { display: flex; align-items: center; flex-wrap: wrap; gap: .35rem .6rem; padding: .65rem; border-bottom: 1px solid var(--line); font-size: .8rem; }
.trace-step header button { text-align: left; }
.trace-step header > code, .trace-step header small { flex-basis: 100%; }
.trace-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.trace-column { display: grid; align-content: start; gap: .5rem; min-width: 0; padding: .65rem; font-size: .8rem; }
.trace-column + .trace-column { border-left: 1px solid var(--line); }
.trace-column h4, .trace-column p { margin: 0; }
.trace-column h4 span { margin-left: .25rem; color: var(--muted); }
.trace-column summary { cursor: pointer; }
.request-url { color: var(--muted); }
.binding { position: relative; display: grid; justify-items: start; gap: .2rem; min-width: 0; padding: .3rem .5rem; border-left: .22rem solid var(--binding-color); border-radius: .25rem; background: color-mix(in srgb, var(--binding-color) 12%, white); text-align: left; }
.binding span { color: var(--binding-color); }
.binding.active { outline: 1px solid var(--binding-color); z-index: 2; }
.binding code { overflow-wrap: anywhere; white-space: pre-wrap; }
.trace-links { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
@media (max-width: 650px) {
  .trace-step { width: 30rem; }
}
</style>
