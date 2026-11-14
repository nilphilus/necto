<script setup>
import { computed, ref } from 'vue';
import { diffValues } from './history.js';
import { requestFromHistory, restoreHistoryDraft } from './historySnapshot.js';
import { requestSnippet } from './snippets.js';
const props = defineProps({
  history: Object,
  operation: Object,
  session: Object
});
const emit = defineEmits(['restored']);
const entries = computed(
  () => props.history?.forOperation(props.operation.key) ?? []
);
const before = ref(''),
  after = ref(''),
  feedback = ref('');
const comparable = computed(() =>
  entries.value.filter((entry) => entry.payload !== undefined)
);
const changes = computed(() => {
  const a =
    comparable.value.find((entry) => entry.id === before.value) ??
    comparable.value[1];
  const b =
    comparable.value.find((entry) => entry.id === after.value) ??
    comparable.value[0];
  return a && b ? diffValues(a.payload, b.payload) : null;
});
const label = (entry) =>
  `${new Date(entry.at).toLocaleTimeString()} · ${entry.status ?? 'No response'} · ${entry.elapsed ?? '—'} ms`;
function restore(entry) {
  if (props.session.pending) return;
  restoreHistoryDraft(props.session, entry.snapshot);
  emit('restored');
}
async function copy(entry) {
  try {
    await navigator.clipboard.writeText(
      requestSnippet(requestFromHistory(entry.snapshot))
    );
    feedback.value = 'Copied the sent request with credentials masked.';
  } catch {
    feedback.value = 'Clipboard unavailable.';
  }
}
</script>
<template>
  <div class="history-panel">
    <p>
      Up to 20 requests in memory. Restoring fills a draft without sending;
      current presets and authentication still apply. Re-enter secrets and
      attach files again.
    </p>
    <button
      type="button"
      :disabled="!entries.length"
      @click="history.clearOperation(operation.key)"
    >
      Clear this endpoint’s history
    </button>
    <details v-for="entry in entries" :key="entry.id">
      <summary>{{ label(entry) }}</summary>
      <p v-if="entry.error" class="error">{{ entry.error }}</p>
      <div class="actions">
        <button
          type="button"
          :disabled="!entry.snapshot?.draft || session.pending"
          @click="restore(entry)"
        >
          Restore draft inputs</button
        ><button type="button" :disabled="!entry.snapshot" @click="copy(entry)">
          Copy sent request as cURL
        </button>
      </div>
      <p v-if="entry.omitted">
        Body and replay omitted to keep history within its memory limits.
      </p>
      <pre v-else>{{ JSON.stringify(entry.payload, null, 2) }}</pre>
    </details>
    <details v-if="comparable.length > 1" open>
      <summary>Compare responses</summary>
      <div class="choices">
        <label
          >Before<select v-model="before">
            <option value="">Previous retained response</option>
            <option
              v-for="entry in comparable"
              :key="entry.id"
              :value="entry.id"
            >
              {{ label(entry) }}
            </option>
          </select></label
        ><label
          >After<select v-model="after">
            <option value="">Latest retained response</option>
            <option
              v-for="entry in comparable"
              :key="entry.id"
              :value="entry.id"
            >
              {{ label(entry) }}
            </option>
          </select></label
        >
      </div>
      <table v-if="changes">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="change in changes.changes" :key="change.path">
            <td>
              <code>{{ change.path }}</code>
            </td>
            <td>{{ change.before }}</td>
            <td>{{ change.after }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!changes?.changes.length">
        No differences in the retained preview.
      </p>
      <p v-if="changes?.limited">Diff truncated at the preview limit.</p>
    </details>
    <p v-if="!entries.length">No requests yet.</p>
    <p v-if="feedback" role="status">{{ feedback }}</p>
  </div>
</template>
<style scoped>
.history-panel p {
  font-size: 0.8rem;
  color: var(--muted);
}
details {
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--line);
}
summary {
  cursor: pointer;
  font-size: 0.85rem;
}
.actions,
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.6rem 0;
}
label {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
  flex: 1;
}
select {
  max-width: 100%;
}
pre {
  max-height: 30dvh;
  overflow: auto;
  font-size: 0.8rem;
  background: var(--subtle);
  padding: 0.6rem;
}
table {
  width: 100%;
  font-size: 0.8rem;
  border-collapse: collapse;
  table-layout: fixed;
}
th,
td {
  text-align: left;
  vertical-align: top;
  padding: 0.4rem;
  overflow-wrap: anywhere;
  border-bottom: 1px solid var(--line);
}
</style>
