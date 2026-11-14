<script setup>
import { ref } from 'vue';
import { exportScenario } from './transfers.js';
const props = defineProps({ scenario: Object, apiUrl: String });
const dialog = ref(null),
  bodies = ref(false),
  error = ref('');
function download() {
  try {
    const data = exportScenario(
      localStorage,
      props.scenario.id,
      props.apiUrl,
      bodies.value
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'necto-scenario.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dialog.value.close();
  } catch (cause) {
    error.value = cause.message;
  }
}
</script>
<template>
  <button type="button" :disabled="!apiUrl" @click="dialog.showModal()">
    Export
  </button>
  <dialog ref="dialog" aria-label="Export scenario">
    <h3>Export {{ scenario.name }}</h3>
    <p>
      Exports only this scenario. Credentials and uploaded files are excluded.
    </p>
    <label
      ><input v-model="bodies" type="checkbox" /> Include request bodies and
      form values</label
    >
    <p v-if="bodies">
      Review the file before sharing; arbitrary business data may contain
      secrets.
    </p>
    <p v-else>
      Request bodies are empty in the exported template. Fill them before
      running.
    </p>
    <button type="button" @click="download">Download scenario</button
    ><button type="button" @click="dialog.close()">Cancel</button>
    <p v-if="error" role="alert">{{ error }}</p>
  </dialog>
</template>
<style scoped>
dialog {
  width: min(32rem, 94vw);
  max-height: 85dvh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  padding: 1rem;
  color: var(--text);
  background: var(--surface);
}
dialog::backdrop {
  background: #0006;
}
p {
  font-size: 0.85rem;
}
label {
  display: flex;
  gap: 0.5rem;
}
</style>
