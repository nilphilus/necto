<script setup>
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
const selectedFields = ref([])
const makeDefault = ref(false)
const storeDialog = ref(null)
const storeOpen = ref(false)
const error = ref('')
const fields = computed(() => supportedParameters(props.operation).map(parameter => {
  const key = fieldKey(parameter)
  const presetKey = contextKey(parameter)
  const fromPreset = props.values.has(presetKey)
  return { key, parameter, fromPreset, value: fromPreset ? props.values.get(presetKey) : props.session.fields[key] }
}).filter(field => field.value !== undefined && field.value !== ''))
const selectedName = computed(() => saved.value.samples.some(sample => sample.name === props.session.sampleName)
  ? props.session.sampleName : '')

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

watch(() => props.session, () => {
  storeDialog.value?.close()
})

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

function toggleDefault() {
  const sampleName = selectedName.value
  persist(current => ({
    ...current,
    defaultName: current.defaultName === sampleName ? '' : sampleName,
  }))
}
</script>

<template>
  <section v-if="saved.samples.length || (error && !storeOpen)" class="preset-panel samples" aria-label="Request samples">
    <div v-if="saved.samples.length" class="sample-actions">
      <label>
        Request sample
        <select :value="selectedName" :disabled="session.pending" @change="loadSample($event.target.value)">
          <option value="" disabled>Choose a sample</option>
          <option v-for="sample in saved.samples" :key="sample.name" :value="sample.name">
            {{ sample.name }}{{ sample.name === saved.defaultName ? ' (default)' : '' }}
          </option>
        </select>
      </label>
      <button v-if="selectedName" class="secondary" type="button" :disabled="session.pending" @click="loadSample(selectedName)">
        Reload sample
      </button>
      <button v-if="selectedName" class="secondary" type="button" @click="toggleDefault">
        {{ selectedName === saved.defaultName ? 'Clear default' : 'Set as default' }}
      </button>
    </div>
    <p v-if="error && !storeOpen" class="error" role="alert">{{ error }}</p>
  </section>
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
</template>

<style scoped>
.sample-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; }
.sample-actions label { min-width: 0; }
select { max-width: 100%; }
fieldset { display: flex; flex-wrap: wrap; gap: .35rem .75rem; min-width: 0; margin: 0; }
</style>
