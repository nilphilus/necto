<script setup>
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { isResponseStale } from '../request-runner/responseFreshness.js'
import { pathLabel, selectableOwner } from '../payload-search/search.js'

const props = defineProps({
  operation: Object, session: Object, workspace: String, fields: Array, configuration: Object, valuesFor: Function,
  choicesFor: Function, createSession: Function, cancelRequest: Function, apply: Function,
})
const dialog = ref(null)
const origin = shallowRef(null)
const selected = reactive(new Set())
const collected = reactive(new Map())
const sourceSessions = reactive(new Map())
const activeSourceKey = ref('')
const focusedField = ref('')
const editingField = ref('')
const activePosition = ref(0)
const moreOpen = ref(false)
const sourceQuery = ref('')
const selectionFeedback = shallowRef(null)
const rememberedChecks = new WeakMap()
const priorChecks = shallowRef(null)
const issue = ref('')
let trigger

watch(moreOpen, open => { if (!open) sourceQuery.value = '' })

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
  const missing = item.fields.filter(field => canCollect(field))
  const declared = missing.filter(field => field.sources.some(source =>
    source.operation.key === item.operation.key && source.origin === 'openapi')).length
  const session = sourceSessions.get(item.operation.key)
  const result = !session?.pending && session && !staleFor(item.operation, session) ? session?.result : null
  const checked = result?.ok && !result.incomplete
  const available = checked ? missing.filter(field => candidatesFor(field, undefined, item.operation.key, result).length) : []
  const useful = checked ? available : missing.filter(field => !priorChecks.value?.has(checkKey(field, item.operation.key)))
  return { ...item, missing, useful, declared, available: available.length,
    readOnly: ['GET', 'HEAD'].includes(item.operation.method) }
}).sort((a, b) => b.useful.length - a.useful.length || b.available - a.available ||
  b.declared - a.declared || Number(b.readOnly) - Number(a.readOnly)))
const recommendedSources = computed(() => {
  const recommended = [], covered = new Set()
  for (const item of rankedSources.value) {
    if (recommended.length === 3) break
    if (!item.useful.some(field => !covered.has(field.key))) continue
    recommended.push(item)
    for (const field of item.useful) covered.add(field.key)
  }
  const active = rankedSources.value.find(item => item.operation.key === activeSourceKey.value)
  if (active && !recommended.includes(active)) recommended.push(active)
  return recommended
})
const orderedSources = computed(() => {
  const options = moreOpen.value ? rankedSources.value : recommendedSources.value
  const active = options.find(item => item.operation.key === activeSourceKey.value)
  if (!active) return options
  const ordered = options.filter(item => item !== active)
  ordered.splice(activePosition.value, 0, active)
  return ordered
})
const sourceChoices = computed(() => {
  const query = moreOpen.value ? sourceQuery.value.trim().toLowerCase() : ''
  return orderedSources.value.filter(({ operation }) =>
    !query || `${operation.method} ${operation.path} ${operation.name}`.toLowerCase().includes(query))
})
const hiddenSourceCount = computed(() => rankedSources.value.length - recommendedSources.value.length)
const filteredField = computed(() => selectedFields.value.find(field => field.key === focusedField.value))
const source = computed(() => sourceOptions.value.find(item => item.operation.key === activeSourceKey.value))
const sourceSession = computed(() => sourceSessions.get(activeSourceKey.value))
const missingFields = computed(() => selectedFields.value.filter(field => !collected.has(field.key)))
const count = computed(() => selectedFields.value.filter(field => collected.has(field.key)).length)
function staleFor(operation, session) {
  return isResponseStale(operation, props.configuration, session, props.valuesFor(operation))
}
const staleSourceResponse = computed(() => source.value && sourceSession.value &&
  staleFor(source.value.operation, sourceSession.value))
