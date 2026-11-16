<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ session: { type: Object, required: true } })
const emit = defineEmits(['tab'])
const dialog = ref(null)

watch(() => props.session, () => dialog.value?.close())
</script>

<template>
  <button type="button" class="secondary" aria-haspopup="dialog" @click="dialog.showModal()">
    Expand editor
  </button>
  <Teleport to="body">
    <dialog ref="dialog" class="expanded-body" aria-label="Request body">
      <header>
        <strong>Request body</strong>
        <button type="button" class="secondary" @click="dialog.close()">Close</button>
      </header>
      <textarea
        v-model="session.body"
        aria-label="Request body"
        spellcheck="false"
        autofocus
        @keydown.tab="emit('tab', $event)"
      />
    </dialog>
  </Teleport>
</template>

<style scoped>
.expanded-body {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  border: 0;
  border-radius: 0;
  padding: 0.75rem;
  background: var(--surface);
  color: inherit;
}
.expanded-body[open] {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.5rem;
}
.expanded-body header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.expanded-body textarea {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  resize: none;
  font-family: monospace;
}
</style>
