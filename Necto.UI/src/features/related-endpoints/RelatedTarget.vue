<script setup>
import DescriptionHelp from '../workbench/DescriptionHelp.vue'
import { preferredRelatedChoice } from './mappings.js'
import RequestSendIcon from '../request-runner/RequestSendIcon.vue'
import { computed, reactive, watch } from 'vue'
import ValueInput from './ValueInput.vue'
const props = defineProps({ target: Object, canSend: Function })
const emit = defineEmits(['follow', 'edit-preset', 'search-response'])
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
    const suggested = preferredRelatedChoice(field.choices, field.selected)
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
function searchField(field) {
  const names = new Set(field.choices.map(choice => choice.binding?.path.at(-1)))
  const name = [...names][0]
  return names.size === 1 && typeof name === 'string' ? name : ''
}
const quickSend = computed(() => ['GET', 'HEAD'].includes(props.target.operation.method) && !props.target.operation.requestBody)
const ready = computed(() => props.canSend(props.target.operation, choices.value))
</script>

<template>
  <li>
    <div class="destination-title">
      <span class="method" :data-method="target.operation.method">{{ target.operation.method }}</span>
      <strong>{{ target.operation.name }}</strong>
      <small v-if="target.preferred" class="link-origin">OpenAPI Link</small>
      <DescriptionHelp :label="(target.preferred ? 'About link to ' : 'Why related request ') + target.operation.name" :description="target.description" />
      <button type="button" class="secondary open-request" :aria-label="'Open request ' + target.operation.name"
        @click="emit('follow', target.operation, choices, false)">Open request</button>
      <small v-if="target.operation.apiId && target.operation.apiId !== 'local'">{{ target.operation.apiName }} [{{ target.operation.apiId }}]</small>
    </div>
    <ul v-if="target.presetInputs?.length" class="preset-inputs" aria-label="Preset inputs for this request">
      <li v-for="input in target.presetInputs" :key="input.key"><code>{{ input.label }}<template v-if="input.value !== undefined"> = {{ input.value }}</template></code> · <button type="button" class="preset-link" :aria-label="'Edit preset ' + input.preset" @click="emit('edit-preset', input.preset)">{{ input.preset }}</button></li>
    </ul>
    <form @submit.prevent="(!quickSend || ready) && emit('follow', target.operation, choices, quickSend)">
      <button v-if="!fields.length && quickSend" type="submit" class="secondary send" :disabled="!ready"
        :aria-label="'Send ' + target.operation.name">Send <RequestSendIcon /></button>
      <div v-if="fields.length" class="fields">
        <div v-for="(field, index) in fields" :key="field.key" class="field">
          <ValueInput v-model="drafts[field.key]" :choices="field.choices" dropdown searchable-response @search-response="emit('search-response', { query: $event, field: searchField(field) })" placeholder="Type or choose a value…">
            <template #label>{{ field.name ?? 'body' }} <small>{{ field.location }}</small></template>
            <template v-if="index === 0 && quickSend" #trailing>
              <button type="submit" class="send send-joined" :disabled="!ready"
                :aria-label="'Send ' + target.operation.name">Send <RequestSendIcon /></button>
            </template>
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
.preset-inputs { list-style: none; padding: 0; margin: .4rem 0; font-size: .76rem; overflow-wrap: anywhere; }
.preset-inputs li { padding: .15rem 0; border: 0; }
.preset-link { color: var(--accent); text-decoration: underline; padding: .1rem .2rem; }
li { padding: .65rem 0; }
li + li { border-top: 1px solid var(--line); }
.destination-title { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; font-size: .87rem; }
.open-request { margin-left: auto; font-size: .75rem; }
form { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; margin-top: .45rem; }
.fields { display: flex; flex: 1 1 12rem; flex-wrap: wrap; align-items: end; gap: .5rem; min-width: 0; }
.field { min-width: min(12rem, 100%); max-width: 100%; font-size: .8rem; }
.field:first-child { min-width: min(16rem, 100%); }
small { color: var(--muted); }
.send { padding: .5rem .65rem; color: var(--accent); font-size: .8rem; white-space: nowrap; }
.send-joined { border-inline-start: 1px solid var(--line); border-radius: 0 .45rem .45rem 0; }
.suggestion-note { flex-basis: 100%; }
</style>