const response = computed(() => {
  const session = sourceSession.value
  return session && !session.pending && !staleSourceResponse.value ? session.result : null
})
const selectionNote = computed(() => {
  const feedback = selectionFeedback.value
  if (!feedback || feedback.result !== response.value ||
      JSON.stringify(feedback.path) !== JSON.stringify(response.value?.selectedPath)) return ''
  return [
    feedback.chosen.length && `Collected: ${fieldNames(feedback.chosen)}`,
    feedback.ambiguous.length && `Choose a value for: ${fieldNames(feedback.ambiguous)}`,
  ].filter(Boolean).join(' · ')
})
function selectorsFor(field) {
  return field.sources.filter(item => item.operation.key === activeSourceKey.value).map(item => item.selector)
}
const selectors = computed(() => response.value && source.value
  ? source.value.fields.flatMap(selectorsFor) : [])
function candidatesFor(field, path, key = activeSourceKey.value, result = response.value) {
  const results = new Map([[key, [{ ...result, selectedPath: path }]]])
  return props.choicesFor(props.operation, field.location, field.name, results)
    .filter(choice => choice.name === field.name && choice.binding)
}
const mappedFields = computed(() => source.value && response.value
  ? source.value.fields.map(field => ({ ...field, mapped: candidatesFor(field) }))
  : [])
const foundFields = computed(() => mappedFields.value.filter(field => field.mapped.length))
const unavailableFields = computed(() => response.value?.ok && !response.value.incomplete
  ? mappedFields.value.filter(field => canCollect(field) && !field.mapped.length)
  : [])
function alternatives(field, key = activeSourceKey.value) {
  return field.sources.filter(item => item.operation.key !== key)
}
function mappedPaths(field, key = activeSourceKey.value) {
  return [...new Set(field.sources.filter(item => item.operation.key === key).map(item => item.path))].join(', ')
}
function checkKey(field, operationKey) {
  return JSON.stringify([operationKey, field.key, field.sources
    .filter(source => source.operation.key === operationKey)
    .map(source => JSON.stringify([source.id, source.operation.configuration?.openApiUrl])).sort()])
}
function checkedFields(item) {
  const key = item.operation.key
  if (sourceSessions.get(key)?.result || sourceSessions.get(key)?.pending) return []
  return item.fields.filter(field => priorChecks.value?.has(checkKey(field, key)))
}
function rememberChecks() {
  const checks = new Set(priorChecks.value)
  for (const [key, session] of sourceSessions) {
    if (!session.result?.ok || session.result.incomplete || session.pending) continue
    for (const field of selectedFields.value) {
      const match = field.sources.find(source => source.operation.key === key)
      if (!match || staleFor(match.operation, session)) continue
      const signature = checkKey(field, key)
      if (candidatesFor(field, undefined, key, session.result).length) checks.delete(signature)
      else checks.add(signature)
    }
  }
  rememberedChecks.set(origin.value, { workspace: props.workspace, operation: props.operation, checks })
}
const choices = computed(() => mappedFields.value.filter(canCollect).map(field => {
  const selectedPath = response.value.selectedPath
  const matchesAtSelection = selectedPath ? candidatesFor(field, selectedPath) : []
  const objectPaths = selectorsFor(field)
  const direct = field.mapped.filter(choice =>
    selectableOwner(response.value.json, choice.binding.path, objectPaths) === null)
  return { ...field, candidates: matchesAtSelection.length > 1 ? matchesAtSelection : direct }
}))
function fieldNames(fields) {
  return fields.map(field => field.name).join(', ')
}

