<script setup>
defineProps({folder:Object})
</script>
<template>
 <details class="folder-library" v-if="folder?.connected">
  <summary>Folder scenarios ({{folder.entries.length}})</summary>
  <p>After git pull, reload the folder. Import updates the saved browser definition and keeps unsaved drafts.</p>
  <button type="button" class="secondary" :disabled="folder.pending||folder.restoring" @click="folder.reload">{{folder.ready?'Reload folder':'Reconnect folder'}}</button>
  <ul v-if="folder.entries.length"><li v-for="entry in folder.entries" :key="entry.name"><div><strong>{{entry.scenario.name}}</strong><small>{{entry.kind==='builder'?'Builder':'Quick chain'}} · {{entry.scenario.steps.length}} steps</small><code :title="entry.name">{{entry.name}}</code></div><button type="button" class="secondary" :disabled="folder.pending||folder.restoring" :aria-label="'Import '+entry.scenario.name+' from folder'" @click="folder.importEntry(entry)">Import</button></li></ul>
  <p v-else-if="!folder.ready">Reconnect the folder to read its scenarios.</p>
  <p v-else>No shared scenarios found. Put files ending in .necto.json directly in {{folder.path}}, then reload.</p>
 </details>
</template>
<style scoped>
.folder-library { font-size:.8rem; margin:.65rem 0; border:1px solid var(--line); border-radius:.45rem; padding:.65rem; min-width:0; }summary { cursor:pointer; font-weight:600; }p { color:var(--muted); font-size:.73rem; line-height:1.5; }ul { list-style:none; padding:0; margin:.5rem 0 0; }li { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.5rem 0; }li+li { border-top:1px solid var(--line); }li div { flex:1; min-width:0; }strong,small,code { display:block; overflow-wrap:anywhere; }code { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }small,code { color:var(--muted); font-size:.68rem; margin-top:.2rem; }
</style>
