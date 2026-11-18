<script setup>
import { retainDraft, hasSensitiveBody } from '../workbench/sensitiveSchema.js'
import { requestExamples, applyRequestExample, draftSnapshot, restoreExampleDraft, exampleDrafts } from '../workbench/openapiExamples.js'
import { executionOptions } from '../workbench/executionOptions.js'
import { onWorkspaceImport } from '../workbench/workspaceUpdates.js'
import { payloadSnapshot } from '../workbench/body.js'
import { computed, ref, watch } from 'vue'
import { contextKey, fieldKey, jsonContent, supportedParameters } from './request.js'
import { applySample, readSamples } from './samples.js'

const props = defineProps({
  operation: { type: Object, required: true },
  session: { type: Object, required: true },
  values: { type: Map, required: true },
  storageKey: { type: String, required: true },
})

const saved = ref({ samples: [], defaultName: '' })
const name = ref('')
const editing = ref('')
const renameOnly = ref(false)
const deleting = ref('')
const selectedSample = computed(() => saved.value.samples.find(sample => sample.name === props.session.sampleName))
const selectedFields = ref([])
const makeDefault = ref(false)
const storeDialog = ref(null)
const storeOpen = ref(false)
const sensitiveBody = computed(() => hasSensitiveBody(props.operation, props.session))
const error = ref('')
const searchInput = ref(null)
const query = ref('')
const page = ref(0)
const pageSize = 3
const examples = computed(() => requestExamples(props.operation))
const examplesDialog = ref(null)
const exampleQuery = ref('')
const previewId = ref('')
const matchingExamples = computed(() => {
  const term = exampleQuery.value.trim().toLocaleLowerCase()
  return examples.value.filter(example => (example.name + ' ' + example.subtitle).toLocaleLowerCase().includes(term))
})
const previewExample = computed(() => matchingExamples.value.find(example => example.id === previewId.value) ?? matchingExamples.value[0])
const examplePreview = computed(() => {
  const value = previewExample.value?.value
  return (typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '').slice(0, 4000)
})
const originalDrafts = exampleDrafts
const payloads = computed(() => saved.value.samples)

