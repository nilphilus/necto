<script setup>
import { computed, ref, watchPostEffect } from 'vue'
import ArrayParameterEditor from './ArrayParameterEditor.vue'
import { uuidPattern } from './uuidParameter.js'
import { numericError } from './numericParameter.js'
import ValueInput from '../related-endpoints/ValueInput.vue'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: String,
  format: String,
  enumValues: Array,
  numberRules: Array,
  itemSchema: Object,
  choices: Array,
  required: Boolean,
})
const model = defineModel()
const emit = defineEmits(['choose'])

const enumOptions = computed(() => [...new Set((props.enumValues ?? [])
  .filter((value) => ['string', 'number', 'boolean'].includes(typeof value) && value !== '')
  .map(String))])
const enumChoices = computed(() => [
  ...(props.choices ?? []).filter((choice) => enumOptions.value.includes(String(choice.value))),
  ...enumOptions.value.map((value) => ({ value })),
])
const shortEnum = computed(() => props.type !== 'boolean' && enumOptions.value.length > 0 && enumOptions.value.length <= 8)
const longEnum = computed(() => props.type !== 'boolean' && enumOptions.value.length > 8)

function chooseValue(value) {
  model.value = value
  const choice = props.choices?.find((item) => value && String(item.value) === value)
  if (choice) emit('choose', choice)
}

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

const numeric = computed(() => props.type === 'integer' || props.type === 'number')
const valueControl = ref(null)
watchPostEffect(() => {
  const error = numeric.value && model.value !== undefined && model.value !== null && model.value !== ''
    ? numericError(model.value, props.type, props.numberRules ?? [])
    : ''
  valueControl.value?.querySelector('input')?.setCustomValidity(error ? `${props.label} ${error}.` : '')
})
const numericHint = computed(() => numeric.value && props.numberRules?.map(([operator, limit]) => `${operator} ${limit}`).join(' · '))

const format = computed(() => props.type === 'string' ? props.format : undefined)
const uuid = computed(() => format.value === 'uuid')
const canGenerateUuid = typeof globalThis.crypto?.randomUUID === 'function'

function generateUuid() {
  model.value = globalThis.crypto.randomUUID()
}

const hasDate = computed(() => ['date', 'date-time'].includes(format.value))
const hasTime = computed(() => ['time', 'date-time'].includes(format.value))
const placeholder = computed(() => {
  if (format.value === 'date-time') return 'YYYY-MM-DDTHH:mm:ssZ'
  if (format.value === 'date') return 'YYYY-MM-DD'
  if (uuid.value) return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
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
        @change="chooseValue(option.value)"
      >
      <span>{{ option.label }}</span>
    </label>
  </div>
  <select v-else-if="shortEnum" :id="id" :value="model ?? ''" :required="required"
    @change="chooseValue($event.target.value)">
    <option value="">Unset</option>
    <option v-if="model && !enumOptions.includes(String(model))" :value="model">{{ model }}</option>
    <option v-for="value in enumOptions" :key="value" :value="value">{{ value }}</option>
  </select>
  <div v-else class="parameter-input">
    <div ref="valueControl" class="parameter-value">
      <ValueInput
        :id="id"
        :model-value="model"
        :choices="longEnum ? enumChoices : choices"
        :required="required"
        :placeholder="placeholder"
        :pattern="uuid ? uuidPattern.source.replaceAll('[0-9a-f]', '[0-9a-fA-F]') : undefined"
        :inputmode="numeric ? 'decimal' : undefined"
        :aria-describedby="numericHint ? id + '-bounds' : undefined"
        @update:model-value="model = $event; pickerOpen = false"
        @choose="choice => { if (!longEnum || choices?.includes(choice)) emit('choose', choice) }"
      />
      <button v-if="uuid && canGenerateUuid" type="button" class="secondary"
        @click="generateUuid">Generate UUID</button>
      <button v-if="hasDate || hasTime" ref="pickerButton" type="button" class="secondary"
        :aria-expanded="pickerOpen" :aria-controls="pickerOpen ? id + '-picker' : undefined"
        @click="togglePicker">
        {{ hasDate && hasTime ? 'Date & time' : hasDate ? 'Date' : 'Time' }}
      </button>
    </div>
    <ArrayParameterEditor
      v-if="type === 'array' && ['string', 'integer', 'number', 'boolean'].includes(itemSchema?.type)"
      :id="id" v-model="model" :item-schema="itemSchema"
    />
    <small v-if="numericHint" :id="id + '-bounds'" class="muted">{{ numericHint }}</small>
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
