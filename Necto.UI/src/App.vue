<script setup>
import { useScenarioFolder } from './features/scenario-folder/useScenarioFolder.js'
import OperationTasks from './features/api-catalog/OperationTasks.vue'
import DescriptionHelp from './features/workbench/DescriptionHelp.vue'
import { scenarioTargets } from './features/workbench/scenarioTargets.js'
import { workspaceIdentity } from './features/workbench/workspaceIdentity.js'
import { onWorkspaceImport } from './features/workbench/workspaceUpdates.js'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import WorkspaceSettings from './features/workbench/WorkspaceSettings.vue'
import CurlImport from './features/workbench/CurlImport.vue'
import AgentPanel from './features/agents/AgentPanel.vue'
import AuthorizationDialog from './features/authentication/AuthorizationDialog.vue'
import { useAuthentication } from './features/authentication/useAuthentication.js'
import NectoSkeleton from './NectoSkeleton.vue'
import { useCatalog } from './features/api-catalog/catalog.js'
import EndpointCatalog from './features/api-catalog/EndpointCatalog.vue'
import OperationRunner from './features/request-runner/OperationRunner.vue'
import { useRequestRunner } from './features/request-runner/useRequestRunner.js'
import RequestSamples from './features/request-runner/RequestSamples.vue'
import { applySample, readSamples } from './features/request-runner/samples.js'
import { applyChoice, useRelatedEndpoints } from './features/related-endpoints/mappings.js'
import ValueInput from './features/related-endpoints/ValueInput.vue'
import RelatedChoices from './features/related-endpoints/RelatedChoices.vue'
import RelatedTargets from './features/related-endpoints/RelatedTargets.vue'
import ExternalApiSettings from './features/external-apis/ExternalApiSettings.vue'
import EndpointGraph from './features/endpoint-graph/EndpointGraph.vue'
import EntityGraph from './features/entity-graph/EntityGraph.vue'
import ScenarioPanel from './features/scenarios/ScenarioPanel.vue'
import ScenarioBuilder from './features/scenario-builder/ScenarioBuilder.vue'
import { useScenarios } from './features/scenarios/useScenarios.js'
import { rememberBinding, snapshotScenario } from './features/scenarios/scenario.js'
import { readRoute, routePath } from './features/routing/routes.js'
import ValuesEditor from './features/environments/ValuesEditor.vue'
import { buildRequest, fieldKey, contextKey, hasPresetFor, migratePreset, presetInputs, resolveNamedRequestValues } from './features/request-runner/request.js'

const authentication = useAuthentication()
const authorizationOpen = ref(false)
const authorizationApiId = ref('local')
const authorizationButton = ref(null)
authentication.register({ id: 'local', name: 'Local API', bootstrap: true, schemes: {}, configuration: {
  openApiUrl: new URL('/openapi/v1.json', document.baseURI).href, apiBaseUrl: new URL('/', document.baseURI).href,
  configurationUrl: new URL('./configuration', document.baseURI).href,
}, origins: [location.origin] })
const { spec, configuration, error, operations, groups, externalApis, reload: reloadCatalog, importDocument, documentSource, restoreServerDocument } = useCatalog(authentication)
const { sessions, sessionFor, createSession, run, prepare: prepareRequest, cancel: cancelRequest, history: requestHistory } = useRequestRunner(configuration, authentication)
const { error: mappingError, targetsFor, choicesFor, selectablePaths, mappings: endpointMappings, links: mappingLinks, pending: mappingPending } = useRelatedEndpoints(configuration, operations, externalApis.contexts, authentication)

const { connections, show: showExternalApis, statuses: externalStatuses, storageError: externalStorageError } = externalApis
const externalPending = computed(() => showExternalApis.value && [...externalStatuses.values()].some(status => status.pending))
const selectedChain = ref([])
const inspectedScenarioStep = ref(null)
const scenarioPanel = ref(null)
const builderPending = ref(false)
const builderVisited = ref(false)
const scenarioStore = useScenarios(configuration)
const { scenarios, state: scenarioState, runs: scenarioRuns, pending: scenarioPending, error: scenarioError } = scenarioStore
const scenarioName = ref('')
const scenarioDialog = ref(null)
const requestSamples = ref(null)
const editingScenarioId = ref(''), editingFolderSource = shallowRef(null)
watch(editingScenarioId,()=>{editingFolderSource.value=null},{flush:'sync'})
const editingScenario = computed(() => scenarios.value.find(scenario => scenario.id === editingScenarioId.value))
const scenarioDirty = computed(() => {
  const saved = editingScenario.value
  if (!saved) return false
  try { return JSON.stringify(snapshotScenario(chain.value, saved.name, saved.id, valuesFor).steps) !== JSON.stringify(saved.steps) }
  catch { return true }
})
const overwriteScenario = computed(() => scenarios.value.find(scenario =>
  scenario.id === editingScenarioId.value && scenario.name === scenarioName.value.trim()))
const scenarioFolder = useScenarioFolder(configuration,operations,computed(()=>scenarioPending.value||builderPending.value))
const workspaceLocked = computed(() => scenarioPending.value || builderPending.value || scenarioFolder.pending)
const scenarioBusy = computed(() => workspaceLocked.value || mappingPending.value || externalPending.value || [...sessions.values(), ...chain.value.map(step => step.session)].some(session => session.pending))
const presets = ref(new Map())
const presetColors = ref(new Map())
const catalogMedia = matchMedia('(max-width: 760px)')
const catalogOpen = ref(!catalogMedia.matches)
const catalogWidth = ref(240)
try { const width = Number(localStorage.getItem('necto:catalog-width')); if (width >= 180 && width <= 360) catalogWidth.value = width } catch { /* Optional layout preference. */ }
watch(catalogWidth, width => { try { localStorage.setItem('necto:catalog-width', String(width)) } catch { /* Memory-only fallback. */ } })
const syncCatalog = () => { catalogOpen.value = !catalogMedia.matches }
catalogMedia.addEventListener('change', syncCatalog)
onUnmounted(() => catalogMedia.removeEventListener('change', syncCatalog))
function selectCatalogOperation(operation, group) {
  selectOperation(operation, group)
  if (catalogMedia.matches) catalogOpen.value = false
}
const defaultPresetColor = '#287557'
const activePresetNames = ref([])
const settingsOpen = ref(false)
const settingsTab = ref('presets')
const skeletonWalking = ref(false)
let stampClicks = 0
let firstStampClick = 0
const settingsButton = ref(null)
const settingsCloseButton = ref(null)
const presetList = ref(null)
const presetNameInput = ref(null)
const presetFields = ref(null)
const presetDeleteControl = ref(null)
const graphView = ref('')
watch(graphView, view => { if (view === 'builder') builderVisited.value = true })
const basePath = new URL(document.baseURI).pathname
const historyEntries = new Map()
const pendingRoute = shallowRef(null)
const routeError = ref('')
let activeRoute
const editedPresetName = ref('')
const newPresetName = ref('')
const presetError = ref('')
const confirmingPresetDeletion = ref(false)
const activePresetValues = computed(() => activePresetNames.value.map(name => presets.value.get(name)))
const editedPresetValues = computed(() => presets.value.get(editedPresetName.value))
watch([editedPresetName, settingsOpen, settingsTab], () => { confirmingPresetDeletion.value = false })
// Keep the original storage key so saved environments carry over to presets.
const storageKey = computed(() => 'necto:environments:' + workspaceIdentity(configuration.value))
const endpointHeading = ref(null)
const workArea = ref(null)
const chain = computed(() => {
  if (selectedChain.value.length) return selectedChain.value
  const group = groups.value[0]
  const operation = group?.operations[0]
  return operation ? [{ operation, group: group.name, session: draftFor(operation) }] : []
})
const currentIndex = computed(() => inspectedScenarioStep.value === null ? chain.value.length - 1 : Math.min(inspectedScenarioStep.value, chain.value.length - 1))
const current = computed(() => chain.value[currentIndex.value])
const authorizedCount = computed(() => { const api = authentication.apis.get(current.value?.operation.apiId ?? 'local'); return Object.keys(api?.credentials ?? {}).length + (api?.access ? 1 : 0) })
function openAuthorization(id = current.value?.operation.apiId ?? 'local') { authorizationApiId.value = id; authorizationOpen.value = true }
async function closeAuthorization() { authorizationOpen.value = false; await nextTick(); authorizationButton.value?.focus() }
async function retryAuthorizedMetadata(id) {
  if (typeof id === 'string' && id !== 'local') {
    await externalApis.testConnection(id)
    return { error: externalStatuses.get(id)?.error || '' }
  }
  const outcome = await reloadCatalog()
  if (typeof id !== 'string') await Promise.all(connections.value.map(entry => externalApis.testConnection(entry.id)))
  return { error: error.value, message: outcome?.message }
}
watch([spec, configuration, operations, connections, externalApis.contexts], () => {
  const activeIds = new Set(['local', ...connections.value.map(entry => entry.id)])
  for (const id of authentication.apis.keys()) if (!activeIds.has(id)) authentication.remove(id)
  if (configuration.value) {
    const local = operations.value.filter(operation => operation.apiId === 'local')
    authentication.register({ id: 'local', name: spec.value?.info?.title ?? 'Local API', document: spec.value,
      configuration: configuration.value, schemes: local[0]?.securitySchemes ?? spec.value?.components?.securitySchemes ?? {},
      origins: operationOrigins(local, configuration.value) })
  }
  for (const entry of connections.value) {
    const context = externalApis.contexts.value.find(api => api.id === entry.id)
    const config = context?.configuration ?? { openApiUrl: entry.openApiUrl, endpointMappingsUrl: entry.endpointMappingsUrl,
      apiBaseUrl: entry.apiBaseUrl || new URL('/', entry.openApiUrl).href, overrideServer: Boolean(entry.apiBaseUrl) }
    const scoped = operations.value.filter(operation => operation.apiId === entry.id)
    authentication.register({ id: entry.id, name: entry.name, configuration: config, document: context?.document,
      schemes: scoped[0]?.securitySchemes ?? context?.document?.components?.securitySchemes ?? {}, origins: operationOrigins(scoped, config) })
  }
})
function operationOrigins(entries, config) {
  const origins = new Set([new URL(config.openApiUrl).origin, new URL(config.apiBaseUrl || '/', config.openApiUrl).origin])
  for (const operation of entries) {
    for (const server of [operation.server, ...(operation.servers ?? []), configuration.value?.serverProfiles?.[operation.apiId ?? 'local']].filter(Boolean)) {
      try {
        const url = server.url.replace(/\{([^}]+)\}/g, (_, name) => server.values?.[name] ?? server.variables?.[name]?.default ?? '')
        origins.add(new URL(url, config.openApiUrl).origin)
      } catch { /* Invalid servers are reported when building requests. */ }
    }
  }
  return [...origins]
}
onUnmounted(authentication.onChange(ids => {
  const affected = steps => steps.some(step => ids.includes(step.operation.apiId ?? 'local'))
  if (affected(scenarioState.steps)) { scenarioStore.stop(); scenarioState.steps = []; scenarioState.error = ''; scenarioState.status = 'idle' }
  for (const [id, execution] of scenarioRuns) if (affected(execution.steps)) scenarioRuns.delete(id)
  for (const session of [...sessions.values(), ...chain.value.map(step => step.session)]) if (ids.includes(session.apiId ?? 'local')) { session.result = null; session.error = '' }
  for (const [key, entry] of historyEntries) if (affected(entry.steps)) historyEntries.delete(key)
  if (ids.includes('local')) void reloadCatalog()
}))

