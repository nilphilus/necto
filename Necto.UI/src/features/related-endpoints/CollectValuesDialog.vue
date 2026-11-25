<script setup>
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { pathLabel, selectableOwner } from '../payload-search/search.js'

const props = defineProps({
  operation: Object, session: Object, workspace: String, fields: Array,
  choicesFor: Function, createSession: Function, cancelRequest: Function, apply: Function,
})
const dialog = ref(null)
const origin = shallowRef(null)
const selected = reactive(new Set())
const collected = reactive(new Map())
const sourceSessions = reactive(new Map())
const activeSourceKey = ref('')
const focusedField = ref('')
const moreOpen = ref(false)
const issue = ref('')
let trigger

const selectedFields = computed(() => props.fields.filter(field => selected.has(field.key)))
const sourceOptions = computed(() => {
  const groups = new Map()
  for (const field of selectedFields.value) {
    if (focusedField.value && field.key !== focusedField.value) continue
    for (const source of field.sources) {
      const key = source.operation.key
      if (!groups.has(key)) groups.set(key, { operation: source.operation, fields: [] })
      const group = groups.get(key)
      if (!group.fields.includes(field)) group.fields.push(field)
    }
  }
  return [...groups.values()]
})
const rankedSources = computed(() => sourceOptions.value.map(item => {
  const missing = item.fields.filter(field => !collected.has(field.key))
  const declared = missing.filter(field => field.sources.some(source =>
    source.operation.key === item.operation.key && source.origin === 'openapi')).length
  const session = sourceSessions.get(item.operation.key)
  return { ...item, missing, declared, hasResponse: Boolean(session?.result && !session.resultStale),
    readOnly: ['GET', 'HEAD'].includes(item.operation.method) }
}).sort((a, b) => b.missing.length - a.missing.length || Number(b.hasResponse) - Number(a.hasResponse) ||
  b.declared - a.declared || Number(b.readOnly) - Number(a.readOnly)))
const recommendedSources = computed(() => {
  const recommended = [], covered = new Set()
  for (const item of rankedSources.value) {
    if (recommended.length === 3) break
    if (!item.missing.some(field => !covered.has(field.key))) continue
    recommended.push(item)
    for (const field of item.missing) covered.add(field.key)
  }
  const active = rankedSources.value.find(item => item.operation.key === activeSourceKey.value)
  if (active && !recommended.includes(active)) recommended.unshift(active)
  return recommended
})
const sourceChoices = computed(() => moreOpen.value ? rankedSources.value : recommendedSources.value)
const hiddenSourceCount = computed(() => rankedSources.value.length - recommendedSources.value.length)
const filteredField = computed(() => selectedFields.value.find(field => field.key === focusedField.value))
const source = computed(() => sourceOptions.value.find(item => item.operation.key === activeSourceKey.value))
const sourceSession = computed(() => sourceSessions.get(activeSourceKey.value))
const count = computed(() => selectedFields.value.filter(field => collected.has(field.key)).length)
const response = computed(() => {
  const session = sourceSession.value
  return session && !session.pending && !session.resultStale ? session.result : null
})
function selectorsFor(field) {
  return field.sources.filter(item => item.operation.key === activeSourceKey.value).map(item => item.selector)
}
const selectors = computed(() => response.value && source.value
  ? source.value.fields.flatMap(selectorsFor) : [])
function candidatesFor(field, path) {
  const results = new Map([[activeSourceKey.value, [{ ...response.value, selectedPath: path }]]])
  return props.choicesFor(props.operation, field.location, field.name, results)
    .filter(choice => choice.name === field.name && choice.binding)
}
const choices = computed(() => {
  if (!source.value || !response.value) return []
  return source.value.fields.map(field => {
    const selectedPath = response.value.selectedPath
    const matchesAtSelection = selectedPath ? candidatesFor(field, selectedPath) : []
    const objectPaths = selectorsFor(field)
    const direct = candidatesFor(field).filter(choice =>
      selectableOwner(response.value.json, choice.binding.path, objectPaths) === null)
    return { ...field, candidates: matchesAtSelection.length > 1 ? matchesAtSelection : direct }
  })
})
function collectValue(field, candidate) {
  collected.set(field.key, { location: field.location, name: field.name, value: candidate.value })
}
function selectObject(path) {
  if (!source.value || !response.value) return
  for (const field of source.value.fields) {
    const candidates = candidatesFor(field, path)
    if (!collected.has(field.key) && candidates.length === 1) collectValue(field, candidates[0])
  }
}

