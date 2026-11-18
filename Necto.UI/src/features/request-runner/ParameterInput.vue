<script setup>
import { computed, ref, watchPostEffect } from 'vue'
import ValueInput from '../related-endpoints/ValueInput.vue'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: String,
  format: String,
  choices: Array,
  required: Boolean,
})
const model = defineModel()
const emit = defineEmits(['choose'])

const booleanOptions = [
  { value: '', label: 'Unset' },
  { value: 'true', label: 'True' },
  { value: 'false', label: 'False' },
]
const booleanValue = computed(() => String(model.value ?? ''))
const unsetRadio = ref(null)
watchPostEffect(() => {
  const valid = booleanValue.value === 'true' || booleanValue.value === 'false'
  unsetRadio.value?.setCustomValidity(props.required && !valid ? 'Select True or False.' : '')
})

function selectBoolean(value) {
  model.value = value
  const choice = props.choices?.find((item) => value && String(item.value) === value)
  if (choice) emit('choose', choice)
}

const format = computed(() => props.type === 'string' ? props.format : undefined)
const hasDate = computed(() => ['date', 'date-time'].includes(format.value))
const hasTime = computed(() => ['time', 'date-time'].includes(format.value))
const placeholder = computed(() => {
  if (format.value === 'date-time') return 'YYYY-MM-DDTHH:mm:ssZ'
  if (format.value === 'date') return 'YYYY-MM-DD'
  if (format.value === 'time') return 'HH:mm:ssZ'
  if (props.type === 'array' || props.type === 'object') return `JSON ${props.type}`
  return undefined
})

const pickerButton = ref(null)
const pickerOpen = ref(false)
const date = ref('')
const time = ref('')
const originalTime = ref('')
const offset = ref('Z')
const timePattern = /^(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?$/i

function togglePicker() {
  if (!pickerOpen.value) {
    const value = String(model.value ?? '')
    const [day, clock] = format.value === 'date-time' ? value.split(/[Tt ]/, 2)
      : hasDate.value ? [value, ''] : ['', value]
    const parts = timePattern.exec(clock ?? '')
    date.value = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
    originalTime.value = parts?.[1] ?? ''
    time.value = pickerTime(originalTime.value)
    offset.value = parts?.[2] ?? 'Z'
  }
  pickerOpen.value = !pickerOpen.value
}

function pickerTime(value) {
  return value.replace(/(\.\d{3})\d+$/, '$1')
}

function applyPicker() {
  const clock = time.value === pickerTime(originalTime.value) ? originalTime.value : time.value
  const fullTime = (clock.length === 5 ? clock + ':00' : clock) + offset.value
  if (format.value === 'date-time') model.value = `${date.value}T${fullTime}`
  else model.value = hasDate.value ? date.value : fullTime
  pickerOpen.value = false
  pickerButton.value?.focus()
}
</script>

<template>
  <div v-if="type === 'boolean'" role="radiogroup" :aria-label="label" :aria-required="required" class="boolean-input">
    <label v-for="(option, index) in booleanOptions" :key="option.value">
      <input
        :ref="element => { if (index === 0) unsetRadio = element }"
        type="radio"
        :name="id"
        :checked="booleanValue === option.value"
        @change="selectBoolean(option.value)"
      >
      <span>{{ option.label }}</span>
    </label>
  </div>
  <div v-else class="parameter-input">
    <div class="parameter-value">
      <ValueInput
        :id="id"
        :model-value="model"
        :choices="choices"
        :required="required"
        :placeholder="placeholder"
        @update:model-value="model = $event; pickerOpen = false"
        @choose="emit('choose', $event)"
      />
      <button v-if="hasDate || hasTime" ref="pickerButton" type="button" class="secondary"
        :aria-expanded="pickerOpen" :aria-controls="pickerOpen ? id + '-picker' : undefined"
        @click="togglePicker">
        {{ hasDate && hasTime ? 'Date & time' : hasDate ? 'Date' : 'Time' }}
      </button>
    </div>
    <div v-if="pickerOpen" :id="id + '-picker'" class="picker">
      <label v-if="hasDate">Date <input v-model="date" type="date"></label>
      <label v-if="hasTime">Time ({{ offset.toUpperCase() === 'Z' ? 'UTC' : offset }})
        <input v-model="time" type="time" step="0.001">
      </label>
      <button type="button" class="secondary" :disabled="(hasDate && !date) || (hasTime && !time)"
        @click="applyPicker">Apply</button>
    </div>
  </div>
</template>

<style scoped>
.boolean-input, .parameter-value, .picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .35rem;
}

.boolean-input label {
  position: relative;
  cursor: pointer;
}

.boolean-input input {
  position: absolute;
  opacity: 0;
  inline-size: 1px;
  block-size: 1px;
}

.boolean-input span {
  display: block;
  padding: .3rem .65rem;
  border: 1px solid var(--line);
  border-radius: .35rem;
}

.boolean-input input:checked + span {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}

.boolean-input input:focus-visible + span {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.parameter-value :deep(input) {
  flex: 1 1 13rem;
  min-width: 0;
}

.picker {
  margin-top: .35rem;
  align-items: end;
}

.picker label {
  display: grid;
  gap: .15rem;
  font-size: .8rem;
}

.picker input {
  width: auto;
}
</style>
