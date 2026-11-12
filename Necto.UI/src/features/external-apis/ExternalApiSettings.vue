<script setup>
import { reactive, ref } from 'vue'
const props = defineProps({ connections: Array, statuses: Map, storageError: String, save: Function, remove: Function, test: Function })
const show = defineModel('show', { type: Boolean })
const blank = () => ({ id: '', name: '', openApiUrl: '', endpointMappingsUrl: '', apiBaseUrl: '', usePresets: false })
const draft = reactive(blank())
const editing = ref('')
const error = ref('')
function reset() { Object.assign(draft, blank()); editing.value = ''; error.value = '' }
function edit(entry) { Object.assign(draft, entry); editing.value = entry.id; error.value = '' }
function save() {
  try { props.save({ ...draft }, editing.value); reset() }
  catch (cause) { error.value = cause.message }
}
function remove(id) { props.remove(id); if (editing.value === id) reset() }
</script>
<template>
  <section class="external-settings preset-panel" aria-labelledby="external-settings-title">
    <h3 id="external-settings-title">External APIs</h3>
    <label class="external-toggle"><input v-model="show" type="checkbox" role="switch"> Show external APIs</label>
    <p class="muted">Connect APIs that expose OpenAPI and Necto mappings.</p>
    <ul v-if="connections.length" class="connection-list">
      <li v-for="entry in connections" :key="entry.id">
        <div><strong>{{ entry.name }}</strong> <code>{{ entry.id }}</code><small>{{ entry.openApiUrl }}</small>
          <span v-if="statuses.get(entry.id)?.pending" role="status">Connecting…</span>
          <span v-else-if="statuses.get(entry.id)?.error" class="error" role="status">{{ statuses.get(entry.id).error }}</span>
          <span v-else-if="statuses.get(entry.id)?.ready" role="status">Ready · {{ statuses.get(entry.id).mappingCount }} mappings</span>
          <span v-else class="muted">Not loaded</span>
        </div>
        <div class="connection-actions">
          <button type="button" class="secondary" :disabled="statuses.get(entry.id)?.pending" @click="test(entry.id)">Test {{ entry.name }}</button>
          <button type="button" class="secondary" @click="edit(entry)">Edit {{ entry.name }}</button>
          <button type="button" class="secondary" @click="remove(entry.id)">Remove {{ entry.name }}</button>
        </div>
      </li>
    </ul>
    <form class="connection-form" @submit.prevent="save">
      <h4>{{ editing ? 'Edit connection' : 'Add an API' }}</h4>
      <label>Name <input v-model="draft.name" required placeholder="Billing API"></label>
      <label>API ID <input v-model="draft.id" required :readonly="Boolean(editing)" pattern="[a-z][a-z0-9-]*" placeholder="billing"></label>
      <small class="muted">Stable ID used by cross-API mappings. The host API is called <code>local</code>.</small>
      <label>OpenAPI URL <input v-model="draft.openApiUrl" type="url" required placeholder="https://billing.example/openapi/v1.json"></label>
      <label>Necto mappings URL <input v-model="draft.endpointMappingsUrl" type="url" required placeholder="https://billing.example/necto/endpoint-mappings"></label>
      <label>API base URL (optional) <input v-model="draft.apiBaseUrl" type="url" placeholder="https://billing.example/api"></label>
      <small class="muted">Leave empty to use OpenAPI servers, or the OpenAPI URL's origin if none are declared. A base URL overrides the document's servers.</small>
      <label class="check"><input v-model="draft.usePresets" type="checkbox"> Apply active request presets to this API, including their headers</label>
      <p class="muted">Requests run in your browser. The external API must allow this UI's origin through CORS. Metadata is fetched without cookies or request presets.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="connection-actions"><button class="primary" type="submit">{{ editing ? 'Save connection' : 'Add API' }}</button><button v-if="editing" type="button" class="secondary" @click="reset">Cancel</button></div>
    </form>
    <p v-if="storageError" class="error" role="alert">{{ storageError }}</p>
  </section>
</template>
<style scoped>
.external-settings { width: 100%; }
.external-toggle { display: flex; align-items: center; gap: .5rem; font-weight: 650; }
.external-toggle input { appearance: none; display: flex; align-items: center; flex-shrink: 0; width: 2.25rem; height: 1.3rem; margin: 0; padding: .13rem; border: 1px solid #9bad9f; border-radius: 999px; background: #cbd8cf; cursor: pointer; }
.external-toggle input::before { content: ''; width: .94rem; height: .94rem; border-radius: 50%; background: white; box-shadow: 0 1px 3px #0003; }
.external-toggle input:checked { justify-content: flex-end; background: var(--accent); border-color: var(--accent); }
h4 { margin: .35rem 0; }
.connection-list { width: 100%; list-style: none; padding: 0; margin: 0; }
.connection-list li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; padding: .7rem 0; border-bottom: 1px solid var(--line); }
.connection-list li > div { min-width: 0; }
.connection-list small, .connection-list span { display: block; margin-top: .25rem; overflow-wrap: anywhere; font-size: .78rem; }
.connection-form { display: grid; gap: .65rem; width: 100%; }
.connection-form label { display: grid; gap: .3rem; width: 100%; }
.connection-form input:not([type="checkbox"]) { width: 100%; min-width: 0; }
.connection-form .check { display: flex; align-items: center; gap: .4rem; }
.connection-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
</style>
