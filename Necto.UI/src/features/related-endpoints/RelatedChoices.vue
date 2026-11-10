<script setup>
const props = defineProps({ choices: { type: Array, required: true } })
const emit = defineEmits(['choose'])

function choose(event) {
  const choice = props.choices.find(choice => choice.key === event.target.value)
  if (choice) emit('choose', choice)
  event.target.value = ''
}
</script>

<template>
  <label v-if="choices.length" class="related-choices">
    Related values
    <select @change="choose">
      <option value="">Choose a value…</option>
      <option v-for="choice in choices" :key="choice.key" :value="choice.key">
        {{ choice.name ? choice.name + ' = ' : '' }}{{ JSON.stringify(choice.value) }} · {{ choice.source }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.related-choices { display: grid; gap: .3rem; margin-top: .4rem; font-size: .82rem; color: var(--muted); }
.related-choices select { max-width: 100%; width: fit-content; }
</style>
