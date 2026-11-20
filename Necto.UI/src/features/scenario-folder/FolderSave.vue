<script setup>
defineProps({folder:Object,kind:String,scenario:Object,disabled:Boolean})
defineEmits(['configure'])
</script>
<template><span v-if="folder" class="folder-save"><button v-if="folder.supported" type="button" class="secondary" :disabled="disabled||folder.pending||folder.restoring" @click="folder.connected?folder.save(kind,scenario):$emit('configure')">{{folder.connected?'Save to folder':'Choose scenario folder…'}}</button><button type="button" class="secondary" :disabled="disabled||folder.pending||folder.restoring" @click="folder.download(kind,scenario)">Export</button></span></template>
<style scoped>.folder-save { display:inline-flex; flex-wrap:wrap; gap:.35rem; font-size:.75rem; }</style>
