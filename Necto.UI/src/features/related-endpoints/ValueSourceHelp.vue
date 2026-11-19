<script setup>
import { ref, useId } from 'vue'

const props = defineProps({ label: String, sources: { type: Array, required: true }, showTargets: Boolean })
const emit = defineEmits(['open-source'])
const dialog = ref(null)
const trigger = ref(null)
const titleId = useId()
const opened = ref(false)
let navigating = false

function open() {
  navigating = false
  opened.value = true
  dialog.value.showModal()
}

function closed() {
  opened.value = false
  if (!navigating) trigger.value?.focus()
}

function openSource(operation) {
  navigating = true
  dialog.value.close()
  emit('open-source', operation)
}
</script>

<template>
  <span v-if="sources.length" class="source-help">
    <button ref="trigger" class="secondary source-trigger" type="button" :aria-label="label" :title="label"
      aria-haspopup="dialog" @click="open">?</button>
    <Teleport to="body">
      <dialog ref="dialog" class="source-dialog" :aria-labelledby="titleId" @close="closed">
        <template v-if="opened">
          <header><h3 :id="titleId">{{ props.label }}</h3>
            <button type="button" class="secondary" @click="dialog.close()">Close</button>
          </header>
          <p>Look for the value in the response from one of these endpoints. Opening an endpoint leaves sending up to you.</p>
          <ul>
            <li v-for="source in sources" :key="source.id">
              <strong>{{ source.operation.name }}</strong>
              <small v-if="source.operation.apiId && source.operation.apiId !== 'local'">{{ source.operation.apiName }}</small>
              <code>{{ source.operation.method }} {{ source.operation.path }}</code>
              <small>
                <template v-if="showTargets">{{ source.name || 'Whole request body' }} ← </template>
                Response<template v-if="source.status"> {{ source.status }}</template> · <code>{{ source.path }}</code>
                · {{ source.origin === 'openapi' ? 'OpenAPI Link' : source.match === 'name' ? 'Necto suggestion' : 'Necto mapping' }}
              </small>
              <button type="button" class="secondary" :aria-label="'Open source ' + source.operation.name"
                @click="openSource(source.operation)">Open request</button>
            </li>
          </ul>
        </template>
      </dialog>
    </Teleport>
  </span>
</template>

<style scoped>
.source-help { display: inline-flex; flex: none; vertical-align: middle; }
.source-trigger { padding: .1rem .35rem; font-size: .8rem; line-height: 1.3; }
.source-dialog { width: min(34rem, calc(100vw - 2rem)); max-height: 80dvh; overflow: auto; overflow-wrap: anywhere; color: var(--text); background: var(--surface); border: 1px solid var(--line); border-radius: .65rem; padding: 1rem; }
.source-dialog::backdrop { background: #0005; }
header { display: flex; align-items: center; justify-content: space-between; gap: .6rem; }
h3 { margin: 0; font-size: 1rem; }
p, small { color: var(--muted); font-size: .8rem; }
ul { padding: 0; margin: 0; list-style: none; }
li { display: grid; gap: .3rem; padding-block: .65rem; border-block-start: 1px solid var(--line); font-size: .85rem; }
li button { justify-self: start; }
</style>