function activate(item) {
  const key = item.operation.key
  if (!sourceSessions.has(key)) sourceSessions.set(key, props.createSession(item.operation))
  activeSourceKey.value = key
}
watch(sourceOptions, options => {
  if (options.some(item => item.operation.key === activeSourceKey.value)) return
  if (options.length) activate(rankedSources.value[0])
  else activeSourceKey.value = ''
})
watch([() => props.session, () => props.operation?.key, () => props.workspace], () => {
  if (origin.value) dialog.value?.close()
})

async function open(element) {
  if (!props.session || props.session.pending || !props.fields.length || dialog.value.open) return
  trigger = element
  origin.value = props.session
  issue.value = ''
  focusedField.value = ''
  moreOpen.value = false
  selected.clear()
  for (const field of props.fields) if (field.missing) selected.add(field.key)
  await nextTick()
  if (origin.value === props.session) dialog.value.showModal()
}

function close() {
  for (const session of sourceSessions.values()) props.cancelRequest(session)
  sourceSessions.clear()
  activeSourceKey.value = ''
  collected.clear()
  selected.clear()
  origin.value = null
  trigger?.focus()
  trigger = null
}

function toggle(field, enabled) {
  if (enabled) selected.add(field.key)
  else {
    selected.delete(field.key)
    collected.delete(field.key)
    if (focusedField.value === field.key) focusedField.value = ''
  }
  issue.value = ''
}