const requestValues = computed(() => current.value ? valuesFor(current.value.operation) : new Map())
const visiblePresetNames = computed(() => {
  if (!current.value) return []
  const { operation, session } = current.value
  return [...presets.value]
    .filter(([, preset]) => hasPresetFor(operation, session.body, valuesFor(operation, [preset])))
    .map(([name]) => name)
})
const presetOrder = computed(() => {
  const active = activePresetNames.value
  const inactive = visiblePresetNames.value.filter(name => !active.includes(name))
  return { names: [...active, ...inactive], firstInactive: active.length ? inactive[0] : undefined }
})
const hoveredPresetOrder = ref(null)
const displayedPresetOrder = computed(() => hoveredPresetOrder.value ?? presetOrder.value)

function holdPresetOrder(event) {
  if (event.pointerType === 'mouse') hoveredPresetOrder.value = presetOrder.value
}

function releasePresetOrder() {
  hoveredPresetOrder.value = null
}

watch([graphView, settingsOpen, storageKey], releasePresetOrder)

function valuesFor(operation, layers = activePresetValues.value) {
  if (operation.apiId && operation.apiId !== 'local' && !operation.usePresets) return new Map()
  return resolveNamedRequestValues(operation, ...layers.map(values => ({ name: [...presets.value].find(([, stored]) => stored === values)?.[0], values })))
}

function sampleStorageKey(operation) {
  return 'necto:request-samples:' + JSON.stringify([
    workspaceIdentity(operation.configuration ?? configuration.value),
    operation.key,
  ])
}

function createDraft(operation) {
  const session = createSession(operation)
  try {
    const { samples, defaultName } = readSamples(localStorage, sampleStorageKey(operation))
    const sample = samples.find(sample => sample.name === defaultName)
    if (sample) applySample(operation, session, sample)
  } catch {
    // The sample controls report storage errors when the operation is opened.
  }
  return session
}

function draftFor(operation) {
  return sessionFor(operation, createDraft)
}

function availableChain(steps, available = operations.value) {
  const byKey = new Map(available.map(operation => [operation.key, operation]))
  const missing = steps.findIndex(step => !byKey.has(step.operation.key))
  return (missing < 0 ? steps : steps.slice(0, missing)).map(step => {
    const operation = byKey.get(step.operation.key)
    return { ...step, operation, group: operation.tags.includes(step.group) ? step.group : operation.tags[0] }
  })
}

watch(operations, available => {
  if (!selectedChain.value.length) return
  const valid = availableChain(selectedChain.value, available)
  if (valid.length === selectedChain.value.length) selectedChain.value = valid
  else resetChain(valid)
})

watch(() => workspaceIdentity(configuration.value), (next, previous) => {
  if (!previous || next === previous) return
  scenarioStore.stop(); scenarioRuns.clear(); editingScenarioId.value = ''
  sessions.clear(); requestHistory.clear(); historyEntries.clear()
  selectedChain.value = []; inspectedScenarioStep.value = null
  pendingRoute.value = null; routeError.value = ''
}, { flush: 'sync' })

watch(externalApis.revision, () => {
  for (const id of externalApis.changedApiIds.value) {
  for (const [key, session] of sessions) if (session.apiId === id) sessions.delete(key)
  for (const [key, entry] of historyEntries) {
    if (entry.steps.some(step => step.operation.apiId === id)) historyEntries.delete(key)
  }
  if (scenarioState.steps.some(step => step.operation.apiId === id)) {
    scenarioState.steps = []; scenarioState.status = scenarioState.id ? 'saved' : 'idle'; scenarioState.error = ''
  }
  const index = chain.value.findIndex(step => step.operation.apiId === id)
  if (index >= 0) resetChain(chain.value.slice(0, index))
  }
})

function loadPresets() {
  presets.value = new Map(); presetColors.value = new Map(); activePresetNames.value = []
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey.value))
    if (!saved) return
    presets.value = new Map((saved.presets ?? saved.environments).map(([name, values]) =>
      [name, saved.version === 2 ? new Map(values) : migratePreset(values)]))
    presetColors.value = new Map(Object.entries(saved.colors ?? {}).filter(([name, color]) =>
      presets.value.has(name) && /^#[0-9a-f]{6}$/i.test(color)))
    const active = Array.isArray(saved.active) ? saved.active : [saved.active]
    activePresetNames.value = [...new Set(active.filter(name => presets.value.has(name)))]
  } catch {
    presetError.value = 'Could not load saved presets in this browser.'
  }
}
watch(configuration, loadPresets)
onWorkspaceImport(storageKey, loadPresets)

function savePresets() {
  try {
    const entries = Array.from(presets.value, ([name, values]) => [name, [...values]])
    localStorage.setItem(storageKey.value, JSON.stringify({
      version: 2,
      active: activePresetNames.value,
      presets: entries,
      colors: Object.fromEntries(presetColors.value)
    }))
    presetError.value = ''
  } catch {
    presetError.value = 'Could not save presets in this browser.'
  }
}

function resetPresetSessions() {
  const selected = current.value
  const separateDraft = selected?.session.sampleName && selected.session !== sessions.get(selected.operation.key)
  for (const [key, session] of sessions) {
    sessions.set(key, { ...session, result: null, pending: false, error: '' })
  }
  if (selected) {
    const { operation, group, session } = selected
    const draft = separateDraft
      ? { ...session, bindings: [], result: null, pending: false, error: '' }
      : draftFor(operation)
    resetChain([{ operation, group, session: draft }])
  }
}

function togglePreset(name, enabled) {
  activePresetNames.value = enabled
    ? [...activePresetNames.value, name]
    : activePresetNames.value.filter(activeName => activeName !== name)
  resetPresetSessions()
  savePresets()
}

