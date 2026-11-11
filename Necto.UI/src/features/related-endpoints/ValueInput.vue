<script setup>
import { computed, useId } from 'vue'
defineOptions({ inheritAttrs: false })
const props = defineProps({ modelValue: { default: '' }, choices: { type: Array, default: () => [] } })
const emit = defineEmits(['update:modelValue'])
const id = useId()
const options = computed(() => [...new Set(props.choices.map(choice =>
  typeof choice.value === 'object' ? JSON.stringify(choice.value) : String(choice.value)))])
</script>

<template>
  <input v-bind="$attrs" :value="modelValue" :list="options.length ? id : undefined" autocomplete="off" spellcheck="false"
    @input="emit('update:modelValue', $event.target.value)">
  <datalist v-if="options.length" :id="id">
    <option v-for="value in options" :key="value" :value="value" />
  </datalist>
</template>