function collect(field, event) {
  const candidate = field.candidates[Number(event.target.value)]
  if (event.target.value && candidate) collectValue(field, candidate)
  event.target.value = ''
}
function apply() {
  if (!origin.value || origin.value !== props.session || props.session.pending || !count.value) return
  try {
    props.apply(origin.value, selectedFields.value.flatMap(field => collected.has(field.key) ? [collected.get(field.key)] : []))
    dialog.value.close()
  } catch (error) { issue.value = error.message }
}
function label(choice) {
  const value = JSON.stringify(choice.value) ?? ''
  return value.length > 100 ? value.slice(0, 100) + '…' : value
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="collect-dialog" aria-label="Find request values" @close="close">
    <template v-if="origin">
      <header class="collect-header">
        <div><h2>Find request values</h2><code>{{ operation.method }} {{ operation.path }}</code></div>
        <button type="button" class="secondary" aria-label="Close value finder" @click="dialog.close()">×</button>
      </header>
      <div class="collect-workspace">
        <aside>
          <fieldset>
            <legend>Fields to fill</legend>
            <div v-for="field in fields" :key="field.key" class="field-row">
              <label class="field-choice">
                <input type="checkbox" :checked="selected.has(field.key)" @change="toggle(field, $event.target.checked)">
                <span><code>{{ field.name }}</code> <small>{{ field.location }}</small>
                  <small v-if="collected.has(field.key)" class="collected-value">Collected · {{ label(collected.get(field.key)) }}</small>
                </span>
              </label>
              <button v-if="selected.has(field.key)" class="secondary field-filter" type="button"
                :aria-label="'Sources for ' + field.location + ' ' + field.name" :aria-pressed="focusedField === field.key"
                @click="focusedField = focusedField === field.key ? '' : field.key; moreOpen = false">Sources</button>
            </div>
          </fieldset>
          <section aria-label="Suggested source endpoints">
            <h3>{{ filteredField ? 'Sources for ' + filteredField.name : 'Source endpoints' }}</h3>
            <button v-if="filteredField" type="button" class="secondary source-reset"
              @click="focusedField = ''; moreOpen = false">Show sources for all fields</button>
            <p v-if="!sourceOptions.length" class="muted">Select the fields you want to fill.</p>
            <button v-for="item in sourceChoices" :key="item.operation.key" type="button" class="secondary source-option"
              :aria-pressed="activeSourceKey === item.operation.key" @click="activate(item)">
              <strong>{{ item.operation.name }}</strong>
              <code>{{ item.operation.method }} {{ item.operation.path }}</code>
              <small>{{ item.operation.apiName }}</small>
              <small>Can fill: {{ (item.missing.length ? item.missing : item.fields).map(field => field.name).join(', ') }}</small>
            </button>
            <button v-if="hiddenSourceCount" class="secondary" type="button" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
              {{ moreOpen ? 'Fewer sources' : 'More sources (' + hiddenSourceCount + ')' }}
            </button>
          </section>
        </aside>
        <section v-if="source && sourceSession" class="source-workbench" aria-label="Source request">
          <div v-if="choices.some(field => field.candidates.length)" class="response-values" aria-label="Mapped response values">
            <h3>Choose values from the response</h3>
            <label v-for="field in choices.filter(item => item.candidates.length)" :key="field.key">
              <code>{{ field.name }}</code>
              <select :aria-label="'Use response value for ' + field.location + ' ' + field.name"
                @change="collect(field, $event)">
                <option value="">Choose a value…</option>
                <option v-for="(choice, index) in field.candidates" :key="choice.key" :value="String(index)">
                  {{ label(choice) }}{{ choice.binding ? ' · ' + pathLabel(choice.binding.path) : '' }}
                </option>
              </select>
            </label>
          </div>
          <slot :operation="source.operation" :session="sourceSession" :selectors="selectors" :select-object="selectObject" />
        </section>
      </div>
      <footer class="collect-footer">
        <p v-if="issue" role="alert" class="error">{{ issue }}</p>
        <span role="status">{{ count }} of {{ selectedFields.length }} selected fields collected</span>
        <button class="secondary" type="button" @click="dialog.close()">Cancel</button>
        <button class="primary" type="button" :disabled="!count || session.pending" @click="apply">
          Apply {{ count }} {{ count === 1 ? 'value' : 'values' }}
        </button>
      </footer>
    </template>
  </dialog>
</template>

<style scoped>
.collect-dialog { width: min(76rem, calc(100vw - 1.5rem)); max-height: calc(100dvh - 1.5rem); padding: 0; overflow: auto; color: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: .7rem; }
.collect-dialog::backdrop { background: #0006; }
.collect-header, .collect-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .6rem; padding: .7rem 1rem; background: var(--surface); }
.collect-header { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--line); }
.collect-footer { position: sticky; bottom: 0; z-index: 2; justify-content: flex-end; border-top: 1px solid var(--line); }
.collect-footer span { margin-right: auto; color: var(--muted); font-size: .8rem; }
.collect-footer p { flex-basis: 100%; margin: 0; }
.collect-workspace { display: grid; grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr); gap: .8rem; padding: .8rem; }
aside, .source-workbench { min-width: 0; overflow-wrap: anywhere; }
fieldset { border: 1px solid var(--line); border-radius: .45rem; margin: 0 0 .75rem; padding: .5rem; }
.field-row { display: flex; align-items: flex-start; justify-content: space-between; gap: .25rem; }
.field-filter, .source-reset { padding: .15rem .35rem; font-size: .72rem; }
.source-reset { margin-bottom: .35rem; }
.field-filter[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
.field-choice { display: flex; align-items: flex-start; gap: .35rem; margin: .25rem 0; font-size: .82rem; }
.collected-value { display: block; color: var(--accent); }
.source-option { display: grid; gap: .2rem; width: 100%; text-align: left; margin-bottom: .35rem; }
.source-option[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
h2, h3 { margin: 0 0 .25rem; font-size: 1rem; }
.response-values { display: grid; gap: .4rem; border: 1px solid var(--line); border-radius: .45rem; padding: .6rem; margin-bottom: .6rem; background: var(--subtle); }
.response-values label { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; }
.response-values select { width: min(100%, 30rem); }
@media (max-width: 700px) { .collect-workspace { grid-template-columns: minmax(0, 1fr); } }
</style>
