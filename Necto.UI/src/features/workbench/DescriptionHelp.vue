<script setup>
import { nextTick, ref, useId, watch } from 'vue'
import MarkdownText from './MarkdownText.vue'
const props = defineProps({ label: String, summary: String, description: String, context: String, triggerText: String })
const dialog = ref(null), trigger = ref(null), opened = ref(false), titleId = useId()
function open() { opened.value = true; dialog.value.showModal() }
async function closed() { opened.value = false; await nextTick(); trigger.value?.focus() }
watch(() => [props.label, props.summary, props.description], () => dialog.value?.close())
</script>
<template>
  <span v-if="summary || description || context" class="description-help">
    <button ref="trigger" class="secondary description-trigger" :class="{ 'text-trigger': triggerText }" type="button" :aria-label="label" :title="label" aria-haspopup="dialog" @click="open">{{ triggerText || 'ⓘ' }}</button>
    <Teleport to="body">
      <dialog ref="dialog" class="description-dialog" :aria-labelledby="titleId" @close="closed">
        <template v-if="opened">
          <header><h3 :id="titleId">{{ label }}</h3><button class="secondary" type="button" aria-label="Close description" @click="dialog.close()">Close</button></header>
          <p v-if="context" class="context">{{ context }}</p>
          <MarkdownText v-if="summary" :text="summary" />
          <MarkdownText v-if="description && description !== summary" :text="description" />
        </template>
      </dialog>
    </Teleport>
  </span>
</template>
<style scoped>
.description-help { display:inline-flex; vertical-align:middle; flex:none; }
.text-trigger { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.description-trigger.text-trigger { border:0; padding:0; background:none; font:inherit; }
.description-trigger { padding:.12rem .35rem; font-size:.9rem; line-height:1.3; }
.description-dialog { width:min(42rem, calc(100vw - 2rem)); max-height:80dvh; overflow:auto; color:var(--text); background:var(--surface); border:1px solid var(--line); border-radius:.65rem; padding:1rem; }
.description-dialog::backdrop { background:#0005; }
header { display:flex; gap:.75rem; align-items:center; justify-content:space-between; margin-bottom:.8rem; }
.context {color:var(--muted);font-size:.8rem}
h3 { margin:0; font-size:1rem; }
</style>
