<script setup>
defineProps({folder:Object,floating:Boolean})
</script>
<template><div v-if="folder" class="folder-feedback"><p v-if="folder.error" role="alert" class="error">{{folder.error}}</p><p v-if="folder.notice" :class="{ toast: floating }" role="status">{{folder.notice}}</p><p v-if="folder.pending||folder.restoring" role="status">{{folder.restoring?'Restoring folder connection…':'Working with scenario files…'}}</p></div></template>
<style scoped>.folder-feedback { font-size:.75rem; min-width:0; }.folder-feedback p { margin:.4rem 0; line-height:1.5; overflow-wrap:anywhere; }.folder-feedback p:not(.error) { color:var(--muted); }.folder-feedback .toast { position: fixed; z-index: 10; inset: auto 1rem 1rem auto; max-width: min(26rem, calc(100vw - 2rem)); background: var(--surface); border: 1px solid var(--line); border-radius: .45rem; padding: .5rem .75rem; box-shadow: 0 5px 18px #203b2820; }</style>
