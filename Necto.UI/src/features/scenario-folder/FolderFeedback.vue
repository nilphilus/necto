<script setup>
defineProps({folder:Object})
</script>
<template><div v-if="folder" class="folder-feedback"><p v-if="folder.error" role="alert" class="error">{{folder.error}}</p><p v-if="folder.notice" role="status">{{folder.notice}}</p><p v-if="folder.pending||folder.restoring" role="status">{{folder.restoring?'Restoring folder connection…':'Working with scenario files…'}}</p></div></template>
<style scoped>.folder-feedback { font-size:.75rem; min-width:0; }.folder-feedback p { margin:.4rem 0; line-height:1.5; overflow-wrap:anywhere; }.folder-feedback p:not(.error) { color:var(--muted); }</style>
