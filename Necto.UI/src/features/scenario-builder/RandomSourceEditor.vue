<script setup>
const props=defineProps({source:Object,steps:Array,step:Object,shared:Boolean,disabled:Boolean})
</script>
<template>
 <fieldset class="random-source" :disabled="disabled">
  <label>Source step<select v-model="source.stepId" aria-label="Random source step"><option value="" disabled>Choose a step</option><option v-for="other in steps.filter(other=>other.id!==step?.id)" :key="other.id" :value="other.id">{{other.label}}</option></select></label>
  <label>Array JSON Pointer<input v-model="source.responsePointer" aria-label="Random array pointer" placeholder="/items · empty = response array"></label>
  <label>Selected item JSON Pointer<input v-model="source.itemPointer" aria-label="Random item pointer" placeholder="/id · empty = whole selected item"></label>
  <small>{{shared?'One selection per run, reused by every consumer.':'One selection for this input per run; retries reuse it. Use a shared random variable to reuse the same item in several fields.'}} Empty or non-array responses stop the consumer before sending.</small>
 </fieldset>
</template>
<style scoped>
.random-source { display:grid; gap:.4rem; min-width:0; border:0; padding:0; margin:0; }label { display:grid; gap:.2rem; font:.73rem system-ui; min-width:0; }input,select { min-width:0; width:100%; padding:.3rem; }small { color:var(--muted); font:.68rem/1.5 system-ui; }
</style>
