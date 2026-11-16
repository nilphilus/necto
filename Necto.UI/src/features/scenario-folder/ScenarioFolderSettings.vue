<script setup>
import FolderLibrary from './FolderLibrary.vue'
import FolderFeedback from './FolderFeedback.vue'
defineProps({folder:Object})
async function importFile(folder,event){const file=event.target.files?.[0];event.target.value='';if(file)await folder.importFile(file)}
</script>
<template>
 <section v-if="folder" class="scenario-folder" aria-label="Scenario folder">
  <h3>Scenario folder</h3><p>Choose your team's local Git checkout. Definitions are stored as individual JSON files in <code>necto-scenarios/</code>. Use Git outside Necto to share changes.</p>
  <p v-if="!folder.supported">Local folder access is unavailable in this browser. Import or download team files instead; desktop Chrome and Edge support directory access on HTTPS or localhost.</p>
  <p v-if="folder.connected"><strong>{{folder.name}} / necto-scenarios</strong><small>{{folder.remembered?'Folder preference saved for this API in this browser.':'Connected for this session.'}}</small></p>
  <div class="folder-actions"><button v-if="folder.supported" type="button" class="secondary" :disabled="folder.pending" @click="folder.choose">{{folder.connected?'Change folder':'Choose folder'}}</button><button v-if="folder.connected" type="button" class="secondary" :disabled="folder.pending" @click="folder.disconnect">Disconnect folder</button></div>
  <FolderLibrary :folder="folder" />
  <label>Import team scenario file<input type="file" accept=".json,application/json" :disabled="folder.pending||folder.restoring" @change="importFile(folder,$event)"></label>
  <p class="sharing-note">Only definitions are shared. Authorize credentials and run results are excluded. Known sensitive fields in structured data are removed; review free text and business data before committing files.</p>
  <FolderFeedback :folder="folder" />
 </section>
</template>
<style scoped>.scenario-folder { border-top:1px solid var(--line); padding-top:1rem; min-width:0; }.scenario-folder:first-child { border-top:0; padding-top:0; }.scenario-folder h3 { margin:0; }.scenario-folder p { font-size:.8rem; line-height:1.5; color:var(--muted); }.scenario-folder small { display:block; font-size:.7rem; margin-top:.25rem; }.folder-actions { display:flex; flex-wrap:wrap; gap:.4rem; font-size:.8rem; }label { display:grid; gap:.4rem; font-size:.8rem; }input { max-width:100%; }.scenario-folder .sharing-note { font-size:.7rem; }</style>
