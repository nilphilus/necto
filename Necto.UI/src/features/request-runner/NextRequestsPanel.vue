<script setup>
import { ref, useId, watch } from 'vue'
const props = defineProps({ operationKey: String, pinTarget: Object })
const pinned = defineModel('pinned', { type: Boolean, required: true })
let restoreFocus = true
function open() { restoreFocus = true; dialog.value.showModal() }
function closed() { if (restoreFocus) trigger.value?.focus(); restoreFocus = true }
function closeForSearch() {
  if (!dialog.value?.open) return
  restoreFocus = false
  dialog.value.close()
}
defineExpose({ closeForSearch })
const dialog = ref(null)
const trigger = ref(null)
const id = useId()
const pinnedContent = ref(null)
const dialogContent = ref(null)
function pin(value) { pinned.value = value; dialog.value?.close() }
function close() { dialog.value?.close(); trigger.value?.focus() }
watch(() => props.operationKey, () => dialog.value?.close())
</script>
<template>
  <Teleport :to="pinTarget || 'body'" :disabled="!pinned || !pinTarget">
  <aside class="next-requests" :class="{ pinned }" aria-label="Next request">
    <template v-if="pinned">
      <header><strong>Next request</strong><button type="button" class="secondary" @click="pin(false)">Unpin</button></header>

    </template>
    <div v-show="pinned" ref="pinnedContent"></div>
    <button v-if="!pinned" ref="trigger" type="button" class="secondary next-request-trigger" aria-haspopup="dialog" :aria-controls="id" @click="open">Next request</button>
    <Teleport to="body">
      <dialog :id="id" ref="dialog" class="next-request-dialog" :aria-labelledby="id + '-title'" @click="$event.target === dialog && close()" @close="closed">
        <header><h3 :id="id + '-title'">Next request</h3><button type="button" class="secondary" @click="pin(true)">Pin to response</button><button type="button" class="secondary" aria-label="Close next requests" @click="close">Close</button></header>
        <div ref="dialogContent"></div>
      </dialog>
    </Teleport>
    <Teleport v-if="pinnedContent && dialogContent" :to="pinned ? pinnedContent : dialogContent"><slot /></Teleport>
  </aside>
  </Teleport>
</template>
<style scoped>
.next-requests { min-width: 0; }
.next-requests.pinned { --value-suggestions-position: static; }
.next-request-trigger { font-size: .8rem; }
.next-requests > header, .next-request-dialog > header { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
.next-requests > header { font-size: .8rem; }
.next-request-dialog { width: min(36rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); padding: 1rem; border: 1px solid var(--line); border-radius: .65rem; color: inherit; background: var(--canvas); overflow: auto; }
.next-request-dialog h3 { margin: 0; font-size: 1rem; }
.next-request-dialog::backdrop { background: #14251d55; }
</style>