async function configureScenarioFolder(){settingsTab.value='workspace';if(!settingsOpen.value)await toggleSettings()}
async function toggleSettings() {
  if (settingsOpen.value) {
    closeSettings()
    return
  }
  editedPresetName.value = activePresetNames.value.at(-1) ?? presets.value.keys().next().value ?? ''
  settingsOpen.value = true
  await nextTick()
  const firstControl = settingsTab.value === 'presets' && !presets.value.size
    ? presetNameInput.value : settingsCloseButton.value
  firstControl?.focus()
}

async function editActivePreset(name) {
  settingsTab.value = 'presets'
  editedPresetName.value = name
  settingsOpen.value = true
  await nextTick()
  presetList.value?.querySelector('[aria-current="true"]')?.focus()
}

function clickBrandStamp(event) {
  if (skeletonWalking.value) return
  if (stampClicks === 0 || event.timeStamp - firstStampClick > 750) {
    firstStampClick = event.timeStamp
    stampClicks = 0
  }
  stampClicks += 1
  if (stampClicks === 3) {
    stampClicks = 0
    skeletonWalking.value = true
  }
}

async function closeSettings() {
  settingsOpen.value = false
  await nextTick()
  settingsButton.value?.focus()
}

function trapSettingsFocus(event) {
  if (event.key !== 'Tab') return
  const focusable = [...event.currentTarget.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length && !element.closest('[inert]'))
  const first = focusable[0], last = focusable.at(-1)
  if (!first) { event.preventDefault(); return }
  if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
    event.preventDefault(); last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
    event.preventDefault(); first.focus()
  }
}

async function addPreset() {
  const name = newPresetName.value.trim()
  if (!name) return
  if (presets.value.has(name)) {
    presetError.value = 'A preset with that name already exists.'
    return
  }
  presets.value.set(name, new Map())
  newPresetName.value = ''
  editedPresetName.value = name
  savePresets()
  await nextTick()
  presetFields.value?.addRow()
}

function savePresetValues(values) {
  const name = editedPresetName.value
  presets.value.set(name, values)
  if (activePresetNames.value.includes(name)) resetPresetSessions()
  savePresets()
}

function savePresetColor(color) {
  presetColors.value.set(editedPresetName.value, color)
  savePresets()
}

async function removePreset() {
  const name = editedPresetName.value
  presets.value.delete(name)
  presetColors.value.delete(name)
  editedPresetName.value = presets.value.keys().next().value ?? ''
  if (activePresetNames.value.includes(name)) togglePreset(name, false)
  else savePresets()
  await nextTick()
  const nextControl = presetList.value?.querySelector('[aria-current="true"]') ?? presetNameInput.value
  nextControl?.focus()
}

async function confirmPresetDeletion(open) {
  confirmingPresetDeletion.value = open
  await nextTick()
  presetDeleteControl.value?.focus()
}

function runInContext(operation, session) {
  return run(operation, session, valuesFor(operation))
}

const relatedResults = computed(() => {
  const results = new Map()
  for (const [key, session] of sessions) {
    if (session.result) results.set(key, [session.result])
  }
  for (const { operation, session } of chain.value.slice(0, currentIndex.value)) {
    if (session.result) {
      results.set(operation.key, [session.result, ...(results.get(operation.key) ?? [])])
    }
  }
  return results
})

const relatedTargets = computed(() => {
  if (!current.value) return []
  const { operation, session } = current.value
  const selected = session.result?.selectedPath
    ? targetsFor(operation, session.result) : []
  const result = session.result ? { ...session.result, selectedPath: undefined } : null
  return targetsFor(operation, result).map(target => {
    const values = valuesFor(target.operation)
    return {
      ...target,
      presetInputs: presetInputs(target.operation, createDraft(target.operation).body, values),
      selectedCandidates: selected.find(entry => entry.operation.key === target.operation.key)?.candidates ?? [],
      candidates: target.candidates.filter(choice =>
        choice.location === 'body' || !values.has(contextKey({ in: choice.location, name: choice.name })),
      ),
    }
  })
})

async function focusEndpoint() {
  await nextTick()
  if (workArea.value) workArea.value.scrollTop = 0
  endpointHeading.value?.scrollIntoView({ block: 'nearest' })
  endpointHeading.value?.focus({ preventScroll: true })
}

function chainRoute(steps = selectedChain.value) {
  return { view: '', operationKey: steps.at(-1)?.operation.key }
}

function writeRoute(route, { replace = false, preserveUrl = false } = {}) {
  const entry = Math.random().toString(36)
  historyEntries.set(entry, {
    steps: selectedChain.value, index: inspectedScenarioStep.value,
    scenarioId: editingScenarioId.value, name: scenarioName.value, folderSource:editingFolderSource.value,
  })
  const state = { nectoEntry: entry, scenarioStep: route.index }
  if (replace) {
    historyEntries.delete(history.state?.nectoEntry)
    history.replaceState(state, '', preserveUrl ? window.location.href : routePath(route, basePath))
  } else history.pushState(state, '', routePath(route, basePath))
  activeRoute = route
  pendingRoute.value = null
  routeError.value = ''
  graphView.value = route.view
}

function showChain(steps, route = chainRoute(steps), options) {
  selectedChain.value = steps
  inspectedScenarioStep.value = route.index ?? null
  writeRoute(route, options)
  return focusEndpoint()
}

function resetChain(steps) {
  selectedChain.value = steps
  inspectedScenarioStep.value = null
  editingScenarioId.value = ''
  scenarioName.value = ''
  if (activeRoute && !graphView.value && !pendingRoute.value) writeRoute(chainRoute(), { replace: true })
}

function navigateView(view) {
  if (workspaceLocked.value) return
  if (view === graphView.value && !routeError.value && !pendingRoute.value) return
  if (!view && inspectedScenarioStep.value !== null && editingScenarioId.value) {
    enterScenario(selectedChain.value, editingScenarioId.value, scenarioName.value, inspectedScenarioStep.value)
  } else if (!view && selectedChain.value.length > 1) {
    const steps = selectedChain.value
    for (let count = 1; count < steps.length; count++) {
      selectedChain.value = steps.slice(0, count)
      writeRoute(chainRoute())
    }
    void showChain(steps)
  } else writeRoute(view ? { view } : chainRoute())
}

function enterScenario(steps, id, name, index, replace = false, folderSource) {
  selectedChain.value = steps
  editingScenarioId.value = id
  editingFolderSource.value = folderSource??null
  scenarioName.value = name
  // Entering at a later step also adds the preceding steps to browser history.
  for (let step = 0; step < index; step++) {
    inspectedScenarioStep.value = step
    writeRoute({ view: '', scenarioId: id, index: step }, { replace: replace && step === 0 })
  }
  void showChain(steps, { view: '', scenarioId: id, index }, { replace: replace && index === 0 })
}

function selectChainStep(index) {
  if (!activeRoute?.scenarioId || inspectedScenarioStep.value === null) {
    void showChain(chain.value.slice(0, index + 1))
    return
  }
  if (index < currentIndex.value) {
    history.go(index - currentIndex.value)
    return
  }
  const route = { ...activeRoute }
  for (let step = currentIndex.value + 1; step <= index; step++) {
    inspectedScenarioStep.value = step
    writeRoute({ ...route, index: step })
  }
  void focusEndpoint()
}

function restoreRoute() {
  if (builderPending.value) { writeRoute({ view: 'builder' }, { replace: true }); return }
  const route = readRoute(window.location.pathname, basePath)
  activeRoute = route
  graphView.value = route.view
  routeError.value = ''
  pendingRoute.value = route
}

function resolveRoute() {
  const route = pendingRoute.value
  if (!route || !spec.value) return
  const entry = historyEntries.get(history.state?.nectoEntry)
  const steps = entry && availableChain(entry.steps)
  if (entry && steps.length === entry.steps.length) {
    selectedChain.value = steps
    inspectedScenarioStep.value = entry.index
    editingScenarioId.value = entry.scenarioId
    editingFolderSource.value = entry.folderSource??null
    scenarioName.value = entry.name
    pendingRoute.value = null
    if (!route.view && steps.length) void focusEndpoint()
    return
  }

  resetChain([])
  if (route.operationKey) {
    const operation = operations.value.find(item => item.key === route.operationKey)
    if (operation) {
      void showChain([{ operation, group: operation.tags[0], session: draftFor(operation) }], route,
        { replace: true, preserveUrl: true })
      return
    }
    if (!externalPending.value) routeError.value = 'This endpoint is unavailable. Check API visibility and connections.'
  } else if (route.scenarioId) {
    if (externalPending.value || scenarioPending.value) return
    const scenario = scenarios.value.find(item => item.id === route.scenarioId)
    const plan = scenario?.steps[route.index] && scenarioStore.open(scenario, scenarioContext())
    if (plan) {
      if (history.state?.scenarioStep === route.index) {
        editingScenarioId.value = scenario.id
        editingFolderSource.value = scenario._sharedSource??null
        scenarioName.value = scenario.name
        void showChain(plan, route, { replace: true, preserveUrl: true })
      } else enterScenario(plan, scenario.id, scenario.name, route.index, true, scenario._sharedSource)
      editingFolderSource.value = scenario._sharedSource??null
      return
    }
    graphView.value = 'scenarios'
    routeError.value = scenario?.steps[route.index] ? scenarioState.error : 'This saved scenario step is unavailable.'
  } else if (route.invalid) routeError.value = 'This workspace address is invalid.'
  else writeRoute(route, { replace: true, preserveUrl: true })
}

