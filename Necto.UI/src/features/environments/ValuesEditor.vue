<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  values: { type: Map, required: true },
  label: { type: String, required: true },
})
const emit = defineEmits(['save'])
const rows = ref([])
const form = ref(null)
const error = ref('')
let nextId = 0

watch(() => props.values, values => {
  rows.value = Array.from(values, ([key, value]) => {
    const colon = key.indexOf(':')
    return { id: nextId++, location: key.slice(0, colon), name: key.slice(colon + 1), value }
  })
  error.value = ''
}, { immediate: true })

async function addRow() {
  rows.value.push({ id: nextId++, location: 'header', name: '', value: '' })
  await nextTick()
  form.value?.querySelector('.value-row:last-child .field-name')?.focus()
}

function save() {
  try {
    const values = new Map()
    for (const { location, name, value } of rows.value) {
      if (!name) throw new Error('Enter a name for each field.')
      if (location === 'header') {
        try {
          new Headers([[name, value]])
        } catch {
          throw new Error(`Check the name and value of the "${name}" header.`)
        }
      }
      const key = location + ':' + (location === 'header' ? name.toLowerCase() : name)
      if (values.has(key)) throw new Error(`"${name}" is already listed as a ${location} field.`)
      values.set(key, value)
    }
    error.value = ''
    emit('save', values)
  } catch (cause) {
    error.value = cause.message
  }
}
</script>

<template>
  <form ref="form" class="values-editor" :aria-label="label" @submit.prevent="save">
    <div v-if="rows.length" class="value-rows">
      <div v-for="(row, index) in rows" :key="row.id" class="value-row">
        <label>
          Type
          <select v-model="row.location">
            <option value="header">Header</option>
            <option value="path">Path</option>
            <option value="query">Query</option>
          </select>
        </label>
        <label>
          Name
          <input v-model.trim="row.name" class="field-name" required spellcheck="false">
        </label>
        <label>
          Value
          <input v-model="row.value" spellcheck="false">
        </label>
        <button
          type="button"
          class="secondary"
          :aria-label="row.name ? 'Remove ' + row.name : 'Remove field ' + (index + 1)"
          @click="rows.splice(index, 1)"
        >Remove</button>
      </div>
    </div>
    <div class="value-actions">
      <button type="button" class="secondary" @click="addRow">Add field</button>
      <button type="submit" class="secondary">Save values</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.values-editor, .value-rows { display: grid; gap: .6rem; }
.values-editor { max-width: 46rem; margin-block: .6rem; }
.value-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 2fr) auto;
  align-items: end;
  gap: .5rem;
}
label { display: grid; gap: .25rem; min-width: 0; }
input { width: 100%; }
.value-row button { min-height: 2.25rem; }
.value-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
p { margin: 0; }
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
