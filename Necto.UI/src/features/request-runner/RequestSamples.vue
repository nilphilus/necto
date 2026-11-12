<script setup>
import { computed, nextTick, ref, watch } from 'vue'
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
const selectedFields = ref([])
const makeDefault = ref(false)
const storeDialog = ref(null)
const storeOpen = ref(false)
const error = ref('')
const searchOpen = ref(false)
const searchButton = ref(null)
const searchInput = ref(null)
const query = ref('')
const page = ref(0)
const pageSize = 3
const matchingSamples = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return saved.value.samples.filter(sample => sample.name.toLocaleLowerCase().includes(term))
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
  error.value = 'Could not load saved samples in this browser.'
}

function resetForm() {
  name.value = ''
  selectedFields.value = fields.value.filter(field => !field.fromPreset).map(field => field.key)
  makeDefault.value = false
}

function showSelectedPage() {
  const index = matchingSamples.value.findIndex(sample => sample.name === props.session.sampleName)
  page.value = index < 0 ? 0 : Math.floor(index / pageSize)
}

watch(() => props.session, () => {
  storeDialog.value?.close()
  query.value = ''
  showSelectedPage()
}, { immediate: true })

async function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    await nextTick()
    searchInput.value?.focus()
  } else {
    query.value = ''
    showSelectedPage()
    searchButton.value?.focus()
  }
}

function turnPage(direction) {
  page.value = (page.value + direction + pageCount.value) % pageCount.value
}

function updateQuery(event) {
  query.value = event.target.value
  page.value = 0
}

function openStoreDialog() {
  resetForm()
  storeDialog.value.showModal()
  storeOpen.value = true
}

defineExpose({ openStoreDialog })

function persist(update) {
  try {
    const next = update(readSamples(localStorage, props.storageKey))
    localStorage.setItem(props.storageKey, JSON.stringify(next))
    saved.value = next
    error.value = ''
    return true
  } catch (cause) {
    error.value = cause.message === 'A sample with that name already exists.'
      ? cause.message : 'Could not save samples in this browser.'
    return false
  }
}

function storeSample() {
  const sampleName = name.value.trim()
  if (!sampleName) {
    error.value = 'Enter a sample name.'
    return
  }
  const sample = {
    name: sampleName,
    fields: Object.fromEntries(fields.value.filter(field => selectedFields.value.includes(field.key))
      .map(field => [field.key, field.value])),
  }
  if (jsonContent(props.operation)) sample.body = props.session.body
  if (persist(current => {
    if (current.samples.some(entry => entry.name === sampleName)) {
      throw new Error('A sample with that name already exists.')
    }
    return {
      samples: [...current.samples, sample],
      defaultName: makeDefault.value ? sampleName : current.defaultName,
    }
  })) {
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
  props.session.result = null
  props.session.error = ''
  error.value = ''
}

function toggleDefault(sampleName) {
  persist(current => ({
    ...current,
    defaultName: current.defaultName === sampleName ? '' : sampleName,
  }))
}
</script>

<template>
  <section v-if="saved.samples.length || (error && !storeOpen)" class="samples" aria-label="Request samples">
    <div v-if="saved.samples.length" class="sample-toolbar">
      <strong>Saved requests</strong>
      <div class="sample-controls">
        <button ref="searchButton" type="button" class="secondary icon-button"
          :aria-expanded="searchOpen" aria-label="Search saved requests" title="Search saved requests" @click="toggleSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></svg>
        </button>
        <input v-if="searchOpen" ref="searchInput" :value="query" type="search" aria-label="Search by name"
          placeholder="Search by name" @input="updateQuery"
          @keydown.enter.stop.prevent @keydown.esc.stop.prevent="toggleSearch">
        <template v-if="pageCount > 1">
          <button type="button" class="secondary icon-button" aria-label="Previous saved requests"
            title="Previous saved requests" @click="turnPage(-1)">‹</button>
          <span class="muted" aria-live="polite">{{ page + 1 }} / {{ pageCount }}</span>
          <button type="button" class="secondary icon-button" aria-label="Next saved requests"
            title="Next saved requests" @click="turnPage(1)">›</button>
        </template>
      </div>
    </div>
    <ul v-if="visibleSamples.length" class="sample-tags">
      <li v-for="sample in visibleSamples" :key="sample.name" class="sample-tag"
        :class="{ selected: session.sampleName === sample.name }">
        <button type="button" class="sample-name" :aria-pressed="session.sampleName === sample.name"
          :title="sample.name" :disabled="session.pending" @click="loadSample(sample.name)">{{ sample.name }}</button>
        <button type="button" class="sample-default" :aria-pressed="sample.name === saved.defaultName"
          :aria-label="`Default request: ${sample.name}`"
          :title="sample.name === saved.defaultName ? 'Clear default' : 'Set as default'"
          @click="toggleDefault(sample.name)">
          <span aria-hidden="true">{{ sample.name === saved.defaultName ? '★' : '☆' }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="saved.samples.length" class="muted" role="status">No matching saved requests.</p>
    <p v-if="error && !storeOpen" class="error" role="alert">{{ error }}</p>
  </section>
  <Teleport to="body">
    <dialog ref="storeDialog" class="endpoint-dialog" aria-labelledby="store-sample-title" @close="storeOpen = false">
      <h3 id="store-sample-title">Store as sample</h3>
      <form @submit.prevent="storeSample">
        <label class="dialog-field">Sample name <input v-model="name" required autofocus maxlength="120"></label>
        <fieldset v-if="fields.length">
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
          <button class="primary" type="submit">Save sample</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.samples, .sample-toolbar, .sample-controls, .sample-tags { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; }
.samples { margin-bottom: .6rem; padding-bottom: .35rem; border-bottom: 1px solid var(--line); font-size: .8rem; }
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
fieldset { display: flex; flex-wrap: wrap; gap: .35rem .75rem; min-width: 0; margin: 0; }
</style>