function canCollect(field) {
  return !collected.has(field.key) || editingField.value === field.key
}
function collectValue(field, candidate) {
  collected.set(field.key, {
    location: field.location, name: field.name, value: candidate.value, source: source.value.operation.name,
  })
  if (editingField.value === field.key) {
    editingField.value = ''
    focusedField.value = ''
  }
}
function changeValue(field) {
  const cancel = editingField.value === field.key
  editingField.value = cancel ? '' : field.key
  focusedField.value = cancel ? '' : field.key
  moreOpen.value = false
}
function removeValue(field) {
  collected.delete(field.key)
  if (editingField.value === field.key) editingField.value = ''
}
function canSelect(path) {
  return Boolean(response.value && source.value?.fields.some(field =>
    canCollect(field) && candidatesFor(field, path).length))
}
async function selectObject(path, event) {
  if (!source.value || !response.value) return
  const useKeyboard = event?.detail === 0
  const result = response.value
  const chosen = [], ambiguous = []
  for (const field of source.value.fields) {
    if (!canCollect(field)) continue
    const candidates = candidatesFor(field, path)
    if (candidates.length === 1) {
      collectValue(field, candidates[0])
      chosen.push(field)
    } else if (candidates.length > 1) ambiguous.push(field)
  }
  selectionFeedback.value = { result, path, chosen, ambiguous }
  if (!useKeyboard) return
  await nextTick()
  if (!dialog.value?.open) return
  const selector = ambiguous.length ? '.response-values select' :
    missingFields.value.length ? '.collection-progress button' : '.collect-footer .primary'
  focusElement(dialog.value.querySelector(selector))
}
function focusElement(element) {
  element?.scrollIntoView({ block: 'nearest' })
  element?.focus({ preventScroll: true })
}
async function focusSources(field, exclude) {
  focusedField.value = field.key
  sourceQuery.value = ''
  const keys = [...new Set(field.sources.map(item => item.operation.key))]
  if (!exclude && keys.length === 1) {
    const item = sourceOptions.value.find(item => item.operation.key === keys[0])
    if (item) activate(item)
    await nextTick()
    focusElement(dialog.value.querySelector('.source-workbench .request-footer button[type="submit"]'))
    return
  }
  moreOpen.value = Boolean(exclude)
  await nextTick()
  const button = [...dialog.value.querySelectorAll('[data-source-key]')]
    .find(element => element.dataset.sourceKey !== exclude)
  focusElement(button)
}
function focusMissingField() {
  if (missingFields.value[0]) void focusSources(missingFields.value[0])
}

