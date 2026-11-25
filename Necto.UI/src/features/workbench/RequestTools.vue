<script setup>
import { exampleDrafts } from './openapiExamples.js'
import { applyContractExample } from './contractExample.js'
import HistoryPanel from './HistoryPanel.vue'
import ContractPanel from './ContractPanel.vue'
import { computed, ref, useId, nextTick, watch } from 'vue'


import MarkdownText from './MarkdownText.vue'
import { buildRequest } from '../request-runner/request.js'
import { requestSnippet } from './snippets.js'
import ResponseChecksEditor from './ResponseChecksEditor.vue'
const props = defineProps({
  operation: Object,
  session: Object,
  values: Map,
  configuration: Object,
  history: Object,
  hideTrigger: Boolean,
  prepare: Function
})
const emit = defineEmits(['closed', 'edit-request', 'capture-requests', 'inspect-openapi'])
const closeTarget = ref(null)
function restoreFocus() { const target = closeTarget.value?.isConnected ? closeTarget.value : trigger.value; closeTarget.value = null; target?.focus(); emit('closed', target) }
const requestedSection = ref('Checks')
function openSection(section) {
  requestedSection.value = section
  tab.value = ['Checks', 'Server', 'Options'].includes(section) ? 'Configure' : section
  if (tab.value === 'Bindings' && !props.session.bindings?.length) tab.value = 'Contract'
  dialog.value.showModal()
}
const optionsMessage = ref('')
async function revealInvalid(element) {
  if (!element?.isConnected) return
  const group = ['Checks', 'Server', 'Options'].find(name => document.getElementById(sectionId(name))?.contains(element))
  requestedSection.value = group ?? 'Options'
  tab.value = 'Configure'
  optionsMessage.value = element.validationMessage || 'Check request settings.'
  if (!dialog.value.open) dialog.value.showModal()
  await nextTick()
  element.focus()
}
function validateOption(event) { optionsMessage.value = event.target.validity?.valid ? '' : event.target.validationMessage }
defineExpose({ openSection, revealInvalid })
const toolsId = useId()
const trigger = ref(null)
const sectionId = name => toolsId + '-' + name.toLowerCase()
const sections = computed(() => ['Contract', 'Code', 'History', 'Configure', ...(props.session.bindings?.length ? ['Bindings'] : [])])
watch(() => props.session.bindings?.length, length => { if (!length && tab.value === 'Bindings') tab.value = 'Contract' })

const dialog = ref(null),
  tab = ref('Contract'),
  language = ref('curl'),
  error = ref(''),
  copied = ref(false),
  codeSource = ref('draft')
const snippet = computed(() => {
  try {
    return { code: requestSnippet(
      codeSource.value === 'sent' && props.session.result?.sentRequest
        ? props.session.result.sentRequest
        : props.prepare
        ? props.prepare(props.operation, props.session, props.values)
        : buildRequest(
            props.operation,
            props.configuration ?? {},
            props.session,
            props.values
          ),
      language.value
    ), error: '' }
  } catch (cause) {
    return { code: '', error: cause.message }
  }
})
watch(() => props.operation.key, () => dialog.value?.close())
watch([snippet, language], () => { copied.value = false; error.value = '' })
async function fixInputs() {
  const runner = dialog.value.closest('.runner')
  emit('edit-request')
  await nextTick()
  closeTarget.value = runner?.querySelector('input:invalid, textarea:invalid, textarea, input:not([readonly]):not([type=checkbox])')
  dialog.value.close()
}

async function useExample(example) {
  try {
    applyContractExample(props.session, props.operation, example)
    exampleDrafts.delete(props.session)
    emit('edit-request')
    await nextTick()
    closeTarget.value = dialog.value.closest('.runner')?.querySelector('textarea')
    dialog.value.close()
  } catch(cause) { error.value = cause.message }
}
async function copy() {
  if (snippet.value.error) return
  try {
    await navigator.clipboard.writeText(snippet.value.code)
    copied.value = true
  } catch {
    error.value = 'Clipboard unavailable. Select and copy the code below.'
  }
}
function selectServer(event) {
  props.session.serverIndex = Number(event.target.value)
  props.session.serverValues = Object.fromEntries(
    Object.entries(
      props.operation.servers?.[props.session.serverIndex]?.variables ?? {}
    ).map(([name, variable]) => [name, variable.default ?? ''])
  )
  props.session.resultStale = Boolean(props.session.result)
}
function useServer() {
  const server = props.operation.servers?.[props.session.serverIndex]
  if (server && props.configuration) {
    props.configuration.serverProfiles ??= {}
    props.configuration.serverProfiles[props.operation.apiId ?? 'local'] = {
      ...server,
      values: { ...props.session.serverValues }
    }
    props.session.serverIndex = -1
  }
}
function resetServer() {
  if (props.configuration?.serverProfiles)
    delete props.configuration.serverProfiles[props.operation.apiId ?? 'local']
}

