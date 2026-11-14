<script setup>
import TransferPreview from './TransferPreview.vue'
import { computed, ref } from 'vue'
import {
  exportWorkspace,
  inspectWorkspace
} from './workspace.js'
const props = defineProps({ importDocument: Function, operations: Array })
const includeBodies = ref(false),
  preview = ref(null),
  message = ref(''),
  error = ref('')
const unavailable = computed(
  () =>
    preview.value?.entries
      .flatMap((entry) => entry.value.scenarios ?? [])
      .flatMap((scenario) => scenario.steps)
      .filter(
        (step) =>
          !props.operations?.some(
            (operation) => operation.key === step.operationKey
          )
      ).length ?? 0
)
async function readFile(file, limit) {
  if (!file) throw new Error('Choose a file.')
  if (file.size > limit)
    throw new Error(`File exceeds ${limit / 1024 / 1024} MB.`)
  return file.text()
}
function download() {
  try {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            exportWorkspace(localStorage, includeBodies.value),
            null,
            2
          )
        ],
        { type: 'application/json' }
      )
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'necto-workspace.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) {
    error.value = cause.message
  }
}
async function inspect(event) {
  try {
    preview.value = inspectWorkspace(
      await readFile(event.target.files[0], 2 * 1024 * 1024),
      localStorage
    )
    error.value = ''
  } catch (cause) {
    error.value = cause.message
    preview.value = null
  }
}
function imported(count) { message.value = `Imported ${count} items. Available now without reloading.`; preview.value = null }
async function loadDocument(event) {
  try {
    await props.importDocument(
      await readFile(event.target.files[0], 5 * 1024 * 1024)
    )
    message.value = 'API document loaded for this session.'
    error.value = ''
  } catch (cause) {
    error.value = cause.message
  }
}
</script>
<template>
  <section class="workspace-settings">
    <h3>Workspace</h3>
    <p>
      Transfer saved requests, scenarios, presets and API connections.
      Authentication credentials and uploaded files are excluded. Sensitive
      field names are removed.
    </p>
    <label
      ><input v-model="includeBodies" type="checkbox" /> Include request bodies
      and form values</label
    >
    <p v-if="includeBodies">
      Review the exported file before sharing: arbitrary text and business data
      may contain secrets.
    </p>
    <button type="button" @click="download">Export workspace</button>
    <label
      >Import workspace JSON<input
        type="file"
        accept=".json,application/json"
        @change="inspect"
    /></label>
    <div v-if="preview">
      <p v-if="unavailable">
        {{ unavailable }} steps refer to operations outside the current catalog.
        Enable the matching API before running them.
      </p>
      <TransferPreview :workspace="preview" @applied="imported" />
    </div>
    <h3>OpenAPI document</h3>
    <p>
      Load JSON or YAML for this session. Supports Swagger 2.0 conversion,
      OpenAPI 3.0/3.1 and common 3.2 operations. External references require
      HTTP(S) access and CORS; credentials are omitted.
    </p>
    <label
      >Local API document<input
        type="file"
        accept=".json,.yaml,.yml"
        @change="loadDocument"
    /></label>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.workspace-settings {
  display: grid;
  gap: 0.65rem;
  padding: 1rem;
  max-width: 50rem;
}
.workspace-settings h3,
.workspace-settings p {
  margin: 0;
}
.workspace-settings p {
  font-size: 0.85rem;
  color: var(--muted);
}
label {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
input[type='file'] {
  max-width: 100%;
}
button {
  justify-self: start;
}
</style>
