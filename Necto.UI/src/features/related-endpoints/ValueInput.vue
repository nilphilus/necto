<script setup>
import { computed, useId } from 'vue'
defineOptions({ inheritAttrs: false })
const props = defineProps({ modelValue: { default: '' }, choices: { type: Array, default: () => [] } })
const emit = defineEmits(['update:modelValue', 'choose'])
const id = useId()
const options = computed(() => [...new Set(props.choices.map(choice =>
  typeof choice.value === 'object' ? JSON.stringify(choice.value) : String(choice.value)))])
function update(event) {
  const value = event.target.value
  emit('update:modelValue', value)
  const choice = props.choices.find(choice => (typeof choice.value === 'object' ? JSON.stringify(choice.value) : String(choice.value)) === value)
  if (choice) emit('choose', choice)
}

</script>

<template>
  <input v-bind="$attrs" :value="modelValue" :list="options.length ? id : undefined" autocomplete="off" spellcheck="false"
    @input="update">
  <datalist v-if="options.length" :id="id">
    <option v-for="value in options" :key="value" :value="value" />
  </datalist>
</template>