watch([pendingRoute, spec, operations, scenarios, externalPending, scenarioPending], resolveRoute)
onMounted(() => {
  window.addEventListener('popstate', restoreRoute)
  restoreRoute()
})
onUnmounted(() => window.removeEventListener('popstate', restoreRoute))

function loadCurlDraft({ operation, draft }) {
  const session = createSession(operation)
  Object.assign(session, draft)
  sessions.set(operation.key, session)
  editingScenarioId.value = ''; scenarioName.value = ''
  if (catalogMedia.matches) catalogOpen.value = false
  void showChain([{ operation, group: operation.tags[0], session }])
}
function selectOperation(operation, group) {
  editingScenarioId.value = ''
  scenarioName.value = ''
  return showChain([{ operation, group, session: draftFor(operation) }])
}

function canSendRelated(operation, choices) {
  if (!['GET', 'HEAD'].includes(operation.method) || operation.requestBody) return false
  try {
    const session = createDraft(operation)
    for (const choice of choices) applyChoice(session, choice.location, choice)
    buildRequest(operation, configuration.value, session, valuesFor(operation))
    return true
  } catch {
    return false
  }
}

async function follow(operation, choices, send) {
  if (send && !canSendRelated(operation, choices)) return
  const session = createDraft(operation)
  for (const choice of choices) choose(session, choice.location, choice, currentIndex.value)
  const group = operation.tags.includes(current.value.group) ? current.value.group : operation.tags[0]
  await showChain([...chain.value.slice(0, currentIndex.value + 1), { operation, group, session }])
  if (send) await runInContext(operation, session)
}

function choose(session, location, choice, sourceIndex) {
  try {
    applyChoice(session, location, choice)
    const targetIndex = sourceIndex === undefined ? currentIndex.value : sourceIndex + 1
    const origin = sourceIndex ?? chain.value.slice(0, targetIndex).findLastIndex(step =>
      step.operation.key === choice.binding?.operationKey && step.session.result === choice.sourceResult)
    rememberBinding(session, { ...choice, location }, origin)
    session.error = ''
  } catch (cause) {
    session.error = cause.message
  }
}
function scenarioContext(requestValuesFor = valuesFor) {
  return { operations: operations.value, links: mappingLinks.value, configuration: configuration.value, authorize: authentication.apply,
    createSession, valuesFor: requestValuesFor }
}
function builderPresetContext(names) {
  const layers = names.map(name => presets.value.get(name)).filter(Boolean)
  return { ...scenarioContext(operation => valuesFor(operation, layers)), presetNames: [...names] }
}
function saveScenario() {
  try {
    const saved = scenarioStore.save(chain.value, scenarioName.value, overwriteScenario.value?.id, valuesFor, overwriteScenario.value?.id===editingScenarioId.value?editingFolderSource.value:undefined)
    editingScenarioId.value = saved.id
    editingFolderSource.value = saved._sharedSource??null
    scenarioName.value = saved.name
    writeRoute(activeRoute, { replace: true, preserveUrl: true })
    scenarioDialog.value?.close()
  }
  catch (cause) { scenarioError.value = cause.message }
}
function updateEditingScenario() {
  if (!editingScenario.value) return
  scenarioName.value = editingScenario.value.name
  saveScenario()
}
function copyEditingScenario() {
  scenarioName.value = editingScenario.value.name + ' copy'
  scenarioDialog.value.showModal()
}

function previewScenarioTargets(scenario, presetNames) {
  const layers = presetNames.map(name => presets.value.get(name)).filter(Boolean)
  return scenarioTargets(scenario, scenarioContext(operation => valuesFor(operation, layers)))
}

function openScenario(scenario) {
  const steps = scenarioStore.open(scenario, scenarioContext())
  if (!steps) return
  enterScenario(steps, scenario.id, scenario.name, 0, false, scenario._sharedSource)
}
async function replayScenario(scenario, presetNames) {
  if (scenarioBusy.value) return
  const layers = presetNames.map(name => presets.value.get(name))
  const replay = scenarioStore.run(scenario, scenarioContext(operation => valuesFor(operation, layers)),
    (operation, session, values, signal, onRequest) => run(operation, session, values, { signal, onRequest }))
  await nextTick()
  scenarioPanel.value?.showProgress()
  await replay
}
function inspectScenario(index, execution) {
  const visible = availableChain(execution.steps)
  if (!visible[index]) {
    scenarioError.value = 'This scenario step is unavailable. Enable its API connection before inspecting it.'
    return
  }
  scenarioError.value = ''
  enterScenario(visible, execution.id, execution.name, index, false, execution._sharedSource)
}
function undoRemoveScenario() {
  try { scenarioStore.undoRemove() }
  catch (cause) { scenarioError.value = cause.message }
}
function removeScenario(id) {
  try { scenarioStore.remove(id) }
  catch (cause) { scenarioError.value = cause.message }
}

</script>

