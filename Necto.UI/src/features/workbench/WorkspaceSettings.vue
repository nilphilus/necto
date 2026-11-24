<script setup>
import ScenarioFolderSettings from '../scenario-folder/ScenarioFolderSettings.vue'
import TransferPreview from './TransferPreview.vue'
import { computed, ref } from 'vue'
import {
  exportWorkspace,
  inspectWorkspace
} from './workspace.js'
const props = defineProps({ importDocument: Function, operations: Array, documentSource: Object, restoreDocument: Function, folder:Object })
const documentAssociation = ref('separate'), workspaceName = ref('')
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
      await readFile(event.target.files[0], 5 * 1024 * 1024), event.target.files[0].name,
      { association: documentAssociation.value, workspaceName: workspaceName.value.trim() || event.target.files[0].name }
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
    <div class="workspace-column">
      <div class="workspace-card">
        <ScenarioFolderSettings :folder="folder" />
      </div>
      <section class="workspace-card" aria-labelledby="workspace-transfer-title">
        <h3 id="workspace-transfer-title">Workspace import and export</h3>
        <p>
          Transfer saved requests, scenarios, presets and API connections.
          Authentication credentials and uploaded files are excluded. Sensitive
          field names are removed.
        </p>
        <label class="workspace-checkbox">
          <input v-model="includeBodies" type="checkbox" />
          <span>Include request bodies and form values</span>
        </label>
        <p v-if="includeBodies">
          Review the exported file before sharing: arbitrary text and business data
          may contain secrets.
        </p>
        <button type="button" class="secondary" @click="download">Export workspace</button>
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
      </section>
    </div>
    <section class="workspace-card" aria-labelledby="workspace-document-title">
      <h3 id="workspace-document-title">OpenAPI document</h3>
      <p v-if="documentSource">Source: {{ documentSource.name }}<template v-if="documentSource.workspaceName"> · Workspace: {{ documentSource.workspaceName }}</template></p>
      <button v-if="documentSource?.kind === 'import'" type="button" @click="restoreDocument">Return to server document</button>
      <p>
        Load JSON or YAML for this session. Supports Swagger 2.0 conversion,
        OpenAPI 3.0/3.1 and common 3.2 operations. External references require
        HTTP(S) access and CORS; credentials are omitted.
      </p>
      <label>Document association
        <select v-model="documentAssociation">
          <option value="separate">Open in a separate workspace</option>
          <option value="current">Update the current API contract</option>
        </select>
      </label>
      <template v-if="documentAssociation === 'separate'">
        <label>API workspace name<input v-model="workspaceName" maxlength="200" placeholder="Defaults to file name" /></label>
        <p>Drafts, saved requests, scenarios, presets and server choices are separate. Use the same workspace name when reopening this API.</p>
      </template>
      <p v-else>Keep this API’s workspace and credentials. Existing workflows will use the imported contract and its servers.</p>
      <label
        >Local API document<input
          type="file"
          accept=".json,.yaml,.yml"
          @change="loadDocument"
      /></label>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>
  </section>
</template>
<style scoped>
.workspace-settings {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 0.85rem;
}
.workspace-column,
.workspace-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.65rem;
  min-width: 0;
}
.workspace-card {
  align-content: start;
  padding: 0.85rem;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: var(--surface);
}
@media (min-width: 680px) {
  .workspace-settings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
.workspace-checkbox {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
}
input, select {
  min-width: 0;
  max-width: 100%;
}
input[type='file'], select {
  width: 100%;
}
button {
  justify-self: start;
}
</style>
