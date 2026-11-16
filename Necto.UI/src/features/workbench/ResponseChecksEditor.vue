<script setup>
import { assertionKinds } from './assertions.js'
defineProps({session:Object,disabled:Boolean})
function addCheck(session){(session.assertions??=[]).push({kind:'status',path:'',expected:'200'})}
</script>
<template><fieldset :disabled="disabled" class="response-checks-editor">      <p>
        Checks run after each response. Paths use JSON Pointer, for example
        /lines/0/id.
      </p>
      <div
        v-for="(check, index) in session.assertions"
        :key="index"
        class="check"
      >
        <select v-model="check.kind" aria-label="Check type">
          <option
            v-for="(label, kind) in assertionKinds"
            :value="kind"
            :key="kind"
          >
            {{ label }}
          </option></select
        ><input
          v-if="!['status', 'duration'].includes(check.kind)"
          v-model="check.path"
          placeholder="/field"
          aria-label="JSON Pointer"
        /><input
          v-if="!['exists', 'nonempty'].includes(check.kind)"
          v-model="check.expected"
          placeholder="Expected value"
          aria-label="Expected value"
        /><button type="button" @click="session.assertions.splice(index, 1)">
          Remove
        </button>
      </div>
      <button
        type="button"
        :disabled="session.assertions?.length >= 50"
        @click="addCheck(session)"
      >
        Add check
      </button>
</fieldset></template>
<style scoped>.response-checks-editor { border:0; padding:0; margin:0; min-width:0; font-size:.75rem; }.check { display:flex; flex-wrap:wrap; gap:.35rem; margin:.5rem 0; }.check input { flex:1; min-width:6rem; }.check select,.check input { max-width:100%; padding:.35rem; }p { color:var(--muted); font-size:.7rem; }</style>