<template>
  <div class="brand-track" :inert="settingsOpen">
    <div class="brand-stamp">
      <button type="button" class="brand-button" @click="clickBrandStamp">
        <span class="brand-mark" aria-hidden="true">N</span>
        <span>Necto</span>
      </button>
      <NectoSkeleton v-if="skeletonWalking" @finish="skeletonWalking = false" />
    </div>
  </div>
  <main class="app">
    <header class="hero" :inert="settingsOpen">
      <nav v-if="spec" class="view-navigation" aria-label="Workspace views">
        <button type="button" class="secondary" :disabled="workspaceLocked" :aria-pressed="!graphView" @click="navigateView('')">API</button>
        <button v-if="configuration?.agentUrl" type="button" class="secondary" :disabled="workspaceLocked" :aria-pressed="graphView === 'agent'" @click="navigateView('agent')">Bring your agent</button>
        <button type="button" class="secondary" :disabled="workspaceLocked" :aria-pressed="graphView === 'scenarios' || graphView === 'builder'" @click="navigateView('scenarios')">Scenarios</button>
        <button type="button" class="secondary" :disabled="workspaceLocked" :aria-pressed="graphView === 'entities'" @click="navigateView('entities')">Entity graph</button>
        <button type="button" class="secondary" :disabled="workspaceLocked" :aria-pressed="graphView === 'endpoints'" @click="navigateView('endpoints')">Endpoint graph</button>
      </nav>
      <label v-if="spec" class="mobile-workspace-view">
        <span class="sr-only">Workspace view</span>
        <select :value="graphView" :disabled="workspaceLocked" @change="navigateView($event.target.value)">
          <option value="">API</option><option v-if="configuration?.agentUrl" value="agent">Bring your agent</option><option value="scenarios">Scenarios</option><option value="builder">Scenario Builder</option><option value="entities">Entity graph</option><option value="endpoints">Endpoint graph</option>
        </select>
      </label>
      <div class="api-identity">
        <div class="api-info">
          <DescriptionHelp class="mobile-api-about" label="About API" :trigger-text="spec?.info?.title ?? 'API documentation'" :context="spec?.info?.version ? 'Version ' + spec.info.version : spec?.info?.title" :summary="spec?.info?.summary" :description="spec?.info?.description" />
          <div class="api-title">
            <small v-if="documentSource.kind === 'import'" :title="documentSource.name">Imported</small><h1 :title="spec?.info?.title">{{ spec?.info?.title ?? 'API documentation' }}</h1>
            <small v-if="spec?.info?.version">Version {{ spec.info.version }}</small>
          </div>
          <DescriptionHelp class="desktop-api-help" label="About API" :summary="spec?.info?.summary" :description="spec?.info?.description" />
        </div>
        <button ref="authorizationButton" type="button" class="secondary authorize-button" aria-label="Authorize" :title="authorizedCount ? 'Authorize · configured' : 'Authorize'" :data-configured="authorizedCount > 0" @click="openAuthorization()"><svg class="authorize-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="4"/><path d="m11 11 9 9m-3-3 2-2m-5 2 2-2"/></svg><span class="authorize-label">Authorize<small v-if="authorizedCount"> · configured</small></span></button>
        <button v-if="spec" ref="settingsButton" type="button" class="secondary settings-icon" :disabled="workspaceLocked"
          aria-label="Settings" title="Settings" :aria-expanded="settingsOpen" :aria-controls="settingsOpen ? 'settings-panel' : undefined" @click="toggleSettings">
          <span aria-hidden="true">⚙︎</span>
        </button>
      </div>
    </header>

    <AuthorizationDialog v-if="authorizationOpen" :authentication="authentication" :api-id="authorizationApiId" @close="closeAuthorization" :retry-documentation="retryAuthorizedMetadata" />
    <p v-if="error" class="app-message error" role="alert">{{ error }} <button type="button" class="secondary" @click="retryAuthorizedMetadata">Retry documentation</button></p>
    <p v-else-if="!spec" class="app-message" role="status">Loading API documentation…</p>
    <template v-else>
      <p v-if="spec?.['x-necto-import-warning']" class="app-message" role="status">{{ spec['x-necto-import-warning'] }}</p>
      <p v-if="routeError" class="app-message error" role="alert">{{ routeError }}</p>
      <p v-else-if="pendingRoute" class="app-message" role="status">Loading workspace view…</p>
      <div v-if="settingsOpen" class="settings-backdrop" aria-hidden="true" @click="closeSettings"></div>
      <Transition name="settings-drawer">
        <aside v-if="settingsOpen" id="settings-panel" class="work-area settings" :class="{ 'settings-presets': settingsTab === 'presets' }" role="dialog" aria-modal="true" @keydown="trapSettingsFocus" aria-labelledby="settings-title" @keydown.esc.stop="closeSettings">
          <div class="settings-header">
            <h2 id="settings-title">Settings</h2>
            <button ref="settingsCloseButton" type="button" class="secondary settings-icon" aria-label="Close settings" @click="closeSettings">
              <span aria-hidden="true">×</span>
            </button>
            <nav class="settings-sections" aria-label="Settings sections">
              <button type="button" class="secondary" :aria-pressed="settingsTab === 'presets'" @click="settingsTab = 'presets'">Presets</button>
              <button type="button" class="secondary" :aria-pressed="settingsTab === 'connections'" @click="settingsTab = 'connections'">External APIs</button>
              <button type="button" class="secondary" :aria-pressed="settingsTab === 'workspace'" @click="settingsTab = 'workspace'">Workspace</button>
            </nav>
          </div>
          <div :inert="workspaceLocked">
            <section v-show="settingsTab === 'presets'" class="preset-panel" aria-labelledby="presets-title">
              <header class="preset-intro">
                <h3 id="presets-title">Request presets</h3>
                <p class="muted">Save shared values and activate a preset to use them in matching requests.</p>
              </header>
              <p v-if="presetError" class="error" role="alert">{{ presetError }}</p>
              <div class="preset-layout">
                <div class="preset-picker">
                  <ul v-if="presets.size" ref="presetList" class="preset-list" aria-label="Presets">
                    <li v-for="name in presets.keys()" :key="name">
                      <button type="button" :aria-current="editedPresetName === name ? 'true' : undefined" @click="editedPresetName = name">
                        <span class="preset-dot" :style="{ backgroundColor: presetColors.get(name) ?? defaultPresetColor }" aria-hidden="true"></span>
                        <span class="preset-item-name">{{ name }}</span>
                        <small v-if="activePresetNames.includes(name)">Active</small>
                      </button>
                    </li>
                  </ul>
                  <form class="preset-create" @submit.prevent="addPreset">
                    <label for="new-preset-name">New preset</label>
                    <div>
                      <input id="new-preset-name" ref="presetNameInput" v-model="newPresetName" placeholder="e.g. Staging" required>
                      <button type="submit" :class="presets.size ? 'secondary' : 'primary'">Add</button>
                    </div>
                  </form>
                </div>
                <div v-if="editedPresetValues" class="preset-detail">
                  <header class="preset-detail-header">
                    <h4>{{ editedPresetName }}</h4>
                    <label class="preset-color-field">
                      Color
                      <input type="color" :value="presetColors.get(editedPresetName) ?? defaultPresetColor"
                        @input="savePresetColor($event.target.value)">
                    </label>
                    <label class="preset-active-field">
                      <input type="checkbox" :checked="activePresetNames.includes(editedPresetName)"
                        @change="togglePreset(editedPresetName, $event.target.checked)">
                      Use in requests
                    </label>
                  </header>
                  <ValuesEditor :key="editedPresetName" ref="presetFields" :values="editedPresetValues" label="Preset fields" @save="savePresetValues" />
                  <footer class="preset-detail-footer">
                    <button v-if="!confirmingPresetDeletion" ref="presetDeleteControl" type="button" class="preset-delete secondary" @click="confirmPresetDeletion(true)">Delete preset</button>
                    <div v-else class="preset-delete-confirmation">
                      <p>Delete this preset and its fields?</p>
                      <button ref="presetDeleteControl" type="button" class="secondary" @click="confirmPresetDeletion(false)">Cancel</button>
                      <button type="button" class="preset-delete secondary" @click="removePreset">Delete preset</button>
                    </div>
                  </footer>
                </div>
                <div v-else class="preset-empty">
                  <h4>{{ presets.size ? 'Select a preset' : 'No presets yet' }}</h4>
                  <p class="muted">{{ presets.size ? 'Choose a preset to edit its fields.' : 'Name your first preset to start adding fields.' }}</p>
                </div>
              </div>
            </section>
            <WorkspaceSettings :folder="scenarioFolder" v-show="settingsTab === 'workspace'" v-model:catalog-width="catalogWidth" :import-document="importDocument" :document-source="documentSource" :restore-document="restoreServerDocument" :operations="operations" />
            <ExternalApiSettings v-show="settingsTab === 'connections'" v-model:show="showExternalApis" :connections="connections" :statuses="externalStatuses" :storage-error="externalStorageError"
              :save="externalApis.saveConnection" :remove="externalApis.removeConnection" :test="externalApis.testConnection" />
          </div>
        </aside>
      </Transition>
      <p v-if="graphView === 'agent' && !configuration?.agentUrl" class="app-message">Bring your agent is not enabled on this server.</p>
      <AgentPanel :inert="settingsOpen" v-if="configuration?.agentUrl" v-show="graphView === 'agent'" :spec="spec" :configuration="configuration" :operations="operations" :mappings="endpointMappings" :apis="externalApis.contexts.value" :busy="mappingPending || externalPending" />
      <EntityGraph :configuration="configuration" :authentication="authentication" :inert="settingsOpen" :initial-operation-key="current?.operation.key" v-if="graphView === 'entities'" :spec="spec" :apis="externalApis.contexts.value" :operations="operations" :mappings="endpointMappings" :mapping-error="mappingError"
        @open-operation="operation => selectOperation(operation, operation.tags[0])" />
      <EndpointGraph :inert="settingsOpen" :initial-operation-key="current?.operation.key" v-if="graphView === 'endpoints'" :operations="operations" :mappings="endpointMappings" :mapping-error="mappingError"
        @open-operation="operation => selectOperation(operation, operation.tags[0])" />
      <ScenarioBuilder :mapping-links="mappingLinks" :folder="scenarioFolder" @folder-settings="configureScenarioFolder" v-if="builderVisited" v-show="graphView === 'builder'" :inert="settingsOpen" :configuration="configuration" :operations="operations" :scenarios="scenarios" :context="scenarioContext" :preset-context="builderPresetContext" :preset-names="[...presets.keys()]" :active-preset-names="activePresetNames" :authentication="authentication" :execute="(operation, session, values, signal, onRequest) => run(operation, session, values, { signal, onRequest })" :busy="scenarioBusy" @pending="builderPending = $event" @back="navigateView('scenarios')" />
      <ScenarioPanel :folder="scenarioFolder" @folder-settings="configureScenarioFolder" @builder="navigateView('builder')" :api-url="configuration?.openApiUrl" :document="spec" :mappings="endpointMappings" :configuration="configuration" :inert="settingsOpen" v-if="graphView === 'scenarios'" ref="scenarioPanel" :scenarios="scenarios" :state="scenarioState" :runs="scenarioRuns"

        :deleted="scenarioStore.deleted.value" @undo-remove="undoRemoveScenario" :pending="scenarioPending" :busy="scenarioBusy" :error="scenarioError" :preset-names="[...presets.keys()]"
        :active-preset-names="activePresetNames" @open="openScenario" @run="replayScenario"
        @remove="removeScenario" @stop="scenarioStore.stop" @inspect="inspectScenario">
        <template #run-targets="{ scenario, presetNames }">
          <details><summary>Targets for this run</summary>
            <ol><li v-for="(target, index) in previewScenarioTargets(scenario, presetNames)" :key="index">
              <span v-if="target.error">{{ target.error }}</span>
              <template v-else><strong>{{ target.api }}</strong> · {{ target.target }} · <code>{{ target.operation }}</code></template>
            </li></ol>
          </details>
        </template>
      </ScenarioPanel>
      <section v-if="!graphView && displayedPresetOrder.names.length" :inert="settingsOpen" class="preset-bar"
        aria-label="Presets" @pointerenter="holdPresetOrder" @pointerleave="releasePresetOrder">
        <strong>Presets</strong>
        <button v-for="name in displayedPresetOrder.names" :key="name" type="button" class="preset-toggle"
          :class="{ 'preset-group-start': name === displayedPresetOrder.firstInactive }"
          :disabled="workspaceLocked" :aria-pressed="activePresetNames.includes(name)"
          :style="{ '--preset-color': presetColors.get(name) ?? defaultPresetColor }"
          @click="togglePreset(name, !activePresetNames.includes(name))">{{ name }}</button>
        <template v-if="activePresetNames.length">
          <small v-if="current?.operation.apiId && current.operation.apiId !== 'local' && !current.operation.usePresets">Not applied to this external API.</small>
          <small v-else-if="!visiblePresetNames.some(name => activePresetNames.includes(name))">None apply to this request; related requests may still use them.</small>
        </template>
      </section>
      <div :inert="settingsOpen" v-show="!graphView" class="layout navigation-layout" :class="{ 'catalog-collapsed': !catalogOpen }" :style="{ '--catalog-width': catalogWidth + 'px' }">
        <div class="catalog-sidebar">
          <button
            type="button"
            class="catalog-toggle"
            :aria-expanded="catalogOpen"
            aria-controls="endpoint-catalog"
            :aria-label="catalogOpen ? 'Collapse endpoint catalog' : 'Expand endpoint catalog'"
            :title="catalogOpen ? 'Collapse endpoint catalog' : 'Expand endpoint catalog'"
            @click="catalogOpen = !catalogOpen"
          >
            <span aria-hidden="true">{{ catalogOpen ? '‹' : '›' }}</span>
          </button>
          <div v-show="catalogOpen" id="endpoint-catalog" class="catalog-container">
            <EndpointCatalog :inert="workspaceLocked"
              :groups="groups"
              :external-count="connections.length" :show-external="showExternalApis" :external-loading="externalPending"
              @toggle-external="showExternalApis = $event"
              :active-group="current?.group ?? ''"
              :active-operation="current?.operation.key ?? ''"
              @select-operation="selectCatalogOperation"
            >
              <template #actions><OperationTasks :configuration="configuration" :authentication="authentication" :operations="operations" @open-operation="operation => selectCatalogOperation(operation, operation.tags[0])" /><CurlImport :operations="operations" :configuration="configuration" :disabled="scenarioBusy" @import="loadCurlDraft" /></template>
            </EndpointCatalog>
          </div>
        </div>
        <div ref="workArea" class="work-area">
          <p v-if="mappingError" class="mapping-notice muted" role="status">{{ mappingError }}</p>
          <article v-if="current && !pendingRoute" :inert="workspaceLocked" aria-labelledby="endpoint-title">
            <div v-if="chain.length > 1 || editingScenario" class="chain-header">
              <nav class="breadcrumbs" aria-label="Request chain">
                <ol>
                  <li v-for="(step, index) in chain" :key="index">
                    <span v-if="index" class="separator" aria-hidden="true">›</span>
                    <span v-if="index === currentIndex" aria-current="step">
                      {{ step.operation.apiId !== 'local' ? step.operation.apiName + ' [' + step.operation.apiId + '] · ' : '' }}{{ step.operation.method }} {{ step.operation.name }}
                    </span>
                    <button v-else type="button" @click="selectChainStep(index)">
                      {{ step.operation.apiId !== 'local' ? step.operation.apiName + ' [' + step.operation.apiId + '] · ' : '' }}{{ step.operation.method }} {{ step.operation.name }}
                    </button>
                  </li>
                </ol>
              </nav>
              <div v-if="!editingScenario" class="chain-save-actions">
                <small>{{ chain.length }} {{ chain.length === 1 ? 'request' : 'requests' }} in chain</small>
                <button class="secondary save-scenario" type="button" aria-haspopup="dialog" aria-describedby="saving-guide" @click="scenarioDialog.showModal()">
                  Save scenario
                </button>
              </div>
            </div>
            <section v-if="editingScenario" class="scenario-edit-context" aria-label="Scenario editing">
              <div><strong>Scenario: {{ editingScenario.name }}</strong><span>Step {{ currentIndex + 1 }}/{{ chain.length }}</span><span role="status" class="save-state" :class="{ dirty: scenarioDirty }">{{ scenarioDirty ? 'Unsaved changes' : 'All changes saved' }}</span></div>
              <div class="scenario-edit-actions"><button type="button" class="primary" :disabled="scenarioBusy || !scenarioDirty" @click="updateEditingScenario">Update scenario</button><button type="button" class="secondary" :disabled="scenarioBusy" @click="copyEditingScenario">Save as copy</button></div>
              <details><summary>Scenario steps ({{ chain.length }})</summary><ol><li v-for="(step, index) in chain" :key="index"><button type="button" :aria-current="index === currentIndex ? 'step' : undefined" @click="selectChainStep(index)">{{ index + 1 }}. {{ step.operation.method }} {{ step.operation.name }}</button></li></ol></details>
            </section>
            <header class="endpoint-header">
              <p v-if="current.operation.apiId !== 'local'" class="external-api-label">{{ current.operation.apiName }} · {{ current.operation.apiId }}</p>
              <h2 id="endpoint-title" ref="endpointHeading" tabindex="-1">{{ current.operation.name }}</h2>
              <div class="endpoint-route">
                <span class="method" :data-method="current.operation.method">{{ current.operation.method }}</span>
                <code>{{ current.operation.path }}</code>
                <DescriptionHelp label="About endpoint" :summary="current.operation.summary" :description="current.operation.description" />
              </div>
              <details :key="current.operation.key" class="endpoint-help" @keydown.esc.stop.prevent="$event.currentTarget.open = false; $event.currentTarget.querySelector('summary').focus()">
                <summary>Help and presets</summary>
                <div class="endpoint-help-content">

              <div id="saving-guide">
                <p><strong>Saved requests</strong> keep input values for one endpoint so you can load them again.</p>
                <p><strong>Scenarios</strong> replay a chain of requests and pass response values between steps. Use a related request to add the next step; a one-request scenario is also supported.</p>
                <p><strong>Presets</strong> supply shared values across requests.</p>
              </div>
            <div v-if="!visiblePresetNames.length" class="preset-guidance">
              <template v-if="current.operation.apiId !== 'local' && !current.operation.usePresets">
                <span>Shared presets are disabled for this external API.</span>
                <button type="button" class="secondary" @click="settingsTab = 'connections'; toggleSettings()">Manage connection</button>
              </template>
              <template v-else>
                <span v-if="!presets.size">No presets yet. Reuse shared values across requests.</span>
                <span v-else>No presets match this request. Your presets remain available for other requests.</span>
                <button type="button" class="secondary" @click="settingsTab = 'presets'; toggleSettings()">{{ presets.size ? 'Manage presets' : 'Create preset' }}</button>
              </template>
            </div>

                  <button v-if="!editingScenario && chain.length === 1" type="button" class="secondary" @click="scenarioDialog.showModal()">Save as single-step scenario</button>
                </div>
              </details>
            </header>
            <dialog :key="current.operation.key" ref="scenarioDialog" class="endpoint-dialog" aria-labelledby="save-scenario-title">
              <h3 id="save-scenario-title">{{ editingScenario && !overwriteScenario ? 'Save scenario copy' : 'Save scenario' }}</h3>
              <p class="muted">Save this {{ chain.length }}-request chain to replay its steps and the values passed between them.</p>
              <form @submit.prevent="saveScenario">
                <label class="dialog-field">Scenario name <input v-model="scenarioName" required autofocus maxlength="120" placeholder="Invoice details"></label>
                <p v-if="scenarioError" class="error" role="alert">{{ scenarioError }}</p>
                <div class="dialog-actions">
                  <button class="secondary" type="button" @click="scenarioDialog.close()">Cancel</button>
                  <button class="primary" type="submit" :disabled="scenarioBusy">{{ overwriteScenario ? 'Update scenario' : 'Save current chain' }} ({{ chain.length }} steps)</button>
                </div>
              </form>
            </dialog>
            <OperationRunner :prepare="prepareRequest" :cancel="cancelRequest" :history="requestHistory" :configuration="configuration" :operation="current.operation" :session="current.session" :run="runInContext" :values="requestValues" :preset-colors="presetColors" :default-preset-color="defaultPresetColor" :selectors="selectablePaths(current.operation)" :has-related="relatedTargets.length > 0" @edit-preset="editActivePreset">
              <template #request-actions>
                <button class="secondary" type="button" aria-haspopup="dialog" @click="requestSamples.openStoreDialog()">
                  Save request
                </button>
              </template>
              <template #samples>
                <RequestSamples :key="sampleStorageKey(current.operation)" ref="requestSamples" :storage-key="sampleStorageKey(current.operation)"
                  :operation="current.operation" :session="current.session" :values="requestValues" />
              </template>
              <template #parameter-input="{ parameter, hint, id }">
                <ValueInput :id="id" v-model="current.session.fields[fieldKey(parameter)]"
                  :choices="choicesFor(current.operation, parameter.in, parameter.name, relatedResults)"
                  :required="parameter.required || parameter.in === 'path'" :placeholder="hint"
                  @choose="choose(current.session, parameter.in, $event)" />
              </template>
              <template #choices="{ location, parameterName }">
                <RelatedChoices v-if="location === 'body'"
                  :choices="choicesFor(current.operation, location, parameterName, relatedResults)"
                  @choose="choose(current.session, location, $event)"
                />
              </template>
              <template #related="{ searchResponse }">
                <RelatedTargets
                  :targets="relatedTargets" @search-response="searchResponse"
                  :can-send="canSendRelated"
                  @follow="follow" @edit-preset="editActivePreset"
                />
              </template>
            </OperationRunner>
          </article>
          <p v-else class="mapping-notice muted">No endpoints in this document.</p>
        </div>
      </div>
    </template>
  </main>
