<script setup>
import { nextTick, ref, toRaw, watch } from 'vue'

const props = defineProps({
  values: { type: Map, required: true },
  label: { type: String, required: true },
})
const emit = defineEmits(['save'])
const rows = ref([])
const editor = ref(null)
let nextId = 0
let lastSavedValues

watch(() => props.values, values => {
  // Keep row focus and drafts when the parent applies our latest save.
  if (toRaw(values) === lastSavedValues) return
  lastSavedValues = undefined
  rows.value = Array.from(values, ([name, field]) => ({
    id: nextId++, name, value: field.value, legacyHeader: field.legacyHeader,
    saved: { name, field }, error: '',
  }))
}, { immediate: true })

async function addRow() {
  rows.value.push({ id: nextId++, name: '', value: '', saved: null, error: '' })
  await nextTick()
  editor.value?.querySelector('.value-row:last-child .field-name')?.focus()
}

function saveRow(row, event) {
  if (event.target.composing) return
  const name = row.name.trim()
  const { value, legacyHeader } = row
  if (!row.saved && !name && !value) {
    row.error = ''
    return
  }

  try {
    if (!name) throw new Error('Enter a name for this field.')
    if (rows.value.some(other => other !== row && other.saved?.name === name)) {
      throw new Error(`"${name}" is already listed.`)
    }
    if (legacyHeader) {
      try {
        new Headers([[name, value]])
      } catch {
        throw new Error(`Check the name and value of the "${name}" header.`)
      }
    }
  } catch (cause) {
    row.error = cause.message
    return
  }

  row.error = ''
  if (row.saved?.name === name && row.saved.field.value === value) return
  row.saved = { name, field: { value, legacyHeader } }
  save()
}

function removeRow(index) {
  const [removed] = rows.value.splice(index, 1)
  if (removed.saved) save()
}

function save() {
  const values = new Map()
  for (const { saved } of rows.value) {
    if (saved) values.set(saved.name, saved.field)
  }
  lastSavedValues = values
  emit('save', values)
}
</script>

<template>
  <div ref="editor" class="values-editor" role="group" :aria-label="label">
    <p class="muted">Changes are saved automatically.</p>
    <div v-if="rows.length" class="value-rows">
      <div v-for="(row, index) in rows" :key="row.id" class="value-row">
        <label>
          Name
          <input v-model="row.name" class="field-name" spellcheck="false" @input="saveRow(row, $event)">
        </label>
        <label>
          Value
          <input v-model="row.value" spellcheck="false" @input="saveRow(row, $event)">
        </label>
        <button
          type="button"
          class="secondary"
          :aria-label="row.name ? 'Remove ' + row.name : 'Remove field ' + (index + 1)"
          @click="removeRow(index)"
        >Remove</button>
        <p v-if="row.error" class="error" role="alert">{{ row.error }}</p>
      </div>
    </div>
    <div class="value-actions">
      <button type="button" class="secondary" @click="addRow">Add field</button>
    </div>
  </div>
</template>

<style scoped>
.values-editor, .value-rows { display: grid; gap: .6rem; }
.values-editor { max-width: 46rem; margin-block: .6rem; }
.value-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
  align-items: end;
  gap: .5rem;
}
label { display: grid; gap: .25rem; min-width: 0; }
input { width: 100%; }
.value-row button { min-height: 2.25rem; }
.value-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
p { margin: 0; }
.value-row .error { grid-column: 1 / -1; }
@media (max-width: 520px) {
  .value-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: .5rem;
    border: 1px solid var(--line);
    border-radius: .45rem;
  }
  .value-row button { justify-self: end; }
}
</style>