function openExamples() {
  exampleQuery.value = ''
  previewId.value = props.session.exampleKey ?? ''
  examplesDialog.value?.showModal()
}
function useExample() {
  try {
    const snapshot = originalDrafts.get(props.session) ?? draftSnapshot(props.session)
    applyRequestExample(props.operation, props.session, previewExample.value)
    originalDrafts.set(props.session, snapshot)
    error.value = ''
    examplesDialog.value.close()
  } catch (cause) {
    error.value = cause.message
  }
}
function returnToDraft() {
  const snapshot=originalDrafts.get(props.session)
  if (snapshot) { restoreExampleDraft(props.session,snapshot);originalDrafts.delete(props.session) }
}
const isSelected = sample => !props.session.exampleKey && props.session.sampleName === sample.name
const matchingSamples = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return payloads.value.filter(sample => `${sample.name} ${sample.subtitle ?? ''}`.toLocaleLowerCase().includes(term))
})
const pageCount = computed(() => Math.ceil(matchingSamples.value.length / pageSize))
const visibleSamples = computed(() => matchingSamples.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
const fields = computed(() => supportedParameters(props.operation).map(parameter => {
  const key = fieldKey(parameter)
  const presetKey = contextKey(parameter)
  const fromPreset = props.values.has(presetKey)
  return { key, parameter, fromPreset, value: fromPreset ? props.values.get(presetKey) : props.session.fields[key] }
}).filter(field => field.value !== undefined && field.value !== ''))
try {
  saved.value = readSamples(localStorage, props.storageKey)
} catch {
  error.value = 'Could not load saved requests in this browser.'
}

onWorkspaceImport(() => props.storageKey, () => {
  try {
    const active = saved.value.samples.find(sample => sample.name === props.session.sampleName)
    const next = readSamples(localStorage, props.storageKey)
    if (active && JSON.stringify(active) !== JSON.stringify(next.samples.find(sample => sample.name === active.name))) props.session.sampleName = undefined
    saved.value = next; error.value = ''; showSelectedPage()
  } catch { error.value = 'Could not refresh imported saved requests.' }
})

function resetForm() {
  name.value = ''
  selectedFields.value = fields.value.filter(field => !field.fromPreset).map(field => field.key)
  makeDefault.value = false
}

function showSelectedPage() {
  const index = matchingSamples.value.findIndex(isSelected)
  page.value = index < 0 ? 0 : Math.floor(index / pageSize)
}

watch(() => props.session, () => {
  storeDialog.value?.close()
  examplesDialog.value?.close()
  query.value = ''
  showSelectedPage()
}, { immediate: true })

function turnPage(direction) {
  page.value = (page.value + direction + pageCount.value) % pageCount.value
}

function updateQuery(event) {
  query.value = event.target.value
  page.value = 0
}

function openStoreDialog(existing = '', rename = false) {
  resetForm()
  editing.value = typeof existing === 'string' ? existing : ''
  renameOnly.value = rename
  if (editing.value) { name.value = editing.value; makeDefault.value = saved.value.defaultName === editing.value }
  storeDialog.value.showModal()
  storeOpen.value = true
}

defineExpose({ openStoreDialog, openExamples, hasExamples: computed(() => examples.value.length > 0) })

function persist(update) {
  try {
    const next = update(readSamples(localStorage, props.storageKey))
    localStorage.setItem(props.storageKey, JSON.stringify(next))
    saved.value = next
    error.value = ''
    return true
  } catch (cause) {
    error.value = cause.message === 'A sample with that name already exists.' ? 'A saved request with that name already exists.' : 'Could not save requests in this browser.'
    return false
  }
}

function storeSample() {
  const sampleName = name.value.trim()
  if (!sampleName) {
    error.value = 'Enter a request name.'
    return
  }
  let policy, retained
  try { policy = executionOptions(props.session); retained = retainDraft(props.operation, props.session) } catch(cause) { error.value = cause.message; return }
  const sample = {
    ...policy,
    name: sampleName,
    ...payloadSnapshot(retained),
    assertions: props.session.assertions ?? [],
    fields: Object.fromEntries(fields.value.filter(field => selectedFields.value.includes(field.key))
      .map(field => [field.key, field.value])),
  }
  if (props.operation.requestBody) sample.body = retained.body
  if (persist(current => {
    if (current.samples.some(entry => entry.name === sampleName && entry.name !== editing.value)) {
      throw new Error('A sample with that name already exists.')
    }
    const original = current.samples.find(entry => entry.name === editing.value)
    const replacement = renameOnly.value && original ? { ...original, name: sampleName } : sample
    return {
      samples: original ? current.samples.map(entry => entry.name === editing.value ? replacement : entry) : [...current.samples, replacement],
      defaultName: makeDefault.value ? sampleName : current.defaultName === editing.value ? '' : current.defaultName,
    }
  })) {
    props.session.exampleKey = undefined
    originalDrafts.delete(props.session)
    props.session.sampleName = sampleName
    query.value = ''
    showSelectedPage()
    storeDialog.value.close()
  }
}

function loadSample(sampleName) {
  const sample = saved.value.samples.find(entry => entry.name === sampleName)
  if (!sample) return
  applySample(props.operation, props.session, sample)
  if (props.session.result) props.session.resultStale = true
  props.session.error = ''
  error.value = ''
}

function deleteSelected() {
  const sampleName = deleting.value
  if (persist(current => ({ samples: current.samples.filter(sample => sample.name !== sampleName), defaultName: current.defaultName === sampleName ? '' : current.defaultName }))) {
    if (props.session.sampleName === sampleName) props.session.sampleName = ''
    deleting.value = ''; query.value = ''; page.value = 0
  }
}

function toggleDefault(sampleName) {
  persist(current => ({
    ...current,
    defaultName: current.defaultName === sampleName ? '' : sampleName,
  }))
}
</script>

<template>
  <section v-if="payloads.length || (error && !storeOpen)" class="samples" aria-label="Saved requests">
    <div v-if="payloads.length" class="sample-toolbar">
      <strong>Saved requests</strong>
      <div class="sample-controls">
        <button type="button" class="secondary icon-button"
          aria-label="Focus saved request search" title="Search saved requests" @click="searchInput?.focus()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></svg>
        </button>
        <input ref="searchInput" :value="query" type="search" aria-label="Search by name"
          placeholder="Search by name" @input="updateQuery"
          @keydown.enter.stop.prevent @keydown.esc.stop.prevent="query = ''; page = 0">
        <template v-if="pageCount > 1">
          <button type="button" class="secondary icon-button" aria-label="Previous saved requests"
            title="Previous saved requests" @click="turnPage(-1)">‹</button>
          <span class="muted" aria-live="polite">{{ page + 1 }} / {{ pageCount }}</span>
          <button type="button" class="secondary icon-button" aria-label="Next saved requests"
            title="Next saved requests" @click="turnPage(1)">›</button>
        </template>
      </div>
    </div>
    <div v-if="selectedSample && !session.exampleKey" class="sample-management" aria-label="Manage selected saved request">
      <button type="button" class="secondary" :disabled="session.pending" @click="openStoreDialog(selectedSample.name)">Update selected</button>
      <button type="button" class="secondary" :disabled="session.pending" @click="openStoreDialog(selectedSample.name, true)">Rename</button>
      <button type="button" class="secondary" :disabled="session.pending" @click="deleting = selectedSample.name">Delete</button>
    </div>
    <div v-if="deleting" class="delete-confirmation" role="group" aria-label="Confirm saved request deletion"><span>Delete {{ deleting }}?</span><button type="button" class="secondary" @click="deleteSelected">Delete saved request</button><button type="button" class="secondary" @click="deleting = ''">Keep request</button></div>
    <ul v-if="visibleSamples.length" class="sample-tags">
      <li v-for="sample in visibleSamples" :key="sample.name" class="sample-tag"
        :class="{ selected: isSelected(sample) }">
        <button type="button" class="sample-name" :aria-pressed="isSelected(sample)"
          :title="sample.name" :disabled="session.pending" @click="originalDrafts.delete(session); loadSample(sample.name)">{{ sample.name }}</button>
        <button class="sample-default" :aria-pressed="sample.name === saved.defaultName"
          :aria-label="`Default request: ${sample.name}`"
          :title="sample.name === saved.defaultName ? 'Clear default' : 'Set as default'"
          @click="toggleDefault(sample.name)">
          <span aria-hidden="true">{{ sample.name === saved.defaultName ? '★' : '☆' }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="payloads.length" class="muted" role="status">No matching saved requests.</p>
    <p v-if="error && !storeOpen" class="error" role="alert">{{ error }}</p>
  </section>
  <Teleport to="body">
    <dialog ref="examplesDialog" class="endpoint-dialog examples-dialog" aria-label="OpenAPI examples">
      <header>
        <h3>OpenAPI examples</h3>
        <button type="button" class="secondary" autofocus @click="examplesDialog.close()">Close</button>
      </header>
      <label v-if="examples.length > 1" class="dialog-field">
        Search examples
        <input v-model="exampleQuery" type="search">
      </label>
      <label v-if="matchingExamples.length > 1" class="dialog-field">
        Example
        <select :value="previewExample?.id" @change="previewId = $event.target.value">
          <option v-for="example in matchingExamples" :key="example.id" :value="example.id">
            {{ example.name }} · {{ example.subtitle }}
          </option>
        </select>
      </label>
      <template v-if="previewExample">
        <strong>{{ previewExample.name }} · {{ previewExample.subtitle }}</strong>
        <p v-if="previewExample.description">{{ previewExample.description }}</p>
        <pre v-if="previewExample.available">{{ examplePreview }}</pre>
        <p v-else>{{ previewExample.reason }}</p>
      </template>
      <p v-else>No matching examples.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button v-if="originalDrafts.has(session) && session.exampleKey" type="button" class="secondary"
          :disabled="session.pending" @click="returnToDraft(); examplesDialog.close()">Return to draft</button>
        <button type="button" class="primary" :disabled="session.pending || !previewExample?.available"
          @click="useExample">Use as draft</button>
      </div>
    </dialog>
    <dialog ref="storeDialog" class="endpoint-dialog" aria-labelledby="store-sample-title" @close="storeOpen = false">
      <h3 id="store-sample-title">{{ renameOnly ? 'Rename saved request' : editing ? 'Update saved request' : 'Save request' }}</h3>
      <form @submit.prevent="storeSample">
        <p v-if="sensitiveBody">Marked sensitive fields are excluded from saved payloads. Re-enter them before replay.</p>
        <label class="dialog-field">Request name <input v-model="name" required autofocus maxlength="120"></label>
        <fieldset v-if="fields.length && !renameOnly">
          <legend>Fields to store</legend>
          <label v-for="field in fields" :key="field.key">
            <input v-model="selectedFields" type="checkbox" :value="field.key">
            <code>{{ field.parameter.name }}</code> · {{ field.parameter.in }}<template v-if="field.fromPreset"> · preset</template>
          </label>
        </fieldset>
        <label><input v-model="makeDefault" type="checkbox"> Set as default</label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="dialog-actions">
          <button class="secondary" type="button" @click="storeDialog.close()">Cancel</button>
          <button class="primary" type="submit">{{ editing ? 'Save changes' : 'Save request' }}</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.samples, .sample-toolbar, .sample-controls, .sample-tags { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; }
.samples { margin-bottom: .6rem; padding-bottom: .35rem; border-bottom: 1px solid var(--line); font-size: .8rem; }
.sample-management, .delete-confirmation { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
.sample-management button { font-size: .75rem; }
.delete-confirmation { flex-basis: 100%; padding: .5rem; background: var(--accent-soft); border-radius: .4rem; }
.samples p { margin: 0; }
.sample-toolbar { min-width: 0; }
.sample-controls { min-width: 0; }
.sample-controls input { width: 10rem; max-width: 100%; min-width: 0; }
.icon-button.secondary { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; padding: 0; color: var(--accent); }
.icon-button svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.sample-tags { min-width: 0; max-width: 100%; list-style: none; padding: 0; margin: 0; }
.sample-tag { display: flex; max-width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); }
.sample-tag.selected { border-color: var(--accent); background: var(--accent); color: white; }
.sample-tag button { border: 0; background: transparent; color: inherit; font: inherit; }
.sample-tag button:hover { text-decoration: underline; }
.sample-tag .sample-name { min-width: 0; padding: .18rem .45rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sample-tag .sample-default { flex: none; padding: .18rem .4rem; border-left: 1px solid var(--line); border-radius: 0 1rem 1rem 0; }
.sample-default[aria-pressed="true"] { font-weight: 700; }
.examples-dialog header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.examples-dialog pre { max-height: 42dvh; overflow: auto; padding: .6rem; background: var(--subtle); white-space: pre-wrap; overflow-wrap: anywhere; }
.examples-dialog select { width: 100%; }
fieldset { display: flex; flex-wrap: wrap; gap: .35rem .75rem; min-width: 0; margin: 0; }
</style>