</template>

<style>
.chain-save-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.chain-save-actions small { color: var(--muted); }
.saving-guide { margin-block: .5rem .75rem; font-size: .8rem; color: var(--muted); }
.saving-guide summary { cursor: pointer; width: fit-content; }
.saving-guide p { margin: .4rem 0; max-width: 65ch; }

:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  color: #202b27;
  --surface: #fff;
  --canvas: #f7f9f6;
  --subtle: #f3f6f3;
  --line: #dce4de;
  --muted: #53625c;
  --accent: #145949;
  --accent-soft: #e2f1e9;
  background: var(--canvas);
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: #eef2ee; }
#app {
  --app-gutter: 1rem;
  position: relative;
  margin: var(--app-gutter);
}
.app {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 2 * var(--app-gutter));
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .75rem;
}
.hero { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .5rem 1rem .5rem 7rem; min-height: 3.5rem; border-bottom: 1px solid var(--line); }
.api-identity { display: flex; flex: 1 1 12rem; justify-content: flex-end; align-items: center; gap: .75rem; min-width: 0; }
.api-info { display:flex; align-items:center; gap:.35rem; min-width: 0; overflow-wrap: anywhere; text-align: right; }
.api-title { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .5rem; min-height: 1.65rem; }
.mobile-workspace-view, .hero .api-info > .mobile-api-about { display: none; }
.mobile-workspace-view > .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.hero h1 { margin: 0; font-size: 1.05rem; letter-spacing: -.025em; }
.hero p { margin: .25rem 0 0; font-size: .82rem; }
.brand-track {
  position: absolute;
  z-index: 1;
  inset: 0 0 auto;
  container-type: inline-size;
  pointer-events: none;
}
.brand-stamp {
  --stamp-inset: .8rem;
  position: absolute;
  top: .6rem;
  left: var(--stamp-inset);
  pointer-events: auto;
}
.brand-button {
  position: relative;
  z-index: 1;
  cursor: default;
  display: flex;
  align-items: center;
  gap: .45rem;
  padding: .25rem .55rem .25rem .3rem;
  border: 1px solid var(--line);
  border-radius: .55rem;
  background: var(--surface);
  color: var(--accent);
  font-size: .88rem;
  font-weight: 750;
}
.brand-button:hover { background: var(--surface); }
.brand-mark { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; border-radius: .45rem; background: var(--accent); color: white; }
.api-title small { padding: .125rem .375rem; border: 1px solid var(--line); border-radius: .375rem; color: var(--muted); font-size: .72rem; }
.preset-bar { display: flex; flex: none; align-items: center; gap: .4rem; overflow-x: auto; white-space: nowrap; padding: .35rem 1rem; border-bottom: 1px solid var(--line); background: var(--surface); font-size: .78rem; }
.preset-bar small { color: var(--muted); }
.preset-toggle { flex: none; padding: .2rem .55rem; border: 1px solid var(--line); border-radius: 1rem; font-size: inherit; }
.preset-toggle[aria-pressed="false"]:hover { background: var(--subtle); }
.preset-toggle[aria-pressed="true"] { border-color: var(--preset-color); background: color-mix(in srgb, var(--preset-color) 24%, var(--surface)); }
.preset-toggle.preset-group-start { margin-inline-start: .45rem; }
.layout {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: clamp(14rem, 23vw, 18rem) minmax(0, 1fr);
}
.navigation-layout { grid-template-columns: var(--catalog-width, 240px) minmax(0, 1fr); }
.navigation-layout.catalog-collapsed { grid-template-columns: 2rem minmax(0, 1fr); }
.catalog-sidebar { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--line); }
.catalog-toggle { display: grid; place-items: center; flex: none; align-self: flex-end; width: 2rem; height: 2rem; margin: .25rem; padding: 0; color: var(--accent); font-size: 1.5rem; line-height: 1; }
.catalog-toggle:focus-visible { outline-offset: -3px; }
.catalog-collapsed .catalog-toggle { place-items: start center; width: 100%; height: 100%; margin: 0; padding-top: .5rem; border-radius: 0; background: var(--surface); }
.catalog-collapsed .catalog-toggle:hover { background: var(--accent-soft); }
.catalog-container { min-width: 0; min-height: 0; overflow: auto; }
.catalog-container .catalog { border-right: 0; overflow: visible; }
@media (max-width: 760px) {
  .navigation-layout, .navigation-layout.catalog-collapsed { grid-template-columns: minmax(0, 1fr); }
  .catalog-sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
  .catalog-toggle, .catalog-collapsed .catalog-toggle { place-items: center; width: 100%; height: 44px; margin: 0; padding: 0; }
  .catalog-toggle span { transform: rotate(90deg); }
}

