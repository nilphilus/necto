<script setup>
import { computed, nextTick, ref } from 'vue'
import { resolveReference } from '../workbench/openapiReference.js'

const dialog = ref(null)
const context = ref(null)
const scope = ref('operation')
const operation = computed(() => {
  const { document, method, path } = context.value ?? {}
  return document && resolveReference(document, document.paths?.[path])?.[method]
})
const preview = computed(() => {
  if (scope.value === 'operation') return JSON.stringify(operation.value, null, 2)
  return Object.keys(context.value?.document ?? {}).join('\n')
})
let returnFocus
async function open(documentContext, trigger) {
  context.value = documentContext
  scope.value = 'operation'
  returnFocus = trigger
  await nextTick()
  if (!dialog.value.open) dialog.value.showModal()
}
function restoreFocus() {
  returnFocus?.focus()
  context.value = null
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="inspector-dialog" aria-label="OpenAPI Inspector" @close="restoreFocus">
    <template v-if="context">
      <header>
        <h2>OpenAPI Inspector</h2>
        <button class="secondary" type="button" aria-label="Close OpenAPI Inspector" autofocus
          @click="dialog.close()">×</button>
      </header>
      <div class="document-context">
        <strong>{{ context.document?.info?.title || 'OpenAPI document' }}</strong>
        <span v-if="context.document?.info?.version">API {{ context.document.info.version }}</span>
        <span v-if="context.document?.openapi">OpenAPI {{ context.document.openapi }}</span>
        <span>{{ context.source }}</span>
      </div>
      <div class="scope-controls">
        <button type="button" class="secondary" :aria-pressed="scope === 'operation'"
          @click="scope = 'operation'">{{ context.method.toUpperCase() }} {{ context.path }}</button>
        <button type="button" class="secondary" :aria-pressed="scope === 'document'"
          @click="scope = 'document'">Whole document</button>
      </div>
      <pre v-if="preview">{{ preview }}</pre>
      <p v-else role="status">This operation is unavailable in the selected OpenAPI document.</p>
    </template>
  </dialog>
</template>

<style scoped>
.inspector-dialog { width: min(58rem, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); color: var(--text, inherit); background: var(--surface); border: 1px solid var(--line); border-radius: .75rem; }
.inspector-dialog::backdrop { background: #15251c70; }
header, .document-context, .scope-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; }
header { justify-content: space-between; }
h2 { margin: 0; font-size: 1.1rem; }
.document-context { margin-block: .65rem; color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
.scope-controls { margin-bottom: .6rem; }
.scope-controls [aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
pre { overflow: auto; max-height: 66dvh; padding: .7rem; background: var(--subtle); }
</style>
