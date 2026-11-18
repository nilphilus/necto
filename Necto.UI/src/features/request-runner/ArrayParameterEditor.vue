<script setup>
import { computed, ref, watch } from 'vue'
import { numericError, numericRules } from './numericParameter.js'

const props = defineProps({
  id: { type: String, required: true },
  itemSchema: { type: Object, required: true },
})
const model = defineModel()
const open = ref(false)
const rows = ref([])
const trigger = ref(null)
let nextId = 0
const isNumber = computed(() => ['integer', 'number'].includes(props.itemSchema.type))
const rules = computed(() => numericRules(props.itemSchema))
const rowError = computed(() => rows.value.some(({ value }) =>
  isNumber.value && numericError(value, props.itemSchema.type, rules.value)))
const unsupportedValue = ref(false)

function add(value = '') {
  rows.value.push({ id: nextId++, value })
}

function load() {
  rows.value = []
  unsupportedValue.value = false
  if (!model.value) return
  try {
    const items = JSON.parse(model.value)
    const type = isNumber.value ? 'number' : props.itemSchema.type
    if (!Array.isArray(items) || !items.every((item) => typeof item === type)) throw new Error()
    items.forEach((item) => add(String(item)))
  } catch {
    unsupportedValue.value = true
  }
}
watch(model, () => { if (open.value) load() })

function toggle() {
  if (!open.value) load()
  open.value = !open.value
}

function apply() {
  const items = rows.value.map(({ value }) => {
    if (isNumber.value) return Number(value)
    if (props.itemSchema.type === 'boolean') return value === 'true'
    return value
  })
  model.value = JSON.stringify(items)
  open.value = false
  trigger.value?.focus()
}
</script>

<template>
  <div class="array-editor">
    <button ref="trigger" type="button" class="secondary" :aria-expanded="open"
      :aria-controls="open ? id + '-items' : undefined" @click="toggle">Edit items</button>
    <div v-if="open" :id="id + '-items'" class="array-items">
      <p v-if="unsupportedValue" class="muted">Edit the JSON to load these items.</p>
      <template v-else>
        <div v-for="(row, index) in rows" :key="row.id" class="array-item">
          <label>
            <span>Item {{ index + 1 }}</span>
            <select v-if="itemSchema.type === 'boolean'" v-model="row.value">
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
            <input v-else v-model="row.value" :inputmode="isNumber ? 'decimal' : undefined">
          </label>
          <button type="button" class="secondary" :aria-label="'Remove item ' + (index + 1)"
            @click="rows.splice(index, 1)">Remove</button>
        </div>
        <div class="array-actions">
          <button type="button" class="secondary" @click="add(itemSchema.type === 'boolean' ? 'false' : '')">Add item</button>
          <button type="button" class="secondary" :disabled="rowError" @click="apply">Apply items</button>
        </div>
        <small v-if="rowError" class="muted">Enter a valid {{ itemSchema.type }} for each item.</small>
      </template>
    </div>
  </div>
</template>

<style scoped>
.array-editor { margin-top: .35rem; }
.array-items { display: grid; gap: .35rem; margin-top: .35rem; }
.array-item, .array-actions { display: flex; flex-wrap: wrap; align-items: end; gap: .35rem; }
.array-item label { display: grid; flex: 1 1 10rem; gap: .15rem; min-width: 0; }
.array-item input { min-width: 0; }
</style>