.work-area { overflow: auto; min-width: 0; padding: 1.5rem; background: var(--canvas); scroll-padding-block: 1rem; }
.app-message { margin: 1rem; }
.mapping-notice { margin: 0 0 1rem; }
.preset-guidance { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .6rem; margin-bottom: .65rem; color: var(--muted); font-size: .75rem; }
.preset-guidance button { padding: .2rem .4rem; font-size: inherit; }
.preset-panel p { margin: 0; }
.preset-panel { display: grid; gap: 1rem; font-size: .875rem; }
.preset-intro { display: grid; gap: .3rem; }
.preset-layout { display: grid; grid-template-columns: minmax(0, 12rem) minmax(0, 1fr); gap: .85rem; align-items: start; }
.preset-picker, .preset-detail, .preset-empty { min-width: 0; border: 1px solid var(--line); border-radius: .7rem; background: var(--surface); }
.preset-picker { padding: .6rem; }
.preset-list { display: grid; gap: .2rem; max-height: min(45vh, 25rem); overflow: auto; list-style: none; margin: 0; padding: .2rem; }
.preset-list button { display: flex; align-items: center; gap: .5rem; width: 100%; min-height: 2.5rem; padding: .45rem .55rem; text-align: left; }
.preset-list [aria-current="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 650; }
.preset-dot { width: .65rem; height: .65rem; flex: none; border: 1px solid #0003; border-radius: 50%; }
.preset-item-name { min-width: 0; overflow-wrap: anywhere; }
.preset-list small { margin-inline-start: auto; color: var(--muted); }
.preset-create { display: grid; gap: .35rem; padding: .25rem; }
.preset-list + .preset-create { margin-top: .55rem; padding-top: .65rem; border-top: 1px solid var(--line); }
.preset-create label { font-weight: 600; }
.preset-create > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .35rem; }
.preset-create input { width: 100%; min-width: 0; }
.preset-detail-header { display: flex; align-items: center; gap: .6rem 1rem; flex-wrap: wrap; padding: .9rem 1rem; border-bottom: 1px solid var(--line); }
.preset-panel h4 { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
.preset-detail-header h4 { flex-basis: 100%; font-size: 1.15rem; }
.preset-color-field, .preset-active-field { display: inline-flex; align-items: center; gap: .45rem; cursor: pointer; }
.preset-color-field input[type="color"] { width: 2rem; height: 1.55rem; padding: .15rem; cursor: pointer; }
.preset-active-field input { margin: 0; accent-color: var(--accent); }
.preset-detail-footer { padding: .55rem 1rem; border-top: 1px solid var(--line); }
.preset-delete.secondary { color: var(--error, #a13336); }
.preset-delete-confirmation { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; }
.preset-delete-confirmation p { flex: 1 1 10rem; }
.preset-empty { display: grid; gap: .3rem; padding: 1rem; }
.endpoint-dialog { width: min(30rem, calc(100% - 2rem)); padding: 1.25rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--surface); color: inherit; box-shadow: 0 1rem 3rem #202b2733; }
.endpoint-dialog::backdrop { background: #202b2766; }
.endpoint-dialog h3 { margin: 0 0 1rem; }
.endpoint-dialog form, .dialog-field { display: grid; gap: .65rem; }
.dialog-field input { width: 100%; min-width: 0; }
.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; margin-top: .35rem; }
.external-api-label { color: var(--accent); font-weight: 650; }
.view-navigation { display: flex; flex-wrap: wrap; gap: .35rem; }
.view-navigation [aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.settings-icon.secondary { display: grid; flex: none; place-items: center; width: 2rem; height: 2rem; padding: 0; font-size: 1.2rem; line-height: 1; }
.settings-backdrop { position: fixed; inset: 0; z-index: 3; background: #202b274d; }
.settings {
  position: fixed;
  z-index: 4;
  inset: var(--app-gutter) var(--app-gutter) var(--app-gutter) auto;
  width: min(28rem, calc(100% - 2 * var(--app-gutter)));
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: .75rem;
  box-shadow: -.5rem 0 1.5rem #202b2729;
  overscroll-behavior: contain;
}
.settings-sections { display: flex; flex-basis: 100%; gap: .4rem; margin-top: .65rem; }
.settings-sections [aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
.settings { padding-top: 0; }
.settings-header { position: sticky; top: 0; z-index: 3; padding: 1rem 0; background: var(--canvas); display: flex; justify-content: space-between; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: 1rem; border-bottom: 1px solid var(--line); }
.settings h2 { margin: 0; }
.settings h3 { margin: 0; font-size: 1rem; }
.settings-presets { width: min(46rem, calc(100% - 2 * var(--app-gutter))); }
@media (max-width: 630px) {
  .settings.settings-presets { padding-inline: .85rem; }
  .preset-layout { grid-template-columns: minmax(0, 1fr); }
  .preset-list { max-height: 9rem; }
  .preset-list button, .preset-create button { min-height: 2.75rem; }
}
.settings-drawer-enter-active, .settings-drawer-leave-active { transition: transform 180ms ease-out; }
.settings-drawer-enter-from, .settings-drawer-leave-to { transform: translateX(calc(100% + var(--app-gutter))); }
@media (prefers-reduced-motion: reduce) {
  .settings-drawer-enter-active, .settings-drawer-leave-active { transition: none; }
}
.scenario-edit-context { display: grid; gap: .6rem; padding: .8rem; margin-bottom: 1rem; border: 1px solid #b4cdc0; border-radius: .6rem; background: var(--accent-soft); font-size: .8rem; }
.scenario-edit-context > div { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; }
.scenario-edit-context summary { cursor: pointer; }
.scenario-edit-context ol { margin: .4rem 0 0; padding-left: 1.4rem; }
.scenario-edit-context li button { padding: .25rem; text-align: left; }
.scenario-edit-context [aria-current] { font-weight: 700; text-decoration: underline; }
.save-state { padding: .2rem .4rem; border-radius: .3rem; background: var(--surface); }.save-state.dirty { background: #fff0cc; color: #755018; }
.chain-header { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .55rem; margin-bottom: .5rem; }
.breadcrumbs { min-width: 0; }
.breadcrumbs ol { display: flex; flex-wrap: wrap; gap: .25rem; list-style: none; padding: 0; margin: 0; }
.save-scenario.secondary { padding: .25rem .5rem; font-size: .82rem; }
.breadcrumbs li { display: flex; align-items: baseline; gap: .25rem; min-width: 0; font-size: .82rem; overflow-wrap: anywhere; }
.breadcrumbs button { padding: .3rem .45rem; color: var(--accent); text-align: left; overflow-wrap: anywhere; }
.breadcrumbs [aria-current] { padding: .3rem .45rem; font-weight: 650; }
.separator { color: var(--muted); }
.endpoint-header { position: relative; display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem .65rem; margin-bottom: .65rem; overflow-wrap: anywhere; }
.endpoint-header h2 { margin: 0; font-size: 1.2rem; letter-spacing: -.035em; }
.endpoint-route { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; color: var(--muted); font-size: .85rem; }
.endpoint-header p { margin: .5rem 0; font-size: .8rem; }
.endpoint-help { margin-left: auto; font-size: .75rem; }
.endpoint-help summary { cursor: pointer; padding: .25rem .4rem; }
.endpoint-help-content { position: absolute; top: 100%; right: 0; z-index: 8; width: min(30rem, 100%); padding: .75rem; background: var(--surface); border: 1px solid var(--line); border-radius: .5rem; box-shadow: 0 5px 20px #20352c20; }
.endpoint-help-content .preset-guidance { margin-block: .65rem; }
.muted { color: var(--muted); }
.error { color: #8f2225; }
button, input, select, textarea { font: inherit; color: inherit; }
button { border: 0; border-radius: .45rem; background: transparent; cursor: pointer; }
button:hover { background: var(--accent-soft); }
button:disabled { cursor: default; opacity: .65; }
:focus-visible { outline: 2px solid #257f67; outline-offset: 2px; }
input:not([type="checkbox"]), select, textarea {
  padding: .5rem .6rem;
  background: var(--surface);
  border: 1px solid #a2b2a9;
  border-radius: .4rem;
}
.primary { padding: .5rem .85rem; background: var(--accent); color: #fff; font-weight: 650; }
.primary:hover { background: #104737; }
.secondary { padding: .35rem .55rem; border: 1px solid var(--line); background: var(--surface); }
.method {
  display: inline-block;
  padding: .18rem .35rem;
  border-radius: .35rem;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: .72rem;
  font-weight: 800;
}
.method[data-method="POST"] { background: #e5effa; color: #18507d; }
.method[data-method="PUT"], .method[data-method="PATCH"] { background: #f9efd9; color: #755018; }
.method[data-method="DELETE"] { background: #ffe3e2; color: #8f2225; }
@media (max-width: 760px) {
  #app { --app-gutter: .75rem; }
  .hero { display: grid; grid-template-columns: minmax(0, 1fr) 44px; padding: .25rem .5rem .25rem 6rem; gap: 0 .35rem; min-height: 64px; }
  .hero .view-navigation { display: none; }
  .mobile-workspace-view { display: block; grid-column: 1; grid-row: 1; min-width: 0; }
  .mobile-workspace-view select { width: 100%; min-width: 0; min-height: 44px; padding: .25rem; font-size: .8rem; }
  .hero .api-identity { display: contents; }
  .hero .api-info { grid-column: 1; grid-row: 2; text-align: left; position: relative; }
  .hero .api-info > .mobile-api-about { display: inline-flex; min-width: 0; font-size: .7rem; line-height: 1rem; }
  .hero .api-info > .desktop-api-help { display:none; }
  .hero .api-title { display: none; }
  .hero .api-title { justify-content: flex-start; min-height: 0; }
  .hero h1 { font-size: .7rem; line-height: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hero .api-title small { display: none; }
  .hero .settings-icon { grid-column: 2; grid-row: 1 / 3; min-height: 44px; width: 44px; align-self: center; }
  .brand-stamp { top: .8rem; left: .5rem; }

  .app { height: auto; min-height: calc(100dvh - 2 * var(--app-gutter)); }
  .layout { grid-template-columns: minmax(0, 1fr); }
  .layout > .catalog { grid-column: 1 / -1; }
  .work-area { overflow: visible; padding: 1rem; }
  .settings { overflow: auto; }
}
</style>

<style>
.authorize-icon { display: none; }
@media (max-width: 760px) {
  .hero { grid-template-columns: minmax(0, 1fr) 44px 44px; }
  .hero .settings-icon { grid-column: 3; }
  .hero .authorize-button { position: relative; grid-column: 2; grid-row: 1 / 3; width: 44px; height: 44px; padding: 9px; align-self: center; }
  .authorize-label { display: none; }
  .authorize-icon { display: block; width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.7; }
  .authorize-button[data-configured="true"]::after { content: ''; position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
}
</style>