function activate(item) {
  const key = item.operation.key
  activePosition.value = Math.max(0, orderedSources.value.findIndex(option => option.operation.key === key))
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

async function open(element, location, name) {
  if (!props.session || props.session.pending || !props.fields.length || dialog.value.open) return
  trigger = element
  origin.value = props.session
  const previous = rememberedChecks.get(props.session)
  priorChecks.value = previous && previous.workspace === props.workspace && previous.operation === props.operation
    ? previous.checks : null
  issue.value = ''
  focusedField.value = ''
  editingField.value = ''
  activePosition.value = 0
  moreOpen.value = false
  selected.clear()
  sourceQuery.value = ''
  selectionFeedback.value = null
  const requested = props.fields.find(field => field.location === location && field.name === name)
  for (const field of props.fields) if (requested ? field === requested : field.missing) selected.add(field.key)
  await nextTick()
  if (origin.value === props.session) dialog.value.showModal()
}

function close() {
  for (const session of sourceSessions.values()) props.cancelRequest(session)
  sourceSessions.clear()
  activeSourceKey.value = ''
  collected.clear()
  selectionFeedback.value = null
  selected.clear()
  origin.value = null
  priorChecks.value = null
  trigger?.focus()
  trigger = null
}

function toggle(field, enabled) {
  if (enabled) selected.add(field.key)
  else {
    selected.delete(field.key)
    if (editingField.value === field.key) editingField.value = ''
    if (focusedField.value === field.key) focusedField.value = ''
  }
  issue.value = ''
}

function collect(field, event) {
  const candidate = field.candidates[Number(event.target.value)]
  if (event.target.value && candidate) {
    const feedback = selectionFeedback.value
    collectValue(field, candidate)
    if (feedback && feedback.result === response.value && feedback.ambiguous.some(item => item.key === field.key)) {
      selectionFeedback.value = { ...feedback, chosen: [...feedback.chosen, field],
        ambiguous: feedback.ambiguous.filter(item => item.key !== field.key) }
    }
  }
  event.target.value = ''
}
function apply() {
  if (!origin.value || origin.value !== props.session || props.session.pending || !count.value) return
  try {
    props.apply(origin.value, selectedFields.value.flatMap(field => collected.has(field.key) ? [collected.get(field.key)] : []))
    rememberChecks()
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
                  <small v-if="collected.has(field.key)" class="collected-value">{{ selected.has(field.key) ? 'Collected' : 'Excluded' }} · {{ label(collected.get(field.key)) }} · {{ collected.get(field.key).source }}</small>
                </span>
              </label>
              <div v-if="selected.has(field.key) && collected.has(field.key)" class="field-actions">
                <button class="secondary field-filter" type="button"
                  :aria-label="(editingField === field.key ? 'Cancel change for ' : 'Change ') + field.location + ' ' + field.name"
                  @click="changeValue(field)">{{ editingField === field.key ? 'Cancel change' : 'Change' }}</button>
                <button class="secondary field-filter" type="button" :aria-label="'Remove ' + field.location + ' ' + field.name"
                  @click="removeValue(field)">Remove</button>
              </div>
              <button v-else-if="selected.has(field.key)" class="secondary field-filter" type="button"
                :aria-label="'Sources for ' + field.location + ' ' + field.name" :aria-pressed="focusedField === field.key"
                @click="focusedField = focusedField === field.key ? '' : field.key; moreOpen = false">Sources</button>
            </div>
          </fieldset>
          <section aria-label="Suggested source endpoints">
            <h3>{{ filteredField ? 'Sources for ' + filteredField.name : 'Source endpoints' }}</h3>
            <button v-if="filteredField" type="button" class="secondary source-reset"
              @click="focusedField = ''; moreOpen = false">Show sources for all fields</button>
            <p v-if="!sourceOptions.length" class="muted">Select the fields you want to fill.</p>
            <input v-if="moreOpen && hiddenSourceCount" v-model="sourceQuery" class="source-search" type="search"
              aria-label="Filter source endpoints" placeholder="Filter by name, method or path">
            <p v-if="moreOpen && sourceQuery.trim() && !sourceChoices.length" class="muted" role="status">No matching sources.</p>
            <button v-for="item in sourceChoices" :key="item.operation.key" type="button" class="secondary source-option"
              :data-source-key="item.operation.key" :aria-pressed="activeSourceKey === item.operation.key" @click="activate(item)">
              <strong>{{ item.operation.name }}</strong>
              <code>{{ item.operation.method }} {{ item.operation.path }}</code>
              <small>{{ item.operation.apiName }}</small>
              <small v-if="checkedFields(item).length">Checked · no values found for {{ fieldNames(checkedFields(item)) }}</small>
              <small>Can fill: {{ fieldNames(item.missing.length ? item.missing : item.fields) }}</small>
            </button>
            <button v-if="hiddenSourceCount" class="secondary" type="button" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
              {{ moreOpen ? 'Fewer sources' : 'More sources (' + hiddenSourceCount + ')' }}
            </button>
          </section>
        </aside>
        <section v-if="source && sourceSession" class="source-workbench" aria-label="Source request">
          <header class="active-source" aria-label="Active source endpoint">
            <div>
              <strong>{{ source.operation.name }}</strong>
              <code>{{ source.operation.method }} {{ source.operation.path }}</code>
              <small v-if="source.operation.apiId !== 'local'">{{ source.operation.apiName }}</small>
            </div>
            <small role="status">
              <template v-if="sourceSession.pending">Checking response…</template>
              <template v-else-if="staleSourceResponse">Send the updated request to collect values.</template>
              <template v-else-if="response?.incomplete">Response incomplete.</template>
              <template v-else-if="!response && checkedFields(source).length">Checked · no values found for {{ fieldNames(checkedFields(source)) }}</template>
              <template v-else-if="!response">Can fill: {{ fieldNames(source.fields) }}</template>
              <template v-else-if="foundFields.length">Values found: {{ fieldNames(foundFields) }}</template>
              <template v-else>No mapped values found in this response.</template>
            </small>
            <div v-for="field in unavailableFields" :key="field.key" class="unavailable-field">
              <small><code>{{ field.name }}</code> · expected <code>{{ mappedPaths(field) }}</code></small>
              <button v-if="alternatives(field).length" type="button" class="secondary"
                @click="focusSources(field, activeSourceKey)">Other sources for {{ field.name }}</button>
            </div>
          </header>
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
          <slot :operation="source.operation" :session="sourceSession" :selectors="selectors" :select-object="selectObject" :can-select="canSelect" :selection-note="selectionNote" />
        </section>
      </div>
      <footer class="collect-footer">
        <p v-if="issue" role="alert" class="error">{{ issue }}</p>
        <div class="collection-progress">
          <span role="status">{{ count }} of {{ selectedFields.length }} selected fields collected</span>
          <button v-if="missingFields.length" type="button" class="secondary" @click="focusMissingField">
            {{ missingFields.length === 1 ? 'Missing: ' + missingFields[0].name : missingFields.length + ' missing' }}
          </button>
        </div>
        <button class="secondary" type="button" @click="dialog.close()">Cancel</button>
        <button class="primary" type="button" :disabled="!count || session.pending" @click="apply">
          Apply {{ count }} {{ count === 1 ? 'value' : 'values' }}
        </button>
      </footer>
    </template>
  </dialog>
</template>

<style scoped>
.collect-dialog { width: min(76rem, calc(100vw - 1.5rem)); max-height: calc(100dvh - 1.5rem); padding: 0; overflow: hidden; color: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: .7rem; }
.collect-dialog[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
.collect-dialog::backdrop { background: #0006; }
.collect-header, .collect-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .6rem; padding: .7rem 1rem; background: var(--surface); }
.collect-header { border-bottom: 1px solid var(--line); }
.collect-footer { justify-content: flex-end; border-top: 1px solid var(--line); }
.collection-progress { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; margin-right: auto; }
.collection-progress button { padding: .2rem .4rem; }
.collect-footer span { color: var(--muted); font-size: .8rem; }
.collect-footer p { flex-basis: 100%; margin: 0; }
.collect-workspace { display: grid; min-height: 0; overflow: auto; grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr); gap: .8rem; padding: .8rem; }
aside, .source-workbench { min-width: 0; overflow-wrap: anywhere; }
fieldset { border: 1px solid var(--line); border-radius: .45rem; margin: 0 0 .75rem; padding: .5rem; }
.field-row { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: .25rem; }
.field-actions { display: flex; flex-wrap: wrap; gap: .2rem; margin: 0 0 .25rem auto; }
.field-filter, .source-reset { padding: .15rem .35rem; font-size: .72rem; }
.source-reset { margin-bottom: .35rem; }
.field-filter[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
.field-choice { display: flex; align-items: flex-start; gap: .35rem; margin: .25rem 0; font-size: .82rem; }
.collected-value { display: block; color: var(--accent); }
.source-search { width: 100%; margin-bottom: .35rem; }
.source-option { display: grid; gap: .2rem; width: 100%; text-align: left; margin-bottom: .35rem; }
.source-option[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
.active-source { position: sticky; top: 0; z-index: 2; display: grid; gap: .2rem; padding: .5rem .65rem; margin-bottom: .6rem; border: 1px solid var(--line); border-radius: .45rem; background: var(--surface); }
.active-source > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: .25rem .5rem; }
.unavailable-field { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; }
.unavailable-field button { padding: .15rem .35rem; font-size: .75rem; }
.active-source small { color: var(--muted); }
h2, h3 { margin: 0 0 .25rem; font-size: 1rem; }
.response-values { display: grid; gap: .4rem; border: 1px solid var(--line); border-radius: .45rem; padding: .6rem; margin-bottom: .6rem; background: var(--subtle); }
.response-values label { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; }
.response-values select { width: min(100%, 30rem); }
@media (max-width: 700px) { .collect-workspace { grid-template-columns: minmax(0, 1fr); } }
</style>
