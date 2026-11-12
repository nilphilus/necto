<script setup>
import { computed, reactive, watch } from 'vue'
import ValueInput from './ValueInput.vue'
const props = defineProps({ target: Object, canSend: Function })
const emit = defineEmits(['follow'])
const drafts = reactive({})
const fields = computed(() => {
  const groups = new Map()
  for (const choice of props.target.candidates) {
    const key = JSON.stringify([choice.location, choice.name])
    if (!groups.has(key)) groups.set(key, { key, ...choice, choices: [] })
    groups.get(key).choices.push(choice)
  }
  return [...groups.values()].map(field => ({ ...field,
    selected: (props.target.selectedCandidates ?? []).filter(choice =>
      choice.location === field.location && choice.name === field.name),
  }))
})
watch(fields, fields => {
  for (const field of fields) {
    const suggested = field.selected.length === 1 ? field.selected[0]
      : field.choices.length === 1 ? field.choices[0] : null
    if (suggested) {
      const value = suggested.value
      drafts[field.key] = typeof value === 'object' ? JSON.stringify(value) : String(value)
    } else if (!(field.key in drafts)) drafts[field.key] = ''
  }
}, { immediate: true })
const choices = computed(() => fields.value.filter(field => drafts[field.key] !== '').map(field => {
  const input = drafts[field.key]
  const match = [...field.selected, ...field.choices].find(choice => (typeof choice.value === 'object' ? JSON.stringify(choice.value) : String(choice.value)) === input)
  let value = match ? match.value : input
  if (!match && field.location === 'body') {
    try { value = JSON.parse(input) } catch { /* Let the request editor handle text values. */ }
  }
  return { location: field.location, name: field.name, value, binding: match?.binding, sourceResult: match?.sourceResult }
}))
</script>

<template>
  <li>
    <div class="destination-title">
      <span class="method" :data-method="target.operation.method">{{ target.operation.method }}</span>
      <strong>{{ target.operation.name }}</strong>
      <small v-if="target.operation.apiId && target.operation.apiId !== 'local'">{{ target.operation.apiName }} [{{ target.operation.apiId }}]</small>
    </div>
    <form @submit.prevent="canSend(target.operation, choices) && emit('follow', target.operation, choices, true)">
      <button type="submit" class="secondary" :disabled="!canSend(target.operation, choices)"
        :aria-label="'Send ' + target.operation.name">Send ↗</button>
      <div v-if="fields.length" class="fields">
        <div v-for="field in fields" :key="field.key" class="field">
          <ValueInput v-model="drafts[field.key]" :choices="field.choices" dropdown placeholder="Type or choose a value…">
            <template #label>{{ field.name ?? 'body' }} <small>{{ field.location }}</small></template>
          </ValueInput>
        </div>
      </div>
      <small v-if="fields.some(field => field.choices.length >= 200)" class="suggestion-note">
        First 200 suggestions per mapping. Type any value or select an object on any Preview page.
      </small>
    </form>
  </li>
</template>

<style scoped>
li { padding: .65rem 0; }
li + li { border-top: 1px solid var(--line); }
.destination-title { display: flex; align-items: center; gap: .4rem; font-size: .87rem; }
form { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; margin-top: .45rem; }
.fields { display: flex; flex: 1 1 12rem; flex-wrap: wrap; align-items: end; gap: .5rem; min-width: 0; }
.field { min-width: min(12rem, 100%); max-width: 100%; font-size: .8rem; }
small { color: var(--muted); }
form > button { padding: .5rem .65rem; color: var(--accent); font-size: .8rem; }
.suggestion-note { flex-basis: 100%; }
</style>
