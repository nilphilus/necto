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
defineExpose({ addRow })

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
    <div class="fields-heading">
      <h5>Fields</h5>
      <span class="muted">Autosave on</span>
    </div>
    <div v-if="rows.length" class="value-rows">
      <div v-for="(row, index) in rows" :key="row.id" class="value-row">
        <label>
          <span>Name</span>
          <input v-model="row.name" class="field-name" spellcheck="false" :aria-invalid="row.error ? 'true' : undefined" @input="saveRow(row, $event)">
        </label>
        <label>
          <span>Value</span>
          <input v-model="row.value" spellcheck="false" @input="saveRow(row, $event)">
        </label>
        <button
          type="button"
          class="remove-field"
          title="Remove field"
          :aria-label="row.name ? 'Remove ' + row.name : 'Remove field ' + (index + 1)"
          @click="removeRow(index)"
        ><span aria-hidden="true">×</span></button>
        <p v-if="row.error" class="error" role="alert">{{ row.error }}</p>
      </div>
    </div>
    <p v-else class="empty-fields muted">Add a field to share its value across requests.</p>
    <button type="button" class="add-field secondary" @click="addRow"><span aria-hidden="true">+</span> Add field</button>
  </div>
</template>

<style scoped>
.values-editor, .value-rows { display: grid; gap: .55rem; }
.values-editor { padding: .9rem 1rem 1rem; }
.fields-heading { display: flex; justify-content: space-between; flex-wrap: wrap; align-items: baseline; gap: .3rem .6rem; }
.fields-heading h5 { margin: 0; font-size: .9rem; }
.fields-heading span { font-size: .75rem; }
.value-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto;
  align-items: end;
  gap: .4rem;
}
label { display: grid; gap: .2rem; min-width: 0; }
label span { color: var(--muted); font-size: .75rem; }
input { width: 100%; min-width: 0; min-height: 2.25rem; }
.remove-field { width: 2.25rem; height: 2.25rem; padding: 0; color: var(--muted); font-size: 1.25rem; }
.add-field { justify-self: start; }
.add-field span { margin-inline-end: .2rem; }
.empty-fields { padding-block: .3rem; }
p { margin: 0; }
.value-row .error { grid-column: 1 / -1; }
@media (min-width: 631px) {
  .value-row:not(:first-child) label span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
}
@media (max-width: 410px) {
  .value-row {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: .5rem;
    border: 1px solid var(--line);
    border-radius: .45rem;
  }
  .value-row label:nth-child(2) { grid-row: 2; grid-column: 1 / -1; }
  .remove-field { grid-row: 1; grid-column: 2; }
}
</style>
