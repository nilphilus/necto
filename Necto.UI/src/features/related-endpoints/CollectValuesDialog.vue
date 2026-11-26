<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { isResponseStale } from '../request-runner/responseFreshness.js'
import { applyCollectedValues, collectionFields } from './collectionFields.js'
import { applyBodyPresets, contextKey, fieldKey, supportedParameters } from '../request-runner/request.js'
import { bodyContent, isJson } from '../workbench/body.js'
import { redactSchema } from '../workbench/sensitiveSchema.js'
import { sensitiveName } from '../workbench/privacy.js'
import { collectedValueIssue } from './collectedValueIssue.js'
import { pathLabel, selectableOwner } from '../payload-search/search.js'

const props = defineProps({
  operation: Object, session: Object, workspace: String, fields: Array, configuration: Object, valuesFor: Function,
  sourcesFor: Function, ancestors: Array, choicesFor: Function, createSession: Function, cancelRequest: Function, apply: Function,
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
  return { ...item, missing, useful, declared, available: available.length, checked,
    found: available, notFound: checked ? missing.filter(field => !available.includes(field)) : [],
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
function prerequisiteSources(location, name) {
  const operation = source.value?.operation
  if (!operation) return []
  return props.sourcesFor(operation, location, name).filter(item =>
    item.operation.key !== props.operation.key && !props.ancestors.includes(item.operation.key))
}
const prerequisiteFields = computed(() => {
  const operation = source.value?.operation
  if (!operation || !sourceSession.value) return []
  return collectionFields(operation, sourceSession.value, props.valuesFor(operation),
    (_, location, name) => prerequisiteSources(location, name))
})
const requestValuesByName = computed(() => {
  const values = new Map()
  if (!origin.value || source.value?.operation.apiId !== props.operation.apiId) return values
  function add(name, value) {
    if (sensitiveName(name) || value === '' || !['number', 'boolean', 'string'].includes(typeof value)) return
    if (!values.has(name)) values.set(name, [])
    values.get(name).push(value)
  }

  const presets = props.valuesFor(props.operation)
  for (const parameter of supportedParameters(props.operation)) {
    if (!presets.has(contextKey(parameter)) && parameter['x-necto-sensitive'] !== true &&
        props.operation.resolve(parameter.schema)?.['x-necto-sensitive'] !== true) add(parameter.name, origin.value.fields[fieldKey(parameter)])
  }
  const media = bodyContent(props.operation, origin.value)
  if (isJson(media?.[0] ?? '')) {
    let body
    try {
      body = redactSchema(JSON.parse(origin.value.body), media[1].schema, props.operation.resolve, 'omit')
    }
    catch { return values }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const presetFields = new Set(applyBodyPresets(props.operation, origin.value.body, presets, origin.value.mediaType)
        .sources.map(source => source.path[0]))
      for (const [name, value] of Object.entries(body)) if (!presetFields.has(name)) add(name, value)
    }
  }
  return values
})
const reusableValues = computed(() => {
  const result = {}
  if (!source.value || !sourceSession.value) return result
  const operation = source.value.operation
  for (const parameter of supportedParameters(operation)) {
    const key = fieldKey(parameter)
    const current = sourceSession.value.fields[key]
    if (sensitiveName(parameter.name) || (current !== undefined && current !== '')) continue
    const schema = operation.resolve(parameter.schema)
    const field = { location: parameter.in, required: parameter.required || parameter.in === 'path',
      schemas: schema ? [schema] : [] }
    const candidates = new Map()
    for (const [collectedKey, pick] of collected) {
      if (!selected.has(collectedKey)) continue
      if (pick.name !== parameter.name || collectedValueIssue(field, pick.value)) continue
      candidates.set(JSON.stringify(pick.value), { ...pick, location: parameter.in, name: parameter.name })
    }
    if (!candidates.size) {
      for (const value of requestValuesByName.value.get(parameter.name) ?? []) {
        if (collectedValueIssue(field, value)) continue
        candidates.set(JSON.stringify(value), { value, location: parameter.in, name: parameter.name,
          source: 'Current request', fromRequest: true })
      }
    }
    if (candidates.size) result[key] = [...candidates.values()]
  }
  return result
})
function reuseValue(location, name, index = 0) {
  const choice = reusableValues.value[`${location}:${name}`]?.[index]
  if (choice && sourceSession.value && !sourceSession.value.pending) applyCollectedValues(sourceSession.value, [choice])
}
const missingFields = computed(() => selectedFields.value.filter(field => !collected.has(field.key)))
const mappedRequiredFieldsFilled = computed(() => {
  const required = props.fields.filter(field => field.required)
  return required.length > 0 && required.every(field => !field.missing)
})
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
function mappedCandidates(field, path, key, result) {
  const results = new Map([[key, [{ ...result, selectedPath: path }]]])
  const name = field.mappingName ?? field.name
  return props.choicesFor(props.operation, field.location, name, results, field.mappingPath)
    .filter(choice => choice.name === name && choice.binding)
}
function candidatesFor(field, path, key = activeSourceKey.value, result = response.value) {
  return mappedCandidates(field, path, key, result).filter(choice => !collectedValueIssue(field, choice.value))
}
const mappedFields = computed(() => source.value && response.value
  ? source.value.fields.map(field => {
    const mapped = [], rejected = []
    for (const choice of mappedCandidates(field, undefined, activeSourceKey.value, response.value)) {
      const issue = collectedValueIssue(field, choice.value)
      if (issue) rejected.push({ choice, issue })
      else mapped.push(choice)
    }
    return { ...field, mapped, rejected }
  })
  : [])
const rejectedFields = computed(() => mappedFields.value.filter(field => canCollect(field) && field.rejected.length))
const foundFields = computed(() => mappedFields.value.filter(field => field.mapped.length))
const sourceHttpError = computed(() => response.value && !response.value.ok && !response.value.incomplete)
const sourceRequestFailed = computed(() => !sourceSession.value?.pending && Boolean(sourceSession.value?.error))
const unavailableFields = computed(() => {
  if (sourceRequestFailed.value) return source.value?.fields.filter(canCollect) ?? []
  if (!response.value || response.value.incomplete) return []
  return mappedFields.value.filter(field => canCollect(field) && !field.mapped.length)
})
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
    location: field.location, name: field.name, bodyPath: field.bodyPath, value: candidate.value, source: source.value.operation.name,
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
function arrayTargetKey(field) {
  return field.bodyPath ? JSON.stringify([field.mappingPath, field.mappingName]) : null
}

const nextArrayTargets = computed(() => {
  const groups = new Map()
  for (const field of source.value?.fields ?? []) {
    const key = arrayTargetKey(field)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(field)
  }
  return [...groups.values()].filter(group => group.length > 1)
    .map(group => group.find(canCollect)).filter(Boolean)
})

function canSelect(path) {
  return Boolean(response.value && source.value?.fields.some(field =>
    canCollect(field) && candidatesFor(field, path).length))
}
async function selectObject(path, event) {
  if (!source.value || !response.value) return
  const useKeyboard = event?.detail === 0
  const result = response.value
  const chosen = [], ambiguous = []
  const assignedArrayTargets = new Set()
  for (const field of source.value.fields) {
    const key = arrayTargetKey(field)
    if (!canCollect(field) || assignedArrayTargets.has(key)) continue
    const candidates = candidatesFor(field, path)
    if (key && candidates.length) assignedArrayTargets.add(key)
    if (candidates.length === 1) {
      collectValue(field, candidates[0])
      chosen.push(field)
    } else if (candidates.length > 1) ambiguous.push(field)
  }
  selectionFeedback.value = { result, path, chosen, ambiguous }
  if (!useKeyboard) return
  await nextTick()
  if (!dialog.value?.open || (!ambiguous.length && nextArrayTargets.value.length)) return
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
    const request = dialog.value.querySelector('.source-workbench .request-pane')
    const missingInput = request?.querySelector(
      '[data-missing-request-input] input, [data-missing-request-input] select, textarea[required]:invalid',
    )
    focusElement(missingInput?.offsetParent ? missingInput : request?.querySelector('.request-footer button[type="submit"]'))
    return
  }
  moreOpen.value = Boolean(exclude)
  await nextTick()
  const button = [...dialog.value.querySelectorAll('[data-source-key]')]
    .find(element => element.dataset.sourceKey !== exclude)
  focusElement(button)
}
function focusMissingField() {
  const field = missingFields.value.find(item => item.required) ?? missingFields.value[0]
  if (field) void focusSources(field)
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
  for (const field of props.fields) if (requested ? field === requested : field.missing && field.required && !field.bodyPath) selected.add(field.key)
  await nextTick()
  if (origin.value === props.session) dialog.value.showModal()
}

function discardSourceSessions() {
  for (const session of sourceSessions.values()) props.cancelRequest(session)
  sourceSessions.clear()
}
onBeforeUnmount(discardSourceSessions)

function close() {
  discardSourceSessions()
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
  <dialog ref="dialog" class="collect-dialog" :aria-label="ancestors.length ? 'Find source inputs' : 'Find request values'" @close="close">
    <template v-if="origin">
      <header class="collect-header">
        <div><h2>{{ ancestors.length ? 'Find source inputs' : 'Find request values' }}</h2><code>{{ operation.method }} {{ operation.path }}</code></div>
        <button type="button" class="secondary" aria-label="Close value finder" @click="dialog.close()">×</button>
      </header>
      <div class="collect-workspace">
        <aside>
          <fieldset>
            <legend>Fields to fill</legend>
            <div v-for="field in fields" :key="field.key" class="field-row">
              <label class="field-choice">
                <input type="checkbox" :checked="selected.has(field.key)" @change="toggle(field, $event.target.checked)">
                <span><code>{{ field.name }}</code> <small>{{ field.location }} · {{ field.required ? 'required' : 'optional' }}</small>
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
          <section v-if="selectedFields.length" aria-label="Suggested source endpoints">
            <h3>{{ filteredField ? 'Sources for ' + filteredField.name : 'Source endpoints' }}</h3>
            <button v-if="filteredField" type="button" class="secondary source-reset"
              @click="focusedField = ''; moreOpen = false">Show sources for all fields</button>
            <p v-if="!sourceOptions.length" class="muted">No sources for the selected fields.</p>
            <input v-if="moreOpen && hiddenSourceCount" v-model="sourceQuery" class="source-search" type="search"
              aria-label="Filter source endpoints" placeholder="Filter by name, method or path">
            <p v-if="moreOpen && sourceQuery.trim() && !sourceChoices.length" class="muted" role="status">No matching sources.</p>
            <button v-for="item in sourceChoices" :key="item.operation.key" type="button" class="secondary source-option"
              :data-source-key="item.operation.key" :aria-pressed="activeSourceKey === item.operation.key" @click="activate(item)">
              <strong>{{ item.operation.name }}</strong>
              <code>{{ item.operation.method }} {{ item.operation.path }}</code>
              <small>{{ item.operation.apiName }}</small>
              <template v-if="item.checked">
                <small v-if="item.found.length">Values found: {{ fieldNames(item.found) }}</small>
                <small v-if="item.notFound.length">No values found for {{ fieldNames(item.notFound) }}</small>
              </template>
              <template v-else-if="checkedFields(item).length">
                <small>Checked · no values found for {{ fieldNames(checkedFields(item)) }}</small>
                <small v-if="item.useful.length">Can fill: {{ fieldNames(item.useful) }}</small>
              </template>
              <small v-else>Can fill: {{ fieldNames(item.missing.length ? item.missing : item.fields) }}</small>
            </button>
            <button v-if="hiddenSourceCount" class="secondary" type="button" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
              {{ moreOpen ? 'Fewer sources' : 'More sources (' + hiddenSourceCount + ')' }}
            </button>
          </section>
        </aside>
        <div v-if="!selectedFields.length" class="collection-empty" role="status">
          <template v-if="mappedRequiredFieldsFilled">
            <strong>All mapped required fields are filled</strong>
            <p>Select an optional field or a value you want to replace.</p>
          </template>
          <template v-else>
            <strong>Choose a field to collect</strong>
            <p>Select a field under “Fields to fill” to see its sources.</p>
          </template>
        </div>
        <section v-else-if="source && sourceSession" class="source-workbench" aria-label="Source request">
          <header class="active-source" aria-label="Active source endpoint">
            <div>
              <strong>{{ source.operation.name }}</strong>
              <code>{{ source.operation.method }} {{ source.operation.path }}</code>
              <small v-if="source.operation.apiId !== 'local'">{{ source.operation.apiName }}</small>
            </div>
            <small role="status">
              <template v-if="sourceSession.pending">Checking response…</template>
              <template v-else-if="sourceRequestFailed">Source request failed.</template>
              <template v-else-if="sourceHttpError">Source returned HTTP {{ response.status }}.<template v-if="foundFields.length"> Values found: {{ fieldNames(foundFields) }}.</template></template>
              <template v-else-if="staleSourceResponse">Send the updated request to collect values.</template>
              <template v-else-if="response?.incomplete">Response incomplete.</template>
              <template v-else-if="!response && checkedFields(source).length">Checked · no values found for {{ fieldNames(checkedFields(source)) }}</template>
              <template v-else-if="!response">Can fill: {{ fieldNames(source.fields) }}</template>
              <template v-else-if="foundFields.length">Values found: {{ fieldNames(foundFields) }}</template>
              <template v-else>No mapped values found in this response.</template>
            </small>
            <div v-for="field in unavailableFields" :key="field.key" class="unavailable-field">
              <small><code>{{ field.name }}</code><template v-if="!sourceHttpError && !sourceRequestFailed"> · expected <code>{{ mappedPaths(field) }}</code></template></small>
              <button v-if="alternatives(field).length" type="button" class="secondary"
                @click="focusSources(field, activeSourceKey)">Other sources for {{ field.name }}</button>
            </div>
          </header>
          <small v-if="nextArrayTargets.length" role="status">
            Next array position{{ nextArrayTargets.length === 1 ? '' : 's' }} · {{ fieldNames(nextArrayTargets) }}
          </small>
          <div v-if="rejectedFields.length" class="response-values" aria-label="Incompatible mapped values">
            <h3>Values unavailable for selection</h3>
            <small v-for="field in rejectedFields" :key="field.key">
              <code>{{ field.name }}</code> · {{ label(field.rejected[0].choice) }} — {{ field.rejected[0].issue }}<template v-if="field.rejected.length > 1"> · {{ field.rejected.length - 1 }} more</template>
            </small>
          </div>
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
          <slot :operation="source.operation" :session="sourceSession" :selectors="selectors" :select-object="selectObject" :can-select="canSelect" :selection-note="selectionNote"
            :reusable-values="reusableValues" :reuse-value="reuseValue" :value-label="label" :prerequisite-fields="prerequisiteFields" :prerequisite-sources="prerequisiteSources" />
        </section>
      </div>
      <footer class="collect-footer">
        <p v-if="issue" role="alert" class="error">{{ issue }}</p>
        <div v-if="selectedFields.length" class="collection-progress">
          <span role="status">{{ count }} of {{ selectedFields.length }} selected fields collected</span>
          <button v-if="missingFields.length" type="button" class="secondary" @click="focusMissingField">
            {{ missingFields.length === 1 ? 'Missing: ' + missingFields[0].name : missingFields.length + ' missing' }}
          </button>
        </div>
        <button class="secondary" type="button" @click="dialog.close()">{{ ancestors.length ? 'Back to source request' : 'Cancel' }}</button>
        <button v-if="count" class="primary" type="button" :disabled="session.pending" @click="apply">
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
.collection-empty { padding: .75rem; align-self: start; }
.collection-empty p { margin: .25rem 0 0; color: var(--muted); }
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
