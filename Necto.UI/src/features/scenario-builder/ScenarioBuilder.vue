<script setup>
import BuilderErrorNotice from './BuilderErrorNotice.vue'
import { isLocalStep, localOperation, localStepInput } from './localStep.js'
import RandomSourceEditor from './RandomSourceEditor.vue'
import ExpressionEditor from './ExpressionEditor.vue'
import ScenarioRunReview from './ScenarioRunReview.vue'
import { suggestRunPresets } from './reviewPresets.js'
import { parseBuilderImport } from './definitionImport.js'
import { suggestInputs } from './inputSuggestions.js'
import FolderFeedback from '../scenario-folder/FolderFeedback.vue'
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import SentRequest from './SentRequest.vue'
import { removeStepDraft, restoreStepDraft } from './stepUndo.js'
import ResponseChecksEditor from '../workbench/ResponseChecksEditor.vue'
import ScenarioMap from './ScenarioMap.vue'
import StepInputs from './StepInputs.vue'
import SharedVariables from './SharedVariables.vue'
import { variableProducer, inputProducers } from './variables.js'
import StepWaiting from './StepWaiting.vue'
import {
  dependencies,
  newBlueprint,
  newId,
  newStep,
  validateBlueprint,
} from './model.js'
import { configureEndpoint } from './stepDraft.js'
import { normalizeParameterNames } from './parameterNames.js'
import { remainingSteps } from './runner.js'
import { prepareBlueprint } from './prepareBlueprint.js'
import { allConnections, connectionKey, connectionSummary } from './connections.js'
import { waitOptions } from './waiting.js'
import ScenarioBodyEditor from './ScenarioBodyEditor.vue'
import ExpandedResponse from './ExpandedResponse.vue'

const props = defineProps({
  store: { type: Object, required: true },
  mappingLinks: { type: Array, default: () => [] },
  configuration: Object,
  operations: Array,
  scenarios: Array,
  context: Function,
  presetContext: Function,
  presetNames: { type: Array, default: () => [] },
  activePresetNames: { type: Array, default: () => [] },
  execute: Function,
  authentication: Object,
  busy: Boolean,
  folder: Object,
})
const emit = defineEmits(['back', 'folder-settings', 'activate-preset'])
const store = props.store
const { draft, saved, dirty, error, notice, execution, pending, questions } = store
const nextRequest = ref(null)
const pickingStepId = ref(''),
  removedStep = ref(null)
const stepDialog = ref(null)
const stepEditorOpen = ref(false)
async function showStep() {
  await nextTick()
  if (selected.value && !stepDialog.value.open) {
    stepDialog.value.showModal()
    stepEditorOpen.value = true
  }
}
const selectedId = ref(''),
  tab = ref('configure'),
  search = ref(''),
  addDialog = ref(null),
  runDialog = ref(null),
  fileInput = ref(null)
const oneTimeValues = ref(new Map())
const runIssues = ref([])
const resumeDialog = ref(null)
const resumable = computed(() => !execution.stale && execution.status === 'incomplete'
  ? remainingSteps(execution.steps) : [])
const runConcurrency = ref(4)
const runIssue = ref(null)
const review = ref([]),
  allowHuman = ref(true),
  runProblem = ref(''),
  quick = ref('')
const edgeFromList = ref(false)
let openedEdgeSettings
const edgeDialog = ref(null),
  edgeEdit = ref(null),
  mappingEdit = ref(null),
  edgeProblem = ref(''),
  popupPosition = ref({})
const edgeTarget = computed(() => draft.value.steps.find((step) => step.id === edgeEdit.value?.to))
const edgeOperation = computed(() =>
  props.operations.find((operation) => operation.key === edgeTarget.value?.operationKey)
)
const inbound = computed(() =>
  selected.value ? allConnections(draft.value).filter((edge) => edge.to === selected.value.id) : []
)
const selected = computed(() => draft.value.steps.find((step) => step.id === selectedId.value))
const operation = computed(() =>
  props.operations.find((operation) => operation.key === selected.value?.operationKey)
)
const bodyEditor = ref(null)
const suggestionsOpen = ref(false)
const suggestionSummary = ref(null)
const suggestionProblem = ref('')
const appliedSuggestions = ref(new Map())
const appliedToSelected = computed(() => {
  const inputs = selected.value?.inputs ?? []
  return (appliedSuggestions.value.get(selectedId.value) ?? []).filter((item) =>
    inputs.some((input) =>
      ['source', 'location', 'name', 'pointer', 'stepId', 'responsePointer'].every(
        (key) => input[key] === item.input[key]
      )
    )
  )
})
watch(
  () => draft.value.id,
  () => appliedSuggestions.value.clear()
)
const suggestions = computed(() => suggestInputs(draft.value, selected.value, operation.value, props.mappingLinks))
const suggestionCount = computed(() => suggestions.value.reduce((count, group) => count + group.options.length, 0))
watch(selectedId, () => {
  suggestionsOpen.value = false
  suggestionProblem.value = ''
})
function useSuggestion(option) {
  if (pending.value) return
  suggestionProblem.value = ''
  try {
    const producer = option.stepId
      ? null
      : newStep(option.from, props.context().createSession(option.from))
    const input = { ...option.input, stepId: option.stepId ?? producer.id }
    const steps = draft.value.steps.map((step) =>
      step.id === selectedId.value ? { ...step, inputs: [...step.inputs, input] } : step
    )
    if (producer) {
      if (option.expectedStatus)
        producer.request.assertions.push({ kind: 'status', expected: option.expectedStatus })
      steps.push(producer)
    }
    validateBlueprint({ ...draft.value, steps })
    draft.value.steps = steps
    const applied = appliedSuggestions.value.get(selectedId.value) ?? []
    appliedSuggestions.value.set(selectedId.value, [...applied, { input, added: !!producer }])
    void nextTick(() => suggestionSummary.value?.focus())
  } catch (cause) {
    suggestionProblem.value = cause.message
  }
}
const runStep = computed(() => execution.steps.find((step) => step.id === selectedId.value))
const filtered = computed(() =>
  props.operations
    .filter((operation) =>
      `${operation.method} ${operation.path} ${operation.name} ${operation.apiName}`
        .toLowerCase()
        .includes(search.value.toLowerCase())
    )
    .slice(0, 100)
)
const validationIssue = computed(() => {
  try {
    validateBlueprint(draft.value)
    return null
  } catch (cause) {
    return cause
  }
})
const validation = computed(() => validationIssue.value?.message ?? '')
const validationKey = computed(() => JSON.stringify([
  draft.value.id, validation.value, validationIssue.value?.stepId, validationIssue.value?.target,
]))
const hideValidation = ref(false)
const hideRunError = ref(false)
watch(validationKey, () => { hideValidation.value = false }, { flush: 'sync' })
watch(() => execution.error, () => { hideRunError.value = false }, { flush: 'sync' })
const noticeKind = computed(() => {
  if (error.value) return 'action'
  if (validation.value && !hideValidation.value) return 'validation'
  if (execution.error && !hideRunError.value) return 'run'
  return ''
})
const errorMessage = computed(() => ({
  action: error.value, validation: validation.value, run: execution.error,
})[noticeKind.value])
function dismissError() {
  if (noticeKind.value === 'action') error.value = ''
  else if (noticeKind.value === 'validation') hideValidation.value = true
  else if (noticeKind.value === 'run') hideRunError.value = true
}