</script>
<template>
  <button v-if="!hideTrigger" ref="trigger" type="button" class="secondary" aria-haspopup="dialog" :aria-controls="toolsId" @click="dialog.showModal()">Tools</button>
  <dialog class="request-tools-dialog" :id="toolsId" ref="dialog" :aria-label="`Request tools: ${operation.method} ${operation.path}`" @close="restoreFocus" @click="$event.target === dialog && dialog.close()">

    <div class="tools-heading"><header>

      <strong>{{ operation.method }} {{ operation.path }}</strong
      ><button
        type="button"
        aria-label="Close request tools"
        @click="dialog.close()"
      >
        ✕
      </button>
    </header>
    <label class="tool-picker">Tool<select v-model="tab" aria-label="Change request tool"><option v-for="section in sections" :key="section" :value="section">{{ section === 'Configure' ? 'Configure request' : section }}</option></select></label>
    </div>
    <section v-if="tab === 'Contract'" :id="sectionId('Contract')" role="region" aria-label="Contract" tabindex="0">

      <h3>{{ operation.summary || operation.name }}</h3>
      <button type="button" class="secondary" @click="emit('inspect-openapi', $event.currentTarget)">Inspect in OpenAPI</button>
      <MarkdownText :text="operation.description" />
      <ContractPanel :operation="operation" :session="session" @use-example="useExample" /><p v-if="error" role="alert" class="error">{{ error }}</p>
    </section>
    <section v-if="tab === 'Code'" :id="sectionId('Code')" role="region" aria-label="Code" tabindex="0">
      <label v-if="session.result?.sentRequest">Request source<select v-model="codeSource"><option value="draft">Current draft</option><option value="sent">Request sent for this response</option></select></label>

      <label
        >Language
        <select v-model="language">
          <option value="curl">cURL</option>
          <option value="fetch">JavaScript fetch</option>
          <option value="csharp">C# HttpClient</option>
        </select></label
      ><button type="button" :disabled="!!snippet.error" @click="copy">
        {{ copied ? 'Copied' : 'Copy code' }}
      </button>
      <p>
        Credentials are masked. Review body and URL values before sharing.
        Uploads use file placeholders.
      </p>
      <div v-if="snippet.error" class="error" role="alert"><p>{{ snippet.error }}</p><button type="button" @click="fixInputs">Fix request inputs</button></div>
      <pre v-else tabindex="0">{{ snippet.code }}</pre>
    </section>
    <section v-if="tab === 'Bindings'" :id="sectionId('Bindings')" role="region" aria-label="Bindings" tabindex="0">
      <p>
        Scenario bindings normally use the selected array index. Match an object
        by a field to keep the scenario stable when the array order changes. A
        rule must match exactly one object.
      </p>
      <div v-for="(binding, index) in session.bindings" :key="index">
        <p>Step {{ binding.sourceStep + 1 }} → {{ binding.name ?? 'body' }}</p>
        <label v-if="binding.path.some((part) => typeof part === 'number')"
          ><input
            type="checkbox"
            :checked="!!binding.selector"
            @change="
              binding.selector = $event.target.checked
                ? {
                    arrayPath: binding.path.slice(
                      0,
                      binding.path.findIndex((part) => typeof part === 'number')
                    ),
                    field: '/id',
                    expected: '42'
                  }
                : undefined
            "
          />
          Find object by condition</label
        ><template v-if="binding.selector"
          ><input
            v-model="binding.selector.field"
            aria-label="Match field JSON Pointer"
            placeholder="/reference" /><input
            v-model="binding.selector.expected"
            aria-label="Match JSON value"
            placeholder='"INV-42"'
        /></template>
      </div>
      <p v-if="!session.bindings?.length">
        Select a mapped value from a response to create a binding.
      </p>
    </section>
    <details v-if="tab === 'Configure'" :id="sectionId('Checks')" :open="requestedSection === 'Checks'" class="configure-group"><summary>Response checks</summary>
      <ResponseChecksEditor :session="session" />
    </details>
    <details v-if="tab === 'Configure'" :id="sectionId('Server')" :open="requestedSection === 'Server'" class="configure-group"><summary>API server</summary>
      <p>
        Choose for this request, or save as the default for this API.
        Credentials stay scoped to the origins approved in Authorize.
      </p>
      <label
        >API server<select
          :value="session.serverIndex ?? -1"
          @change="selectServer"
        >
          <option :value="-1">Configured default</option>
          <option
            v-for="(server, index) in operation.servers"
            :key="index"
            :value="index"
          >
            {{ server.description || server.url }}
          </option>
        </select></label
      >
      <label
        v-for="(variable, name) in operation.servers?.[session.serverIndex]
          ?.variables"
        :key="name"
        >{{ name
        }}<select v-if="variable.enum" v-model="session.serverValues[name]">
          <option v-for="value in variable.enum" :key="value">
            {{ value }}
          </option></select
        ><input
          v-else
          v-model="session.serverValues[name]"
          :placeholder="variable.default"
      /></label>
      <button
        type="button"
        :disabled="!(session.serverIndex >= 0)"
        @click="useServer"
      >
        Use for this API</button
      ><button type="button" @click="resetServer">Restore API default</button>
      <pre>{{
        configuration?.serverProfiles?.[operation.apiId ?? 'local']?.url ||
        operation.server?.url ||
        configuration?.apiBaseUrl
      }}</pre>
    </details>
    <details v-if="tab === 'Configure'" :id="sectionId('Options')" :open="requestedSection === 'Options'" class="configure-group" @input="validateOption"><summary>Timeout and response budget</summary>
      <p v-if="optionsMessage" role="alert" class="error">{{ optionsMessage }}</p>
      <label>Response budget (MiB)<input v-model.number="session.responseLimitMiB" type="number" min="1" max="512" step="1" required placeholder="32" /></label><p>Text and JSON reception stops at this budget, including responses without Content-Length. Raising it can use substantially more memory during parsing. No automatic retry. Binary downloads and bounded SSE/NDJSON streams have separate handling.</p>
      <label
        >Timeout (milliseconds)<input
          v-model.number="session.timeout"
          type="number"
          min="1"
          max="600000" required step="1"
      /></label>
      <p>Cancel is available beside Send while a request is running.</p>
    </details>
    <section v-if="tab === 'History'" :id="sectionId('History')" role="region" aria-label="History" tabindex="0">
      <HistoryPanel :history="history" :operation="operation" :session="session" @restored="fixInputs" @capture="entries => { dialog.close(); emit('capture-requests', entries) }" />

    </section>
    <p v-if="error" role="alert">{{ error }}</p>
  </dialog>
