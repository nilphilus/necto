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
  <div v-if="choices.length && choices.length <= 3" class="related-choices">
    <span>From responses</span>
    <div class="chips">
      <button
        v-for="choice in choices"
        :key="choice.key"
        type="button"
        class="secondary"
        :title="'Use value from ' + choice.source"
        @click="emit('choose', choice)"
      >{{ choice.name ? choice.name + ' = ' : '' }}{{ JSON.stringify(choice.value) }}</button>
    </div>
  </div>
  <label v-else-if="choices.length" class="related-choices">
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
.chips { display: flex; flex-wrap: wrap; gap: .35rem; min-width: 0; }
.chips button {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, Consolas, monospace;
  font-size: .78rem;
  color: var(--accent);
}
</style>
