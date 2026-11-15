<script setup>
import { markRaw, onScopeDispose, ref, watch } from 'vue'
import XmlNode from './XmlNode.vue'
const props = defineProps({ text: { type: String, required: true } })
const nodes = ref(null), error = ref(''), pending = ref(false), focus = ref(0)
let worker
function dispose() { worker?.terminate(); worker = undefined }
function stop() { dispose(); pending.value = false; error.value = 'XML preview cancelled. Use Raw or reopen Preview to try again.' }
function parse() {
  dispose(); nodes.value = null; error.value = ''; focus.value = 0; pending.value = true
  try {
    const instance = new Worker(new URL('./xml.worker.js', import.meta.url), { type: 'module' })
    worker = instance
    instance.onmessage = ({ data }) => {
      if (worker !== instance) return
      pending.value = false
      if (data.error) error.value = data.error
      else nodes.value = markRaw(data.nodes)
      dispose()
    }
    instance.onerror = () => { if (worker !== instance) return; error.value = 'Could not build the XML preview. Use Raw or download the original response.'; pending.value = false; dispose() }
    instance.postMessage(props.text)
  } catch { error.value = 'Background XML preview is unavailable. Use Raw or download the original response.'; pending.value = false; dispose() }
}
watch(() => props.text, parse, { immediate: true })
onScopeDispose(dispose)
</script>
<template>
  <div class="xml-preview" aria-label="XML response preview">
    <p v-if="pending" role="status">Preparing XML preview… <button type="button" @click="stop">Cancel preview</button></p>
    <p v-if="error" role="status">{{ error }}</p>
    <template v-if="nodes"><div v-if="focus" class="xml-focus"><span>Focused subtree</span><button type="button" @click="focus = 0">Back to full XML</button></div><div class="xml-tree" tabindex="0"><XmlNode :key="focus" :nodes="nodes" :index="focus" @inspect="focus = $event" /></div></template>
  </div>
</template>
<style scoped>
.xml-preview { min-width: 0; }
.xml-tree { overflow: auto; max-height: var(--preview-height, 32rem); padding: .8rem; border-radius: .45rem; background: #182420; color: #e7f3eb; font: .85rem/1.65 ui-monospace, Consolas, monospace; }
.xml-preview p { font: .8rem system-ui, sans-serif; white-space: normal; overflow-wrap: anywhere; }
.xml-preview button { margin: .2rem; padding: .2rem .4rem; border: 1px solid var(--line, #729b88); }
.xml-focus { display: flex; align-items: center; gap: .5rem; font: .8rem system-ui, sans-serif; }
</style>