const failedStep = computed(() => execution.steps.find(step => step.status === 'failed'))
const requestParameters = computed(() => (operation.value?.parameters ?? []).filter(
  parameter => ['path', 'query', 'header'].includes(parameter.in)
))
const parameterNameConflict = ref('')
watch([selected, operation, pending], ([step, endpoint, running]) => {
  parameterNameConflict.value = ''
  if (!step || !endpoint || running) return
  const { fields, inputs, conflict } = normalizeParameterNames(endpoint, step.request.fields, step.inputs)
  parameterNameConflict.value = conflict ?? ''
  if (conflict) return
  const current = step.request.fields
  if (Object.keys(fields).length !== Object.keys(current).length ||
      Object.keys(fields).some(key => !Object.hasOwn(current, key))) step.request.fields = fields
  if (inputs.some((input, index) => input !== step.inputs[index])) step.inputs = inputs
}, { immediate: true })
const dynamicTargets = computed(
  () =>
    new Set(
      selected.value?.inputs
        .filter((input) => input.location !== 'body')
        .map((input) => input.location + ':' + input.name)
    )
)
const definitionChanged = () => {
  if (execution.status !== 'idle' && !pending.value) execution.stale = true
}
watch(
  () => [
    draft.value.name,
    draft.value.steps,
    draft.value.variables,
    draft.value.connections,
    draft.value.concurrency,
  ],
  definitionChanged,
  { deep: true }
)
watch(
  () => draft.value.id,
  () => {
    removedStep.value = null
    stepDialog.value?.close()
    edgeDialog.value?.close()
    edgeEdit.value = null
    selectedId.value = draft.value.steps[0]?.id ?? ''
    tab.value = 'configure'
  }
)
watch(pending, (value) => {
  if (value) removedStep.value = null
})
if (props.authentication)
  onScopeDispose(props.authentication.onChange((ids) => store.invalidate(ids)))
watch(
  () => props.operations.map((operation) => operation.key),
  (available) => {
    if (execution.steps.some((step) => !step.local && !available.includes(step.operation.key))) store.invalidate()
  }
)
function attempt(action) {
  error.value = ''
  notice.value = ''
  try {
    return action()
  } catch (cause) {
    error.value = cause.message
  }
}
const detailsDialog = ref(null)
const savedScenario = computed(() => saved.value.find(item => item.id === draft.value.id))
const canShare = computed(() => Boolean(savedScenario.value && !dirty.value && !pending.value &&
  !props.folder?.pending && !props.folder?.restoring))
const hasUnsavedDraft = computed(() =>
  dirty.value && (draft.value.steps.length > 0 || Boolean(draft.value.description) ||
    draft.value.name !== 'Untitled scenario' || saved.value.some((item) => item.id === draft.value.id))
)
function mayDiscard() {
  return !hasUnsavedDraft.value || window.confirm('Discard unsaved Scenario Builder changes?')
}
function newFromLibrary() {
  if (pending.value || !mayDiscard()) return false
  store.fresh()
  return true
}
function openFromLibrary(id) {
  const item = saved.value.find((scenario) => scenario.id === id)
  if (!item || pending.value || !mayDiscard()) return false
  store.open(item)
  return true
}

defineExpose({ openFromLibrary, newFromLibrary, reviewRun, runDirectly })

function save() {
  attempt(store.save)
}
function removeSaved() {
  if (window.confirm(`Delete “${draft.value.name}” from this browser?`)) attempt(store.remove)
}
async function openAdd(stepId = '', connection = null) {
  nextRequest.value = connection
  pickingStepId.value = typeof stepId === 'string' ? stepId : ''
  search.value = ''
  addDialog.value.showModal()
  await nextTick()
  addDialog.value.querySelector('input')?.focus()
}
function createNext({ from, position }) {
  if (pending.value || draft.value.steps.length >= 100) return
  if (from !== null && !draft.value.steps.some((step) => step.id === from)) return
  stepDialog.value?.close()
  void openAdd('', { from, position })
}
function changeLocalSource(step, source) {
  if (!source) return
  const producer = draft.value.connections.find(edge => edge.to === step.id)?.from
  step.inputs = [localStepInput(source, producer ?? '')]
}

function addLocal(source) {
  if (pending.value) return
  const connection = nextRequest.value
  const index = draft.value.steps.findIndex(step => step.id === pickingStepId.value)
  const placeholder = draft.value.steps[index]
  if (placeholder?.operationKey || (!placeholder && draft.value.steps.length >= 100)) return

  const producer = connection?.from ?? draft.value.connections.find(edge => edge.to === placeholder?.id)?.from
  const step = newStep(localOperation, {})
  step.label = source === 'random' ? 'Pick random' : 'Expression'
  step.inputs = [localStepInput(source, producer ?? '')]
  if (placeholder) {
    step.id = placeholder.id
    if (placeholder.position) step.position = placeholder.position
    draft.value.steps[index] = step
  } else {
    if (connection?.position) step.position = connection.position
    draft.value.steps.push(step)
    if (connection?.from) draft.value.connections.push({ from: connection.from, to: step.id })
  }
  selectedId.value = step.id
  tab.value = 'configure'
  addDialog.value.close()
  void showStep()
}

function add(operation) {
  if (pickingStepId.value) {
    const index = draft.value.steps.findIndex((step) => step.id === pickingStepId.value)
    if (index < 0) {
      addDialog.value.close()
      return
    }
    const old = draft.value.steps[index],
      previous = props.operations.find((item) => item.key === old.operationKey)
    if (
      old.operationKey &&
      !window.confirm(
        'Changing the endpoint resets this request’s inputs and body. Keep the connections and continue?'
      )
    )
      return
    draft.value.steps[index] = configureEndpoint(
      old,
      operation,
      props.context().createSession(operation),
      previous?.name
    )
    selectedId.value = old.id
    tab.value = 'configure'
    addDialog.value.close()
    void showStep()
    return
  }
  if (draft.value.steps.length >= 100) {
    error.value = 'A scenario supports at most 100 steps.'
    addDialog.value.close()
    return
  }
  const connection = nextRequest.value
  if (connection?.from && !draft.value.steps.some((step) => step.id === connection.from)) return
  const step = newStep(operation, props.context().createSession(operation))
  if (connection?.position) step.position = connection.position
  draft.value.steps.push(step)
  if (connection?.from) draft.value.connections.push({ from: connection.from, to: step.id })
  selectedId.value = step.id
  tab.value = 'configure'
  addDialog.value.close()
  void showStep()
}
function removeStep() {
  const id = selected.value.id
  const used = draft.value.variables.filter(
    (variable) => ['response', 'random'].includes(variable.source) && variable.stepId === id
  )
  if (used.length) {
    error.value =
      'Change or remove response variables first: ' +
      used.map((variable) => variable.name).join(', ')
    return
  }
  if (
    draft.value.steps.some((step) => dependencies(step, draft.value).includes(id)) &&
    !window.confirm('Remove this step and all connections that use its response?')
  )
    return
  const removed = removeStepDraft(draft.value, id)
  draft.value = removed.next
  removedStep.value = removed.snapshot
  selectedId.value = draft.value.steps[0]?.id ?? ''
  stepDialog.value.close()
}
function undoRemoveStep() {
  if (pending.value || !removedStep.value) return
  attempt(() => {
    const id = removedStep.value.step.id
    draft.value = restoreStepDraft(draft.value, removedStep.value)
    removedStep.value = null
    selectedId.value = id
    tab.value = 'configure'
    void showStep()
  })
}
function candidateConnection(edge, inputs) {
  const pair = connectionKey(edge.from, edge.to)
  return {
    ...draft.value,
    connections: [
      ...draft.value.connections.filter((item) => connectionKey(item.from, item.to) !== pair),
      { from: edge.from, to: edge.to, ...waitOptions(edge) },
    ],
    steps: draft.value.steps.map((step) =>
      step.id === edge.to
        ? {
            ...step,
            inputs: [
              ...step.inputs.filter(
                (input) => input.source !== 'response' || input.stepId !== edge.from
              ),
              ...inputs,
            ],
          }
        : step
    ),
  }
}
async function openConnection(edge, event) {
  edgeProblem.value = ''
  error.value = ''
  edgeEdit.value = { from: edge.from, to: edge.to, ...waitOptions(edge) }
  const target = draft.value.steps.find((step) => step.id === edge.to)
  if (!target) return
  const endpoint = edgeOperation.value
  const inputs = endpoint ? normalizeParameterNames(endpoint, target.request.fields, target.inputs).inputs : target.inputs
  mappingEdit.value = {
    id: target.id,
    inputs: JSON.parse(
      JSON.stringify(
        inputs.filter((input) => input.source === 'response' && input.stepId === edge.from)
      )
    ),
  }
  openedEdgeSettings = JSON.stringify([edgeEdit.value, mappingEdit.value.inputs])
  const opener = event?.currentTarget
  edgeFromList.value = Boolean(opener?.closest('.map-connections'))
  await nextTick()
  const element =
    opener ??
    [...document.querySelectorAll('[data-connection]')].find(
      (item) => item.dataset.connection === connectionKey(edge.from, edge.to)
    )
  const anchor = element?.getBoundingClientRect?.() ?? {
    left: innerWidth / 2,
    right: innerWidth / 2,
    top: innerHeight / 3,
  }
  const width = Math.min(420, innerWidth - 24)
  popupPosition.value = edgeFromList.value ? { inset: '0', margin: 'auto' } : {
    left:
      Math.max(
        12,
        Math.min(
          innerWidth - width - 12,
          anchor.right + width + 12 < innerWidth ? anchor.right + 10 : anchor.left - width - 10
        )
      ) + 'px',
    top:
      Math.max(12, Math.min(anchor.top - 30, innerHeight - Math.min(680, innerHeight - 24) - 12)) +
      'px',
  }
  await nextTick()
  edgeDialog.value.showModal()
}
function connect(edge) {
  if (pending.value) return
  attempt(() => {
    const existing = allConnections(draft.value).find(
      (item) => connectionKey(item.from, item.to) === connectionKey(edge.from, edge.to)
    )
    if (existing) {
      void openConnection(existing)
      return
    }
    const candidate = {
      ...draft.value,
      connections: [...draft.value.connections, { from: edge.from, to: edge.to }],
    }
    validateBlueprint(candidate)
    draft.value.connections = candidate.connections
    void openConnection(edge)
  })
}
async function editConnectionTarget(input) {
  const target = edgeTarget.value
  if (!target) return
  if (openedEdgeSettings !== JSON.stringify([edgeEdit.value, mappingEdit.value.inputs]) &&
      !window.confirm('Discard unapplied connection settings?')) return
  edgeDialog.value.close()
  selectedId.value = target.id
  tab.value = 'configure'
  await showStep()
  const key = input.location + ':' + input.name
  const row = [...stepDialog.value.querySelectorAll('[data-parameter]')]
    .find((element) => element.dataset.parameter === key)
  row?.querySelector('input, select, button')?.focus()
}

