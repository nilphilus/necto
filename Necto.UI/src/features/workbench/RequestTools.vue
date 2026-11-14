<script setup>
import SchemaTree from './SchemaTree.vue'
import { diffValues } from './history.js'
import { computed, ref, nextTick, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { buildRequest } from '../request-runner/request.js'
import { requestSnippet } from './snippets.js'
import { assertionKinds } from './assertions.js'
const props = defineProps({
  operation: Object,
  session: Object,
  values: Map,
  configuration: Object,
  history: Object,
  prepare: Function
})
const changes = computed(() => {
  const entries = props.history?.forOperation(props.operation.key) ?? []
  return entries.length > 1 &&
    entries[0].payload !== undefined &&
    entries[1].payload !== undefined
    ? diffValues(entries[1].payload, entries[0].payload)
    : null
})
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
const description = computed(() =>
  DOMPurify.sanitize(marked.parse(props.operation.description ?? ''))
)
watch([snippet, language], () => { copied.value = false; error.value = '' })
async function fixInputs() {
  const runner = dialog.value.closest('.runner')
  dialog.value.close()
  await nextTick()
  runner?.querySelector('input:invalid, textarea:invalid, textarea, input:not([readonly]):not([type=checkbox])')?.focus()
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
function addCheck() {
  ;(props.session.assertions ??= []).push({
    kind: 'status',
    path: '',
    expected: '200'
  })
}
</script>
<template>
  <button type="button" class="secondary" @click="dialog.showModal()">
    Tools
  </button>
  <dialog ref="dialog" @click="$event.target === dialog && dialog.close()">
    <header>
      <strong>{{ operation.method }} {{ operation.path }}</strong
      ><button
        type="button"
        aria-label="Close request tools"
        @click="dialog.close()"
      >
        ✕
      </button>
    </header>
    <nav>
      <button
        v-for="item in [
          'Contract',
          'Code',
          'Bindings',
          'Checks',
          'Server',
          'Options',
          'History'
        ]"
        :key="item"
        type="button"
        :aria-pressed="tab === item"
        @click="tab = item"
      >
        {{ item }}
      </button>
    </nav>
    <section v-if="tab === 'Contract'">
      <h3>{{ operation.summary || operation.name }}</h3>
      <div v-html="description" />
      <details v-if="operation.requestBody">
        <summary>Request body contract</summary>
        <SchemaTree
          v-for="(media, name) in operation.requestBody.content"
          :key="name"
          :schema="media.schema"
          :resolve="operation.resolve"
          :name="name"
        />
      </details>
      <details v-for="(response, status) in operation.responses" :key="status">
        <summary>{{ status }} · {{ response.description }}</summary>
        <SchemaTree
          v-for="(media, name) in operation.resolve(response)?.content"
          :key="name"
          :schema="media.schema"
          :resolve="operation.resolve"
          :name="name"
        />
        <pre>{{
          JSON.stringify(operation.resolve(response)?.content, null, 2)
        }}</pre>
      </details>
      <details v-if="operation.parameters?.length">
        <summary>Parameters</summary>
        <pre>{{ JSON.stringify(operation.parameters, null, 2) }}</pre>
      </details>
    </section>
    <section v-if="tab === 'Code'">
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
    <section v-if="tab === 'Bindings'">
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
    <section v-if="tab === 'Checks'">
      <p>
        Checks run after each response. Paths use JSON Pointer, for example
        /lines/0/id.
      </p>
      <div
        v-for="(check, index) in session.assertions"
        :key="index"
        class="check"
      >
        <select v-model="check.kind" aria-label="Check type">
          <option
            v-for="(label, kind) in assertionKinds"
            :value="kind"
            :key="kind"
          >
            {{ label }}
          </option></select
        ><input
          v-if="!['status', 'duration'].includes(check.kind)"
          v-model="check.path"
          placeholder="/field"
          aria-label="JSON Pointer"
        /><input
          v-if="!['exists', 'nonempty'].includes(check.kind)"
          v-model="check.expected"
          placeholder="Expected value"
          aria-label="Expected value"
        /><button type="button" @click="session.assertions.splice(index, 1)">
          Remove
        </button>
      </div>
      <button
        type="button"
        :disabled="session.assertions?.length >= 50"
        @click="addCheck"
      >
        Add check
      </button>
    </section>
    <section v-if="tab === 'Server'">
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
    </section>
    <section v-if="tab === 'Options'">
      <label
        >Timeout (milliseconds)<input
          v-model.number="session.timeout"
          type="number"
          min="1"
          max="600000"
      /></label>
      <p>Cancel is available beside Send while a request is running.</p>
    </section>
    <section v-if="tab === 'History'">
      <p>
        Last 20 requests, kept in memory. Body snapshots and diffs are bounded;
        large bodies are omitted.
      </p>
      <button type="button" @click="history?.clear()">Clear history</button>
      <details
        v-for="entry in history?.forOperation(operation.key)"
        :key="entry.id"
      >
        <summary>
          {{ entry.at }} · {{ entry.status }} · {{ entry.elapsed }} ms
        </summary>
        <p v-if="entry.omitted">
          Body omitted to keep history small. Binary and stream bodies are not
          retained.
        </p>
        <pre v-else>{{ JSON.stringify(entry.payload, null, 2) }}</pre>
      </details>
      <details v-if="changes">
        <summary>Compare last two responses</summary>
        <pre>{{ JSON.stringify(changes, null, 2) }}</pre>
      </details>
      <p v-if="!history?.forOperation(operation.key).length">
        No requests yet.
      </p>
    </section>
    <p v-if="error" role="alert">{{ error }}</p>
  </dialog>
</template>
<style scoped>
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
nav [aria-pressed='true'] {
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
</style>
