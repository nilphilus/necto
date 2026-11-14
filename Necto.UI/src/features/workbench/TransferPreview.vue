<script setup>
import { notifyWorkspaceImport } from './workspaceUpdates.js';
import { ref, watch } from 'vue';
import { planTransfer, applyTransfer } from './transfers.js';
const props = defineProps({ workspace: Object });
const emit = defineEmits(['applied']);
const items = ref([]),
  error = ref('');
watch(
  () => props.workspace,
  (workspace) => {
    try {
      items.value = planTransfer(workspace, localStorage);
      error.value = '';
    } catch (cause) {
      error.value = cause.message;
    }
  },
  { immediate: true }
);
function apply() {
  try {
    const changed = applyTransfer(items.value, localStorage);
    notifyWorkspaceImport(items.value.filter(item => item.action !== 'keep').map(item => item.key));
    emit('applied', changed.length);
  } catch (cause) {
    error.value = cause.message;
  }
}
</script>
<template>
  <section aria-label="Import preview">
    <p>
      {{ items.length }} items ·
      {{ items.filter((item) => item.conflict).length }} conflicts. Existing
      items are kept unless you choose otherwise.
    </p>
    <div v-for="(item, index) in items" :key="index" class="transfer-item">
      <label
        ><strong>{{ item.label }}</strong
        ><small
          >API document: {{ item.key.split(':').slice(2).join(':') }}</small
        ><small v-if="item.conflict">Existing: {{ item.existingLabel }}</small
        ><small>{{ item.kind === 'environments' ? 'Preset' : item.kind }}</small
        ><select
          v-model="item.action"
          :aria-label="`Import action for ${item.label}`"
        >
          <option value="keep">
            {{ item.conflict ? 'Keep existing' : 'Skip' }}
          </option>
          <option v-if="!item.conflict" value="add">Add item</option>
          <option v-if="item.conflict" value="replace">
            Replace this item
          </option>
          <option
            v-if="['scenarios', 'samples', 'environments'].includes(item.kind)"
            value="copy"
          >
            Import as a copy
          </option>
        </select></label
      >
    </div>
    <button
      type="button"
      :disabled="!!error || !items.some((item) => item.action !== 'keep')"
      @click="apply"
    >
      Import selected items
    </button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.transfer-item {
  padding: 0.6rem 0;
  border-top: 1px solid var(--line);
}
label {
  display: grid;
  gap: 0.3rem;
}
small {
  color: var(--muted);
}
select {
  max-width: 100%;
}
</style>
