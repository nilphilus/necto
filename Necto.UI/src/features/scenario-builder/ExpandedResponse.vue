<script setup>
import { ref } from 'vue'
import ResponsePreview from '../request-runner/ResponsePreview.vue'
defineProps({result:Object,operation:Object,pending:Boolean,stale:Boolean})
const expanded=ref(false),dialog=ref(null),host=ref(null)
function expand(){dialog.value.showModal();expanded.value=true}
</script>
<template>
 <section class="step-response" aria-label="Step response">
  <button type="button" class="secondary expand-response" @click="expand">Expand response</button>
  <Teleport :disabled="!expanded" :to="host??'body'"><ResponsePreview :result="result" :operation="operation" :pending="pending" :stale="stale" /></Teleport>
  <dialog ref="dialog" aria-labelledby="expanded-response-title" @close="expanded=false"><header><div><h3 id="expanded-response-title">Step response</h3><code>{{operation.method}} {{operation.path}}</code></div><button type="button" class="secondary" aria-label="Close expanded response" @click="dialog.close()">Done</button></header><p v-if="stale" class="previous-run">Previous run. Run again to use the updated definition.</p><div ref="host" class="expanded-content" /></dialog>
 </section>
</template>
<style scoped>
.previous-run { margin:.5rem 1rem; font-size:.75rem; color:var(--muted); }.step-response { min-width:0; }.expand-response { font-size:.7rem; margin-bottom:.4rem; }dialog { width:min(90rem,calc(100% - 2rem)); max-height:90dvh; padding:0; overflow:hidden; background:var(--surface); color:inherit; border:1px solid var(--line); border-radius:.7rem; }dialog[open] { display:flex; flex-direction:column; }dialog::backdrop { background:#17342640; }header { flex:none; display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:.8rem 1rem; border-bottom:1px solid var(--line); }h3 { margin:0 0 .25rem; font-size:1rem; }code { font-size:.7rem; overflow-wrap:anywhere; }.expanded-content { flex:1; min-height:0; padding:1rem; overflow:auto; max-height:calc(90dvh - 6rem); min-width:0; }
</style>