</template>
<style scoped>
.configure-group .error { color:#a12626; font-weight:600; }
.configure-group input:invalid { border-color:#a12626; }
.tool-picker { display:flex; align-items:center; gap:.5rem; margin:.5rem 0; font-size:.85rem; }
.tool-picker select { flex:1; min-width:0; }
.configure-group { padding:.6rem 0; border-bottom:1px solid var(--line); }
.configure-group > summary { cursor:pointer; font-weight:600; }
.mobile-tool-select {display:none}
:global(body:has(.request-tools-dialog[open])) {overflow:hidden}
.request-tools-dialog {overscroll-behavior:contain}

dialog {
  width: min(54rem, 94vw);
  max-height: 85dvh;
  border: 1px solid var(--line);
  border-radius: 0.7rem;
  padding: 1rem;
  background: var(--surface);
  color: var(--text);
}
dialog::backdrop {
  background: #0006;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
header strong {
  overflow-wrap: anywhere;
}
nav {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin: 0.75rem 0;
}
nav [aria-selected='true'] {
  background: var(--accent-soft);
  color: var(--accent);
}
section {
  max-height: 65dvh;
  overflow: auto;
}
pre {
  max-height: 45dvh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--subtle);
  padding: 0.75rem;
  font-size: 0.8rem;
}
.check {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin: 0.5rem 0;
}
.check input {
  min-width: 6rem;
  flex: 1;
}
details {
  padding: 0.5rem 0;
}
summary {
  cursor: pointer;
}
p {
  font-size: 0.85rem;
  color: var(--muted);
}
@media(max-width:600px) {
 .request-tools-dialog {position:fixed;inset:auto 0 0;width:100%;max-width:100%;margin:0;max-height:calc(100dvh - .75rem);padding:.7rem .8rem calc(.8rem + env(safe-area-inset-bottom));border-radius:.8rem .8rem 0 0}
 .tools-heading {position:sticky;top:-.7rem;z-index:2;background:var(--surface);padding:.6rem 0;border-bottom:1px solid var(--line);margin-bottom:.5rem}
 .tools-heading header strong {font-size:.9rem;max-height:3.6rem;overflow:auto;overflow-wrap:anywhere}
 .tools-heading nav {display:none}
 .mobile-tool-select {display:grid;gap:.3rem;font-size:.75rem;margin:.4rem 0}
 .mobile-tool-select select {width:100%;min-height:44px}
 .request-tools-dialog button,.request-tools-dialog input:not([type=checkbox]),.request-tools-dialog select {min-height:44px}
 .request-tools-dialog header button {min-width:44px}
}

</style>
