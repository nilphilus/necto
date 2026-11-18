<script setup>
import { ref, shallowRef } from 'vue'

const props = defineProps({ scenarios: Array, save: Function })
const dialog = ref(null)
const capture = shallowRef(null)
const id = ref('')
const name = ref('')
const error = ref('')
const status = ref('')

function show(operation, entries, workspace) {
  capture.value = { operation, entries, workspace }
  id.value = ''
  name.value = operation.name.slice(0, 200)
  error.value = ''
  status.value = ''
  dialog.value.showModal()
}
function submit() {
  try {
    props.save({ ...capture.value, id: id.value, name: name.value })
    const destination = props.scenarios.find((scenario) => scenario.id === id.value)?.name ?? name.value.trim()
    status.value = `Added to “${destination}”. Open it from Scenarios.`
    dialog.value.close()
  } catch (cause) {
    error.value = cause.message
  }
}
defineExpose({ show })
</script>

<template>
  <p v-if="status" class="capture-status" role="status">{{ status }}</p>
  <dialog ref="dialog" aria-label="Add to scenario" class="capture-dialog">
    <form v-if="capture" @submit.prevent="submit">
      <h3>Add to scenario</h3>
      <p>{{ capture.entries.length }} × <code>{{ capture.operation.method }} {{ capture.operation.path }}</code></p>
      <label>Scenario
        <select v-model="id" aria-label="Scenario">
          <option value="">New Builder scenario</option>
          <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario.id">{{ scenario.name }}</option>
        </select>
      </label>
      <label v-if="!id">Scenario name
        <input v-model="name" required maxlength="200">
      </label>
      <small>Review saved inputs before sharing. Re-enter credentials and attach files when needed.</small>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="submit" class="primary">Add requests</button>
        <button type="button" class="secondary" @click="dialog.close()">Cancel</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.capture-status { font-size: .8rem; padding: .35rem .6rem; margin: 0; }
.capture-dialog {
  width: min(28rem, 94vw);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: .6rem;
  padding: .9rem;
  overflow-wrap: anywhere;
}
.capture-dialog::backdrop { background: #0006; }
form, label { display: grid; gap: .4rem; }
form { gap: .65rem; }
h3, p { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: .4rem; }
</style>
