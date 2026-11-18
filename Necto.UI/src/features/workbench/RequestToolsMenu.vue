<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { canCaptureHistory } from './historySnapshot.js';
import RequestTools from './RequestTools.vue';
import { buildRequest } from '../request-runner/request.js';
import { requestSnippet } from './snippets.js';
const props = defineProps({
  operation: Object,
  session: Object,
  values: Map,
  configuration: Object,
  history: Object,
  prepare: Function
});
const emit = defineEmits(['edit-request', 'capture-requests']);
const trigger = ref(null),
  menu = ref(null),
  advanced = ref(null),
  open = ref(false),
  style = ref({}),
  feedback = ref('');
defineExpose({ revealInvalid: element => advanced.value.revealInvalid(element) })
const latest = computed(() => props.history?.forOperation(props.operation.key)[0]);
function captureLatest() {
  if (props.session.pending || !canCaptureHistory(latest.value)) return;
  close();
  emit('capture-requests', [latest.value]);
}
const prepared = computed(() => {
  try {
    return {
      request: props.prepare
        ? props.prepare(props.operation, props.session, props.values)
        : buildRequest(
            props.operation,
            props.configuration ?? {},
            props.session,
            props.values
          )
    };
  } catch (error) {
    return { error: error.message };
  }
});
async function toggle() {
  open.value = !open.value;
  feedback.value = '';
  if (open.value) {
    const rect = trigger.value.getBoundingClientRect();
    style.value = {
      top: `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - 360))}px`,
      left: `${Math.max(8, Math.min(rect.left, innerWidth - 300))}px`
    };
    await nextTick();
    menu.value?.querySelector('button:not([disabled])')?.focus();
  }
}
function resize() {
  if (open.value) close();
}
function close() {
  open.value = false;
  trigger.value?.focus();
}
function outside(event) {
  if (
    open.value &&
    !menu.value?.contains(event.target) &&
    !trigger.value?.contains(event.target)
  )
    open.value = false;
}
function inspect(section) {
  open.value = false;
  advanced.value.openSection(section);
}
async function copy() {
  if (prepared.value.error) return;
  try {
    await navigator.clipboard.writeText(requestSnippet(prepared.value.request));
    feedback.value = 'Copied current draft as cURL.';
  } catch {
    feedback.value = 'Clipboard unavailable. Open Code to select and copy.';
  }
}
watch(
  () => props.operation.key,
  () => {
    open.value = false;
  }
);
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  window.addEventListener('resize', resize);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('resize', resize);
});
</script>
<template>
  <button
    ref="trigger"
    type="button"
    class="secondary"
    :aria-expanded="open"
    aria-haspopup="true"
    @click="toggle"
  >
    Tools
  </button>
  <Teleport to="body"
    ><div
      v-if="open"
      ref="menu"
      class="tools-menu"
      :style="style"
      aria-label="Request tools menu"
      @keydown.esc.stop.prevent="close"
    >
      <strong>Quick actions</strong
      ><button type="button" :disabled="!!prepared.error" @click="copy">
        Copy as cURL · current draft</button
      ><small v-if="prepared.error"
        >Complete request inputs to enable copying.</small
      >
      <button v-if="canCaptureHistory(latest)" type="button" :disabled="session.pending" @click="captureLatest">
        Add last request to scenario…
      </button>
      <p v-if="feedback" role="status">{{ feedback }}</p>
      <strong>Inspect</strong
      ><button type="button" @click="inspect('Contract')">Contract</button
      ><button type="button" @click="inspect('Code')">
        Code · more languages</button
      ><button type="button" @click="inspect('History')">
        History ({{ history?.forOperation(operation.key).length ?? 0 }})
      </button>
      <button type="button" @click="inspect('Configure')">Configure request</button>
      <button v-if="session.bindings?.length" type="button" @click="inspect('Bindings')">Bindings ({{ session.bindings.length }})</button>


    </div></Teleport
  >
  <RequestTools
    ref="advanced"
    v-bind="props"
    hide-trigger
    @closed="target => (target ?? trigger)?.focus()" @edit-request="emit('edit-request')" @capture-requests="emit('capture-requests', $event)"
  />
</template>
<style scoped>
.tools-menu {
  position: fixed;
  z-index: 40;
  width: min(18rem, calc(100vw - 1rem));
  max-height: 70dvh;
  overflow: auto;
  display: grid;
  gap: 0.25rem;
  padding: 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 8px 25px #0003;
}
.tools-menu strong {
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  margin: 0.3rem;
}
.tools-menu button {
  text-align: left;
  padding: 0.5rem;
  font-size: 0.85rem;
}
.tools-menu button:hover {
  background: var(--accent-soft);
}
.tools-menu details button {
  display: block;
  width: 100%;
}
.tools-menu summary {
  cursor: pointer;
  padding: 0.5rem;
  font-size: 0.85rem;
}
.tools-menu small,
.tools-menu p {
  font-size: 0.75rem;
  color: var(--muted);
  margin: 0.2rem;
}
</style>
