<script setup>
import TracePayload from '../scenarios/TracePayload.vue'
defineProps({request:Object,attempt:Number})
</script>
<template><details class="sent-request"><summary>Sent request<span v-if="attempt>1"> · attempt {{attempt}}</span></summary><p>Captured when sent. Recognized credentials are redacted; unstructured text may contain sensitive values.</p><code>{{request.method}} {{request.url}}</code><details><summary>Request headers</summary><TracePayload :value="request.headers" /></details><TracePayload v-if="request.body!==undefined" :value="request.body" /><p v-else>No request body.</p></details></template>
<style scoped>.sent-request { margin:.5rem 0; font-size:.75rem; }.sent-request > code { display:block; overflow-wrap:anywhere; margin:.4rem 0; }.sent-request p { color:var(--muted); font-size:.68rem; }summary { cursor:pointer; }details details { margin:.5rem 0; }</style>
