<script setup>
import { onMounted, onScopeDispose, ref, useId, watch } from 'vue'
const props = defineProps({ operationKey: String })
const emit = defineEmits(['pin'])
const pinned = ref(false)
const wide = ref(false)
const dialog = ref(null)
const trigger = ref(null)
const id = useId()
const pinnedContent = ref(null)
const dialogContent = ref(null)
function pin(value) { pinned.value = value; dialog.value?.close(); emit('pin', value) }
function close() { dialog.value?.close(); trigger.value?.focus() }
watch(() => props.operationKey, () => dialog.value?.close())
let media
const resize = () => { wide.value = media.matches; if (!wide.value) pin(false) }
onMounted(() => { media = matchMedia('(min-width: 1200px)'); resize(); media.addEventListener('change', resize) })
onScopeDispose(() => media?.removeEventListener('change', resize))
</script>
<template>
  <aside class="next-requests" :class="{ pinned }" aria-label="Next request">
    <template v-if="pinned">
      <header><strong>Next request</strong><button type="button" class="secondary" @click="pin(false)">Unpin</button></header>

    </template>
    <div v-show="pinned" ref="pinnedContent"></div>
    <button v-if="!pinned" ref="trigger" type="button" class="secondary next-request-trigger" aria-haspopup="dialog" :aria-controls="id" @click="dialog.showModal()">Next request</button>
    <Teleport to="body">
      <dialog :id="id" ref="dialog" class="next-request-dialog" :aria-labelledby="id + '-title'" @click="$event.target === dialog && close()" @close="trigger?.focus()">
        <header><h3 :id="id + '-title'">Next request</h3><button v-if="wide" type="button" class="secondary" @click="pin(true)">Pin beside response</button><button type="button" class="secondary" aria-label="Close next requests" @click="close">Close</button></header>
        <div ref="dialogContent"></div>
      </dialog>
    </Teleport>
    <Teleport v-if="pinnedContent && dialogContent" :to="pinned ? pinnedContent : dialogContent"><slot /></Teleport>
  </aside>
</template>
<style scoped>
.next-requests { min-width: 0; }
.next-request-trigger { font-size: .8rem; }
.next-requests > header, .next-request-dialog > header { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
.next-requests > header { font-size: .8rem; }
.next-request-dialog { width: min(36rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); padding: 1rem; border: 1px solid var(--line); border-radius: .65rem; color: inherit; background: var(--canvas); overflow: auto; }
.next-request-dialog h3 { margin: 0; font-size: 1rem; }
.next-request-dialog::backdrop { background: #14251d55; }
</style>