function saveConnection() {
  if (pending.value) return
  try {
    const candidate = candidateConnection(edgeEdit.value, mappingEdit.value.inputs)
    validateBlueprint(candidate)
    draft.value.connections = candidate.connections
    edgeTarget.value.inputs = candidate.steps.find((step) => step.id === edgeEdit.value.to).inputs
    edgeDialog.value.close()
  } catch (cause) {
    edgeProblem.value = cause.message
  }
}
function removeConnection() {
  if (pending.value) return
  const edge = edgeEdit.value
  const affected = edgeTarget.value.inputs.filter(input => inputProducers(input, draft.value).includes(edge.from))
  if (isLocalStep(edgeTarget.value) && affected.length) {
    edgeProblem.value = 'Change the source in the local step before removing this connection.'
    return
  }
  const fields = affected.map(input => {
    const field = input.location === 'body' ? input.pointer || '(whole body)' : input.name
    return `• ${edgeTarget.value.label} → ${input.location} ${field} · ${input.source}`
  })
  if (fields.length && !window.confirm(`Remove this connection and these input bindings?\n\n${fields.join('\n')}`)) return
  draft.value.connections = draft.value.connections.filter(
    (item) => connectionKey(item.from, item.to) !== connectionKey(edge.from, edge.to)
  )
  edgeTarget.value.inputs = edgeTarget.value.inputs.filter(
    (input) => !inputProducers(input, draft.value).includes(edge.from)
  )
  edgeDialog.value.close()
}
function runContext(names = props.activePresetNames) {
  const context = props.presetContext ? props.presetContext(names) : props.context()
  return { ...context, protectBodyExpressions: true, requestOverrides: oneTimeValues.value }
}
function refreshReview() {
  runProblem.value = ''
  runIssue.value = null
  runIssues.value = []
  try {
    review.value = prepareBlueprint({ ...draft.value, concurrency: runConcurrency.value }, runContext(), { collectIssues: true })
  } catch (cause) {
    review.value = cause.plan ?? []
    if (cause instanceof AggregateError) runIssues.value = cause.errors
    else {
      runProblem.value = cause.message
      runIssue.value = cause
    }
  }
}
const suggestedPresets = computed(() => {
  if (!props.presetContext) return []
  return suggestRunPresets(runIssues.value, props.activePresetNames, props.presetNames, names =>
    prepareBlueprint({ ...draft.value, concurrency: runConcurrency.value },
      runContext(names), { collectIssues: true }))
})
function useMissingValues(entries) {
  for (const { issue, value } of entries) {
    const { stepId, target } = issue
    const inputs = oneTimeValues.value.get(stepId) ?? []
    oneTimeValues.value.set(stepId, [...inputs.filter(input =>
      input.location !== target.location || input.name !== target.name),
      { ...target, ...(target.location === 'body' ? { pointer: target.name } : {}), value }])
  }
  refreshReview()
}
function prepareRun() {
  runConcurrency.value = draft.value.concurrency
  allowHuman.value = true
  oneTimeValues.value = new Map()
  refreshReview()
}
const runInputsOnly = ref(false)
function reviewRun() {
  runInputsOnly.value = false
  prepareRun()
  runDialog.value.showModal()
}
function runDirectly() {
  if (pending.value || props.busy || !draft.value.steps.length || validation.value) return
  prepareRun()
  if (runProblem.value || runIssues.value.length) {
    runInputsOnly.value = true
    runDialog.value.showModal()
    return
  }
  void startRun()
}
watch([allowHuman, runConcurrency, () => props.activePresetNames, () => props.presetNames], () => {
  if (runDialog.value?.isOpen()) refreshReview()
})
async function startRun() {
  runProblem.value = ''
  runIssue.value = null
  if (runIssues.value.length) return
  try {
    const promise = store.run(runContext(), props.execute, allowHuman.value, runConcurrency.value)
    // run() is async; initial errors are reported by awaiting below.
    if (pending.value) runDialog.value.close()
    await promise
    if (runDialog.value.isOpen()) runDialog.value.close()
  } catch (cause) {
    runProblem.value = cause.message
    runIssue.value = cause
    if (!runDialog.value.isOpen()) error.value = cause.message
  }
}
function chooseStepTab(value) {
  tab.value = value
}
function select(id, showResult = false) {
  selectedId.value = id
  tab.value = showResult ? 'response' : 'configure'
  return showStep()
}
async function goToIssue(issue, showResult = false) {
  if (!issue?.stepId || !draft.value.steps.some(step => step.id === issue.stepId)) return
  runDialog.value?.close()
  await select(issue.stepId, showResult)
  if (!issue.target) return
  const { location, name } = issue.target
  if (location === 'body' && await bodyEditor.value?.focusBinding(name)) return
  const attribute = location === 'body' ? 'data-body-path' : 'data-parameter'
  const key = location === 'body' ? name : location + ':' + name
  const row = [...stepDialog.value.querySelectorAll(`[${attribute}]`)].find(
    element => element.getAttribute(attribute) === key && element.getClientRects().length
  )
  const focus = row?.querySelector('.expression-editor textarea:not([disabled])') ??
    row?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ??
    stepDialog.value.querySelector('.request-input-heading > h4')
  focus?.scrollIntoView({ block: 'nearest' })
  focus?.focus({ preventScroll: true })
}
async function importDefinition(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !mayDiscard()) return
  try {
    const data = await parseBuilderImport(file)
    store.open(data)
    notice.value = 'Imported as a new draft. Review targets and inputs before running.'
  } catch (cause) {
    error.value = cause.message
  }
}
function importQuick() {
  const scenario = props.scenarios.find((item) => item.id === quick.value)
  quick.value = ''
  if (!scenario || !mayDiscard()) return
  attempt(() => {
    const data = { ...newBlueprint(), version: 2 }
    data.name = scenario.name + ' · Builder'
    const ids = scenario.steps.map(() => newId())
    const pointer = (path) =>
      path.length
        ? '/' +
          path.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')
        : ''
    data.steps = scenario.steps.map((step, index) => {
      if (step.bindings.some((binding) => binding.selector))
        throw new Error(
          'This chain uses a filtered array selector. Add its response JSON Pointer manually in a new builder scenario.'
        )
      const { operationKey, apiId, method, path, name, bindings, ...request } = step
      return {
        id: ids[index],
        label: name,
        operationKey,
        apiId,
        method,
        path,
        request,
        dependsOn: index ? [ids[index - 1]] : [],
        inputs: bindings.map((binding) => ({
          source: 'response',
          location: binding.location,
          name: binding.name ?? '',
          pointer: binding.name === null ? '' : pointer([binding.name]),
          stepId: ids[binding.sourceStep],
          responsePointer: pointer(binding.path),
        })),
      }
    })
    validateBlueprint(data)
    store.open(data)
    notice.value =
      'Copied the quick chain. Remove “Run after” connections to introduce parallel branches.'
  })
}
async function retryStep(id) {
  const step = execution.steps.find(item => item.id === id)
  if (!step || pending.value || props.busy || execution.stale) return
  if (!['GET', 'HEAD', 'OPTIONS'].includes(step.operation.method) &&
      !window.confirm(`Send ${step.operation.method} again for “${step.label}”? This can repeat changes on the server.`)) return
  try { await store.retry(id, props.execute) }
  catch (cause) { error.value = cause.message }
}
async function runRemaining() {
  if (!resumable.value.length || pending.value || props.busy) return
  resumeDialog.value.close()
  try { await store.continueRun(props.execute) }
  catch (cause) { error.value = cause.message }
}
function beforeUnload(event) {
  if (pending.value || hasUnsavedDraft.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onScopeDispose(() => window.removeEventListener('beforeunload', beforeUnload))
</script>
<template>
  <section class="builder" aria-labelledby="builder-title">
    <header class="builder-header">
      <button type="button" class="secondary" :disabled="pending" @click="emit('back')">
        ← Scenarios
      </button>
      <div class="builder-actions" role="group" aria-label="Current scenario actions">
        <button type="button" :class="dirty ? 'primary' : 'secondary'"
          :title="dirty ? 'Save latest changes' : 'All changes saved'"
          :disabled="pending || !!validation" @click="save">Save</button>
        <button v-if="folder?.connected" type="button" class="secondary icon-button"
          aria-label="Export to shared workspace folder"
          :title="canShare ? 'Export to shared workspace folder' : 'Save latest changes before exporting to the shared workspace folder'"
          :disabled="!canShare" @click="folder.save('builder', draft)">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13V3m-4 4 4-4 4 4M3 12v5h14v-5" />
          </svg>
        </button>
        <button type="button" class="primary"
          :disabled="pending || busy || !draft.steps.length || !!validation" @click="runDirectly">Run</button>
        <button type="button" class="secondary"
          :disabled="pending || busy || !draft.steps.length || !!validation" @click="reviewRun">Review &amp; run</button>
        <button v-if="pending" type="button" class="secondary" @click="store.stop">Stop run</button>
      </div>
      <div class="builder-identity">
        <h2 id="builder-title">Scenario Builder</h2>
        <span class="scenario-title">{{ draft.name }}</span>
        <button type="button" class="secondary icon-button" aria-label="Scenario details" title="Scenario details"
          aria-haspopup="dialog" @click="detailsDialog.showModal()">ⓘ</button>
        <details class="builder-more">
          <summary class="secondary icon-button" aria-label="More scenario actions" title="More scenario actions">⋯</summary>
          <div>
            <button v-if="folder" type="button" class="secondary" :disabled="pending || !!validation || folder.pending"
              @click="folder.download('builder', draft)">Export</button>
            <button type="button" class="secondary" :disabled="pending" @click="fileInput.click()">
              Import definition
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="application/json,.json"
              hidden
              @change="importDefinition"
            />
            <label v-if="scenarios?.length"
              >Copy quick scenario<select v-model="quick" :disabled="pending" @change="importQuick">
                <option value="">Choose saved chain</option>
                <option v-for="item in scenarios" :key="item.id" :value="item.id">
                  {{ item.name }}
                </option>
              </select></label
            >
            <button
              v-if="saved.some((item) => item.id === draft.id)"
              type="button"
              class="secondary error"
              :disabled="pending"
              @click="removeSaved"
            >
              Delete saved scenario
            </button>
            <p>
              Definitions include static inputs. Answers and results are kept only in the current run.
              Configure credentials with Authorize or presets.
            </p>
          </div>
        </details>
      </div>
    </header>
    <dialog ref="detailsDialog" class="builder-dialog scenario-details" aria-labelledby="scenario-details-title">
      <form method="dialog">
        <h3 id="scenario-details-title">Scenario details</h3>
        <label>Name<input v-model="draft.name" :disabled="pending" maxlength="200" aria-label="Scenario name"></label>
        <label>Description<textarea v-model="draft.description" :disabled="pending" maxlength="500" rows="3"
          aria-label="Scenario description" placeholder="What does this scenario do?" /></label>
        <label>Default parallel requests
          <input v-model.number="draft.concurrency" :disabled="pending" type="number" min="1" max="8" step="1">
        </label>
        <footer><button type="submit" class="primary">Done</button></footer>
      </form>
    </dialog>
    <FolderFeedback :folder="folder" floating />
    <BuilderErrorNotice v-if="errorMessage && !stepEditorOpen" :message="errorMessage"
      :can-locate="noticeKind === 'validation' && !!validationIssue?.stepId"
      @locate="goToIssue(validationIssue)" @dismiss="dismissError" />
    <p v-if="removedStep" class="builder-message muted" role="status">
      Step removed: {{ removedStep.step.label }}.
      <button type="button" class="secondary" :disabled="pending" @click="undoRemoveStep">
        Undo remove step</button
      ><button
        type="button"
        class="secondary"
        aria-label="Dismiss step undo"
        @click="removedStep = null"
      >
        ×
      </button>
    </p>
    <p v-if="notice" class="builder-message muted" role="status">{{ notice }}</p>
    <div v-if="execution.status !== 'idle'" class="builder-run-status" role="status">
      <strong>{{ execution.stale ? 'Previous run · ' : '' }}{{ execution.status }}</strong
      ><span v-if="execution.presetNames?.length"
        >Presets: {{ execution.presetNames.join(' → ') }}</span
      ><span
        >{{ execution.steps.filter((step) => step.status === 'completed').length }} /
        {{ execution.steps.length }} completed</span
      ><span v-if="questions.size">{{ questions.size }} awaiting your input</span
      >
      <span v-if="execution.stale">Retry and continuation are unavailable because the scenario changed.</span>
      <button v-if="resumable.length" type="button" class="secondary" :disabled="busy"
        @click="resumeDialog.showModal()">Run remaining steps</button>
      <button v-if="failedStep && draft.steps.some(step => step.id === failedStep.id)" type="button" class="secondary"
        @click="goToIssue({ stepId: failedStep.id, target: failedStep.problemTarget }, !failedStep.problemTarget)">
        Go to failed step
      </button>
    </div>
    <section v-if="questions.size" class="human-queue" aria-label="Human input required">
      <form
        v-for="[id, question] in questions"
        :key="id"
        class="human-card"
        @submit.prevent="question.submit()"
      >
        <header>
          <strong>{{ question.step.label }} · Your input is needed</strong
          ><button v-if="!question.step.sharedVariable" type="button" @click="select(id, true)">
            Show step</button
          ><span v-else>Shared across requests</span>
        </header>
        <label v-for="(input, index) in question.inputs" :key="index"
          >{{ input.prompt
          }}<small
            >{{ input.location }} ·
            {{ input.location === 'body' ? input.pointer || 'whole body' : input.name }} ·
            {{ input.valueType }}</small
          ><textarea
            :aria-label="input.prompt"
            v-if="input.valueType === 'json'"
            v-model="question.values[index]"
            rows="2"
            required
            autocomplete="off" /><input
            :aria-label="input.prompt"
            v-else
            v-model="question.values[index]"
            :type="input.valueType === 'number' ? 'number' : 'text'"
            step="any"
            required
            autocomplete="off"
            :placeholder="input.valueType === 'boolean' ? 'true or false' : ''"
        /></label>
        <p v-if="question.error" class="error" role="alert">{{ question.error }}</p>
        <div>
          <button type="submit" class="primary">Continue {{ question.step.label }}</button
          ><small>{{
            question.step.sharedVariable
              ? 'Requests using this variable are paused. Independent branches can continue.'
              : 'Only this step is paused. Independent branches can continue.'
          }}</small>
        </div>
      </form>
    </section>
    <div class="builder-layout">
      <ScenarioMap
        :blueprint="draft"
        :selected="selectedId"
        :active-connection="edgeEdit ? connectionKey(edgeEdit.from, edgeEdit.to) : undefined"
        :steps="execution.steps"
        :stale="execution.stale"
        :disabled="pending"
        @select="selectedId = $event"
        @edit="select"
        @inspect="id => select(id, true)"
        @add-first="openAdd"
        @connect="connect"
        @configure="openConnection"
        @create-next="createNext"
        @retry="retryStep"
      >
        <template #actions>
          <SharedVariables :key="draft.id" :blueprint="draft" :operations="operations"
            :results="execution.steps" :disabled="pending" @save="draft.variables = $event" />
        </template>
      </ScenarioMap>
    </div>
    <dialog
      ref="stepDialog"
      class="builder-inspector step-dialog"
      aria-labelledby="step-dialog-title"
      @close="stepEditorOpen = false"
      @click="(event) => event.target === stepDialog && stepDialog.close()"
    >
      <div class="step-dialog-shell">
        <header class="step-dialog-title">
          <h3 id="step-dialog-title">{{ tab === 'response' ? 'Step response' : 'Edit step' }}</h3>
          <button
            type="button"
            class="secondary"
            aria-label="Close step editor"
            @click="stepDialog.close()"
          >
            ×
          </button>
        </header>
        <template v-if="selected">
          <header v-if="tab === 'configure'" class="inspector-header">
            <label
              >Step name<input
                v-model="selected.label"
                :disabled="pending"
                maxlength="200"
                aria-label="Step name"
            /></label>
            <div class="request-endpoint-actions">
              <button
                type="button"
                class="secondary"
                :disabled="pending"
                v-if="!isLocalStep(selected)"
                @click="openAdd(selected.id)"
              >
                {{ selected.operationKey ? 'Change endpoint' : 'Choose endpoint…' }}</button
              ><button
                type="button"
                class="secondary"
                :disabled="pending || draft.steps.length >= 100"
                @click="createNext({ from: selected.id })"
              >
                + Next request
              </button>
            </div>
            <small v-if="operation?.deprecated" class="muted">Deprecated endpoint</small>
            <code
              ><span class="method" :data-method="selected.method">{{ selected.method }}</span>
              {{ selected.path }}</code
            >
          </header>
          <div v-else class="response-step-meta">
            <strong>{{ selected.label }}</strong
            ><code
              ><span class="method" :data-method="selected.method">{{ selected.method }}</span>
              {{ selected.path }}</code
            >
          </div>
          <div class="inspector-tabs" role="group" aria-label="Step view">
            <button
              type="button"
              :aria-pressed="tab === 'configure'"
              @click="chooseStepTab('configure')"
            >
              Configure</button
            ><button
              type="button"
              :aria-pressed="tab === 'response'"
              @click="chooseStepTab('response')"
            >
              {{ isLocalStep(selected) ? 'Result' : 'Response' }}<span v-if="runStep?.httpStatus"> · {{ runStep.httpStatus }}</span>
            </button>
          </div>
          <div v-if="tab === 'response'" class="inspector-content response-content">
            <p v-if="runStep?.status === 'delaying'" class="attempt-progress" role="status">
              Delaying until {{ new Date(runStep.nextAttemptAt).toLocaleTimeString() }}
            </p>
            <p v-if="runStep?.attempt" class="attempt-progress" role="status">
              Attempt {{ runStep.attempt }} / {{ runStep.maxAttempts }} · {{ runStep.status
              }}<span v-if="runStep.nextAttemptAt">
                · Next attempt at {{ new Date(runStep.nextAttemptAt).toLocaleTimeString() }}</span
              >
            </p>
            <details v-if="runStep?.attempts?.length > 1" class="attempt-history">
              <summary>Attempt history ({{ runStep.attempts.length }})</summary>
              <ol>
                <li v-for="attempt in runStep.attempts" :key="attempt.attempt">
                  {{ attempt.attempt }} · HTTP {{ attempt.status ?? '—' }} ·
                  {{ attempt.elapsed ?? '—' }} ms ·
                  {{ attempt.matched ? 'value matched' : 'not matched' }}
                </li>
              </ol>
            </details>
            <p v-if="execution.stale" class="muted">
              Result from the previous run. Run again to use the updated definition.
            </p>
            <p v-if="runStep?.error" class="error">{{ runStep.error }}</p>
            <SentRequest
              v-if="runStep?.request"
              :key="selectedId + ':request'"
              :request="runStep.request"
              :attempt="runStep.attempt"
            /><ExpandedResponse
              v-if="runStep?.response"
              :key="selectedId"
              :result="runStep.response"
              :operation="runStep.operation"
              :pending="pending"
              :stale="execution.stale"
            />
            <p v-else class="muted">
              {{ runStep ? runStep.status : 'Run the scenario to see this response.' }}
            </p>
          </div>
          <div v-else class="inspector-content">
            <section v-if="isLocalStep(selected)" class="request-inputs" aria-label="Local step result">
              <label>Computation
                <select :value="selected.inputs[0]?.source ?? ''" :disabled="pending"
                  @change="changeLocalSource(selected, $event.target.value)">
                  <option value="" disabled>Choose a computation</option>
                  <option value="random">Pick random</option>
                  <option value="expression">Expression</option>
                </select>
              </label>
              <p class="muted">Runs once per scenario. Later steps can use this result as a response source.</p>
              <RandomSourceEditor v-if="selected.inputs[0]?.source === 'random'" :source="selected.inputs[0]"
                :steps="draft.steps" :step="selected" :operations="operations" :results="execution.steps" shared :disabled="pending" />
              <ExpressionEditor v-else-if="selected.inputs[0]" :input="selected.inputs[0]" :step="selected"
                :steps="draft.steps" :variables="draft.variables" :results="execution.steps" :operations="operations"
                :disabled="pending" />
            </section>
            <p v-else-if="!selected.operationKey" class="empty-request-note">
              Choose an endpoint for this request. Its connection is already in place.
            </p>
            <p v-else-if="!operation" class="error">
              Endpoint unavailable. Enable its API connection before running.
            </p>
            <section v-if="requestParameters.length || operation?.requestBody" class="request-inputs" aria-label="Request inputs">
              <div class="request-input-heading">
                <h4 tabindex="-1">Request inputs</h4>
                <button v-if="operation && (suggestionCount || suggestionsOpen)" type="button" class="secondary"
                  :aria-expanded="suggestionsOpen" @click="suggestionsOpen = !suggestionsOpen">
                  Suggested inputs ({{ suggestionCount }})
                </button>
              </div>
              <section v-if="suggestionsOpen" class="input-suggestions" aria-label="Suggested inputs">
                <div class="suggestion-content">
                  <p class="suggestion-hint">Choose a suggestion to add a response binding to this request.</p>
                  <div
                    v-if="appliedToSelected.length"
                    ref="suggestionSummary"
                    tabindex="-1"
                    role="status"
                    class="applied-suggestions"
                  >
                    <strong>Applied suggestions</strong>
                    <ul>
                      <li
                        v-for="{ input, added } in appliedToSelected"
                        :key="input.pointer ?? input.location + ':' + input.name"
                      >
                        {{ input.pointer || input.name || 'Whole body' }} ←
                        {{ draft.steps.find((step) => step.id === input.stepId)?.label }} ·
                        {{ input.responsePointer || 'whole response' }} ·
                        {{ added ? 'Step added' : 'Existing step' }}
                      </li>
                    </ul>
                  </div>
                  <p v-if="!suggestions.length && appliedToSelected.length" class="muted">
                    No further suggestions for unbound fields.
                  </p>
                  <p v-else-if="!suggestions.length" class="muted">
                    No available scalar or whole-value mappings for unbound inputs. Set array selection in Request inputs.
                  </p>
                  <div v-for="group in suggestions" :key="group.field">
                    <strong>{{ group.field }}</strong>
                    <ul>
                      <li v-for="(option, index) in group.options" :key="index">
                        <button
                          type="button"
                          class="secondary"
                          :disabled="pending"
                          @click="useSuggestion(option)"
                        >
                          {{
                            option.stepId
                              ? draft.steps.find((step) => step.id === option.stepId)?.label
                              : 'Add ' + option.from.name
                          }}
                          · {{ option.input.responsePointer || 'whole response' }}
                        </button>
                        <small
                          >{{ option.evidence
                          }}<template v-if="option.expectedStatus">
                            · HTTP {{ option.expectedStatus }}</template
                          ></small
                        >
                      </li>
                    </ul>
                  </div>
                  <p v-if="suggestionProblem" class="error" role="alert">{{ suggestionProblem }}</p>
                </div>
              </section>
              <p v-if="parameterNameConflict" class="error" role="alert">{{ parameterNameConflict }}</p>
              <div v-if="requestParameters.length" class="request-parameters">
                <div v-for="parameter in requestParameters"
                  :key="parameter.in + ':' + parameter.name" class="request-parameter" :data-parameter="parameter.in + ':' + parameter.name">
                  <label class="parameter-label">
                    <span><small>{{ parameter.in }}</small> <strong>{{ parameter.name }}</strong></span>
                    <input v-if="!dynamicTargets.has(parameter.in + ':' + parameter.name)"
                      v-model="selected.request.fields[parameter.in + ':' + parameter.name]"
                      :disabled="pending"
                      :placeholder="parameter.required || parameter.in === 'path' ? 'Required' : 'Optional'">
                  </label>
                  <StepInputs :parameter="parameter" :parameters-only="true" :step="selected"
                    :operation="operation" :steps="draft.steps" :variables="draft.variables"
                    :operations="operations" :results="execution.steps" :disabled="pending" />
                </div>
              </div>
              <ScenarioBodyEditor
                ref="bodyEditor"
                v-if="operation?.requestBody"
                :key="selected.id"
                :step="selected"
                :operation="operation"
                :steps="draft.steps"
                :operations="operations"
                :variables="draft.variables"
                :results="execution.steps"
                :disabled="pending"
              />
            </section>
            <button v-if="inbound.length === 1" type="button" class="secondary incoming-link"
              @click="openConnection(inbound[0], $event)">
              Edit connection · {{ connectionSummary(inbound[0], draft.steps) }}
            </button>
            <details v-else-if="inbound.length" class="incoming-links" aria-label="Incoming connections">
              <summary>Incoming connections ({{ inbound.length }})</summary>
              <button
                v-for="edge in inbound"
                :key="connectionKey(edge.from, edge.to)"
                type="button"
                class="secondary"
                @click="openConnection(edge, $event)"
              >
                {{ connectionSummary(edge, draft.steps)
                }}<small v-if="edge.delayMs !== undefined || edge.waitFor">
                  · Delay / Wait for</small
                >
              </button>
            </details>
            <details class="step-checks">
              <summary>Response checks ({{ selected.request.assertions?.length ?? 0 }})</summary>
              <ResponseChecksEditor :session="selected.request" :disabled="pending" />
            </details>
            <details class="request-limits">
              <summary>Request settings</summary>
              <label><input v-model="selected.ignorePresets" type="checkbox" :disabled="pending">
                Do not apply presets to this step
              </label>
              <fieldset :disabled="pending">
                <label
                  >Timeout (ms)<input
                    v-model.number="selected.request.timeout"
                    type="number"
                    min="1"
                    max="600000" /></label
                ><label
                  >Response budget (MiB)<input
                    v-model.number="selected.request.responseLimitMiB"
                    type="number"
                    min="1"
                    max="512"
                /></label>
              </fieldset>
            </details>
            <button
              type="button"
              class="secondary error remove-step"
              :disabled="pending"
              @click="removeStep"
            >
              Remove step
            </button>
          </div>
        </template>
        <div v-else class="inspector-empty">
          <strong>Build your API workflow</strong>
          <p>Add any endpoint, name its step and choose where its inputs come from.</p>
          <p>
            A → B + C → D: connect B and C to A, then D to both. Parallel branches are shown side by
            side.
          </p>
          <button type="button" class="primary" :disabled="pending" @click="openAdd">
            Add first request
          </button>
        </div>
        <BuilderErrorNotice v-if="stepEditorOpen && errorMessage && noticeKind !== 'run'"
          :message="errorMessage" in-dialog
          :can-locate="noticeKind === 'validation' && !!validationIssue?.stepId"
          @locate="goToIssue(validationIssue)" @dismiss="dismissError" />
        <footer class="step-dialog-footer" :class="{ 'response-footer': tab === 'response' }">
          <small v-if="tab === 'configure'"
            >Edits update the current draft. Save the scenario to keep them in this browser.</small
          ><button
            v-if="tab === 'configure'"
            type="button"
            class="secondary"
            :disabled="pending || !!validation"
            @click="save"
          >
            Save scenario</button
          ><button type="button" class="primary" @click="stepDialog.close()">Done</button>
        </footer>
      </div>
    </dialog>
    <dialog
      ref="edgeDialog"
      @close="() => {
        edgeEdit = null
        mappingEdit = null
      }"
      class="connection-popover"
      :style="popupPosition"
      aria-labelledby="connection-title"
      @click="(event) => event.target === edgeDialog && edgeDialog.close()"
    >
      <form v-if="edgeEdit && edgeTarget" @submit.prevent="saveConnection">
        <header>
          <div>
            <h3 id="connection-title">{{ connectionSummary(edgeEdit, draft.steps) }}</h3>
            <p>Connection settings · target request</p>
          </div>
          <button
            type="button"
            class="secondary"
            aria-label="Close connection settings"
            @click="edgeDialog.close()"
          >
            ×
          </button>
        </header>
        <div class="connection-content">
          <p v-if="isLocalStep(edgeTarget)" class="connection-explanation">Delay happens before this local step evaluates its result.</p>
          <p v-else class="connection-explanation">
            Delay happens before {{ edgeTarget.label }}. Wait for checks and repeats
            <strong>{{ edgeTarget.method }} {{ edgeTarget.path }}</strong
            >, keeping the source response unchanged.
          </p>
          <p
            v-if="allConnections(draft).filter((item) => item.to === edgeTarget.id).length > 1"
            class="muted"
          >
            At a join, all incoming connections must be ready. Delays overlap after dependencies
            complete; all response conditions must match the same target response.
          </p>
          <StepWaiting :step="edgeEdit" :operation="edgeOperation" :disabled="pending" :local="isLocalStep(edgeTarget)" />
          <div v-if="edgeEdit.from !== null" class="connection-target-actions">
            <button v-for="input in edgeTarget.inputs.filter(input => input.location !== 'body' && inputProducers(input, draft).includes(edgeEdit.from))"
              :key="input.location + ':' + input.name" type="button" class="secondary"
              @click="editConnectionTarget(input)">Edit {{ input.name }} in target request</button>
          </div>
          <StepInputs
            v-if="edgeEdit.from !== null && !isLocalStep(edgeTarget)"
            :step="mappingEdit"
            :operation="edgeOperation"
            :steps="draft.steps"
            :variables="draft.variables"
            :operations="operations"
            :results="execution.steps"
            :fixed-source="edgeEdit.from"
            :disabled="pending"
          />
          <p v-else-if="edgeEdit.from === null" class="muted">
            Start has no response to bind. Use this connection to configure an independent request.
          </p>
          <p
            v-if="
              edgeTarget.inputs.some(
                (input) =>
                  ['expression', 'random'].includes(input.source) &&
                  inputProducers(input, draft).includes(edgeEdit.from)
              )
            "
            class="muted"
          >
            This connection supplies dynamic inputs. Edit their configuration in the target request.
          </p>
          <p
            v-if="
              edgeTarget.inputs.some(
                (input) =>
                  input.source === 'variable' && variableProducer(input, draft) === edgeEdit.from
              )
            "
            class="muted"
          >
            This connection also carries shared response variables. Edit those bindings in the
            target request’s parameter or body editor.
          </p>
          <p v-if="edgeProblem" class="error" role="alert">{{ edgeProblem }}</p>
          <p v-if="pending" class="muted">Run in progress. Connection settings are read only.</p>
        </div>
        <footer>
          <button
            type="button"
            class="secondary error"
            :disabled="pending"
            @click="removeConnection"
          >
            {{ edgeEdit.from === null ? 'Reset start connection' : 'Remove connection' }}</button
          ><button type="button" class="secondary" @click="edgeDialog.close()">{{ edgeFromList ? 'Back to connections' : 'Cancel' }}</button
          ><button type="submit" class="primary" :disabled="pending">Apply connection</button>
        </footer>
      </form>
    </dialog>
    <dialog
      ref="addDialog"
      class="builder-dialog"
      aria-labelledby="add-request-title"
      @click="(event) => event.target === addDialog && addDialog.close()"
      @close="nextRequest = null"
    >
      <header>
        <h3 id="add-request-title">
          {{ pickingStepId ? 'Choose endpoint for this request' : nextRequest ? 'Add connected request' : 'Add any endpoint' }}
        </h3>
        <button
          type="button"
          class="secondary"
          aria-label="Close endpoint picker"
          @click="addDialog.close()"
        >
          ×
        </button>
      </header>
      <input
        v-model="search"
        type="search"
        aria-label="Find endpoint"
        @keydown.enter.prevent="filtered.length === 1 && add(filtered[0])"
        placeholder="Search name, route or API"
      />
      <p v-if="nextRequest" class="muted">Add after: {{ draft.steps.find((step) => step.id === nextRequest.from)?.label ?? 'Start' }}</p>
      <p v-else class="muted">
        {{
          pickingStepId
            ? 'The connection is already in place. Choose an endpoint, or close and finish this request later.'
            : 'No detected relationship required. You can use the same endpoint more than once.'
        }}
      </p>
      <ul class="endpoint-options">
        <li v-if="!search.trim() && !draft.steps.find(step => step.id === pickingStepId)?.operationKey">
          <button type="button" @click="addLocal('random')"><span class="method">LOCAL</span><strong>Pick random</strong><small>Choose one item for later steps</small></button>
          <button type="button" @click="addLocal('expression')"><span class="method">LOCAL</span><strong>Expression</strong><small>Calculate a value for later steps</small></button>
        </li>
        <li v-for="item in filtered" :key="item.key">
          <button type="button" @click="add(item)">
            <span class="method" :data-method="item.method">{{ item.method }}</span
            ><strong>{{ item.name }}</strong
            ><code>{{ item.path }}</code
            ><small>{{ item.apiName }}</small>
          </button>
        </li>
      </ul>
      <p v-if="!filtered.length">No matching endpoints.</p>
      <small v-if="filtered.length === 100">First 100 matches. Narrow the search for more.</small>
    </dialog>
    <dialog ref="resumeDialog" class="builder-dialog" aria-labelledby="resume-title">
      <form @submit.prevent="runRemaining">
        <header><h3 id="resume-title">Run remaining steps</h3></header>
        <p>These steps have not run yet or were cancelled before sending a request. They use the original run settings and available results.</p>
        <ol>
          <li v-for="step in resumable" :key="step.id">
            {{ step.label }} · <code>{{ step.local ? 'Local computation' : step.operation.method + ' ' + step.operation.path }}</code>
            <span v-if="step.entryPolicies.some(policy => policy.waitFor?.retryCount > 0)"> · May repeat while waiting</span>
          </li>
        </ol>
        <footer>
          <button type="button" class="secondary" @click="resumeDialog.close()">Cancel</button>
          <button type="submit" class="primary" :disabled="pending || busy || !resumable.length">Send remaining requests</button>
        </footer>
      </form>
    </dialog>
    <ScenarioRunReview
      ref="runDialog"
      :active-presets="activePresetNames"
      :suggested-presets="suggestedPresets"
      :inputs-only="runInputsOnly"
      :issues="runIssues"
      :steps="draft.steps"
      @activate-preset="emit('activate-preset', $event)"
      @use-missing-values="useMissingValues"
      v-model:concurrency.number="runConcurrency"
      v-model:allow-human="allowHuman"
      :name="draft.name"
      :step-count="draft.steps.length"
      :variables="draft.variables"
      :pending="pending"
      :validation="validation"
      :run-problem="runProblem"
      :problem-step="runIssue?.stepId"
      @go-to-step="goToIssue($event ?? runIssue)"
      :review="review"
      @start="startRun"
    />
  </section>
</template>
<style scoped>
.request-inputs { padding-block-start: .15rem; }
.request-input-heading { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; justify-content: space-between; margin-bottom: .55rem; }
.request-input-heading h4 { margin: 0; font-size: .9rem; }
.request-input-heading button { font-size: .75rem; }
.request-parameters { display: grid; gap: .45rem; }
.request-parameter { padding: .55rem; border: 1px solid var(--line); border-radius: .45rem; }
.parameter-label { display: grid; gap: .25rem; font-size: .8rem; margin-bottom: .25rem; }
.parameter-label small { color: var(--muted); }


.response-step-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  padding: 0.4rem 0.8rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.76rem;
  overflow-wrap: anywhere;
}
.response-footer {
  justify-content: flex-end;
}
.applied-suggestions {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  padding: 0.45rem 0.65rem;
  margin: 0.5rem 0;
  overflow-wrap: anywhere;
}
.input-suggestions {
  font-size: 0.78rem;
  margin-block: 0.35rem .55rem;
  border: 1px solid var(--line);
  border-inline-start: 3px solid var(--accent);
  border-radius: 0.45rem;
  background: var(--accent-soft);
}
.suggestion-content { padding: .5rem .65rem; overflow-wrap: anywhere; }
.suggestion-hint { margin: 0 0 .5rem; color: var(--muted); }
.input-suggestions ul {
  margin: 0.35rem 0 0.65rem;
  padding-left: 1rem;
}
.input-suggestions li {
  margin-bottom: 0.25rem;
}
.input-suggestions small {
  margin-inline: 0.4rem;
  color: var(--muted);
}
.step-dialog {
  width: min(76rem, calc(100vw - 2rem));
  height: min(90dvh, 60rem);
  max-height: calc(100dvh - 2rem);
  padding: 0;
  color: inherit;
  box-shadow: 0 16px 65px #17342650;
}
.step-dialog::backdrop {
  background: #17342666;
}
.step-dialog-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.step-dialog-title,
.step-dialog-footer {
  flex: none;
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.65rem 1rem;
}
.step-dialog-title {
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
}
.step-dialog-title h3 {
  margin: 0;
  font-size: 1rem;
}
.step-dialog-footer {
  border-top: 1px solid var(--line);
}
.step-dialog-footer small {
  flex: 1;
  color: var(--muted);
  font-size: 0.72rem;
}
@media (max-width: 760px) {
  .step-dialog {
    width: calc(100vw - 1rem);
    height: calc(100dvh - 1rem);
    max-height: calc(100dvh - 1rem);
  }
  .step-dialog-footer {
    flex-wrap: wrap;
  }
  .step-dialog-footer small {
    flex-basis: 100%;
  }
}

.connection-popover {
  position: fixed;
  margin: 0;
  width: min(420px, calc(100vw - 24px));
  max-height: min(680px, calc(100dvh - 24px));
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: var(--surface);
  color: inherit;
  box-shadow: 0 12px 45px #163c293d;
  font-size: 0.78rem;
}
.connection-popover::backdrop {
  background: #17342618;
}
.connection-popover form {
  display: flex;
  flex-direction: column;
  max-height: min(680px, calc(100dvh - 26px));
}
.connection-content {
  overflow: auto;
  min-height: 0;
  padding: 0.1rem 0.9rem;
}
.connection-popover header {
  flex: none;
  padding: 0.85rem 0.9rem;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0;
}
.connection-popover h3 {
  margin: 0;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}
.connection-popover p {
  line-height: 1.5;
}
.connection-popover header p {
  color: var(--muted);
  margin: 0.25rem 0 0;
  font-size: 0.7rem;
}
.connection-popover footer {
  flex: none;
  padding: 0.65rem 0.9rem;
  background: var(--surface);
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-top: 0;
  border-top: 1px solid var(--line);
}
.connection-popover footer button {
  font-size: 0.72rem;
}
.connection-popover footer .error {
  margin-right: auto;
}
.incoming-link { margin-bottom: .55rem; font-size: .75rem; }
.incoming-links {
  margin-bottom: 1rem;
  display: grid;
  gap: 0.4rem;
}
.incoming-links summary {
  margin: 0;
  font-size: 0.8rem;
}
.incoming-links button {
  text-align: left;
  font-size: 0.75rem;
}
.incoming-links p {
  font-size: 0.7rem;
  margin: 0.2rem 0;
}
.request-endpoint-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  font-size: 0.72rem;
}
.empty-request-note {
  padding: 0.7rem;
  background: var(--accent-soft);
  font-size: 0.8rem;
  line-height: 1.5;
}
.builder {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--canvas);
  padding: 0.8rem;
  gap: 0.65rem;
}
.builder-header, .builder-actions, .builder-identity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .4rem;
  font-size: .78rem;
}
.builder-header h2 { font-size: 1rem; margin: 0; }
.scenario-title { color: var(--muted); font-weight: 400; overflow-wrap: anywhere; }
.builder-identity { margin-inline-start: auto; min-width: 0; }
.icon-button { display: inline-grid; place-items: center; min-width: 1.8rem; min-height: 1.8rem; }
.scenario-details form, .scenario-details label { display: grid; gap: .45rem; }
.scenario-details footer { display: flex; justify-content: flex-end; }
.builder-more {
  position: relative;
}
.builder-more summary {
  cursor: pointer;
  list-style: none;
  padding: .2rem .45rem;
}
.builder-more > div {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 2;
  display: grid;
  gap: 0.5rem;
  width: 18rem;
  padding: 0.8rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  box-shadow: 0 5px 18px #203b2820;
}
.builder-more p {
  font-size: 0.7rem;
  line-height: 1.5;
  margin: 0;
}
.builder-more label {
  display: grid;
}
.builder-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.7rem;
  flex: 1;
  min-height: 0;
}
.builder-inspector {
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 0.65rem;
  background: var(--surface);
  overflow: hidden;
}
.inspector-header {
  padding: 0.75rem;
  display: grid;
  gap: 0.5rem;
  border-bottom: 1px solid var(--line);
}
.inspector-header label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--muted);
}
.inspector-header input {
  width: 100%;
  min-width: 0;
  font-weight: 650;
  color: var(--accent);
}
.inspector-header code {
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
.inspector-tabs {
  display: flex;
  border-bottom: 1px solid var(--line);
  font-size: 0.78rem;
}
.inspector-tabs button {
  flex: 1;
  padding: 0.6rem;
  border-radius: 0;
}
.inspector-tabs [aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 650;
}
.inspector-content {
  overflow: auto;
  padding: 0.75rem;
  min-height: 0;
  flex: 1;
}
.inspector-empty {
  padding: 1.2rem;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.6;
}
.dependencies {
  margin: 0 0 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  padding: 0.55rem;
  max-height: 12rem;
  overflow: auto;
}
.dependencies legend {
  font-size: 0.78rem;
  font-weight: 600;
}
.dependencies label {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
  font-size: 0.75rem;
  padding: 0.15rem;
}
.dependencies p {
  font-size: 0.7rem;
  margin: 0.4rem 0 0;
}
.dependencies small {
  color: var(--muted);
  font-size: 0.65rem;
}
.request-limits {
  font-size: 0.78rem;
  margin-top: 0.8rem;
  border-top: 1px solid var(--line);
  padding-top: 0.7rem;
}
summary {
  cursor: pointer;
}
.request-limits fieldset {
  padding: 0;
  border: 0;
  min-width: 0;
  display: grid;
  gap: 0.6rem;
  margin: 0.7rem 0;
}
.request-limits label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.75rem;
}
.input-tag {
  font-size: 0.65rem;
  color: var(--accent);
}
.remove-step {
  margin-top: 0.8rem;
  font-size: 0.75rem;
}
.response-content {
  font-size: 0.78rem;
}
.attempt-progress {
  padding: 0.5rem;
  background: var(--accent-soft);
  border-radius: 0.35rem;
  font-size: 0.75rem;
}
.attempt-history {
  margin: 0.5rem 0;
  font-size: 0.72rem;
}
.response-content :deep(.json-preview) {
  min-height: 15rem;
}
.builder-message {
  margin: 0;
  font-size: 0.78rem;
}
.builder-run-status {
  display: flex;
  gap: 0.5rem 1rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
  padding: 0.5rem 0.7rem;
  background: var(--accent-soft);
  border-radius: 0.4rem;
}
.human-queue {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  max-height: 38vh;
  overflow: auto;
}
.human-card {
  flex: 1 1 22rem;
  padding: 0.75rem;
  border: 1px solid #cdad63;
  border-radius: 0.6rem;
  background: #fff8e6;
  display: grid;
  gap: 0.6rem;
}
.human-card header {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.human-card label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.78rem;
}
.human-card small {
  color: var(--muted);
  font-size: 0.68rem;
}
.human-card > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.human-card p {
  margin: 0;
  font-size: 0.78rem;
}
.builder-dialog {
  width: min(42rem, calc(100% - 2rem));
  max-height: 85dvh;
  overflow: auto;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  background: var(--surface);
  color: inherit;
}
.builder-dialog::backdrop {
  background: #172b2466;
}
.builder-dialog header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.7rem;
}
.builder-dialog h3 {
  font-size: 1rem;
  margin: 0;
}
.builder-dialog p {
  font-size: 0.8rem;
  line-height: 1.5;
}
.builder-dialog > input {
  width: 100%;
}
.endpoint-options {
  padding: 0;
  list-style: none;
  max-height: 50vh;
  overflow: auto;
}
.endpoint-options button {
  width: 100%;
  padding: 0.6rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 0.6rem;
  align-items: start;
}
.endpoint-options strong {
  font-size: 0.82rem;
}
.endpoint-options code,
.endpoint-options small {
  grid-column: 2;
  color: var(--muted);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
@media (max-width: 760px) {
  .builder {
    overflow: visible;
    padding: 0.65rem;
  }
  .builder-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .inspector-content {
    max-height: none;
  }
  .builder-identity { margin-inline-start: 0; }
  .human-queue {
    max-height: none;
  }
  .builder-more > div {
    position: fixed;
    inset-inline: 1rem;
    top: auto;
    width: auto;
  }
  .builder-dialog button {
    min-height: 40px;
  }
}
</style>
