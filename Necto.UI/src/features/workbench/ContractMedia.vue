<script setup>
import { computed, ref } from 'vue';
import { exampleBody } from './contractExample.js';
import SchemaTree from './SchemaTree.vue';
const props = defineProps({ content: Object, resolve: Function, canApply: Boolean, requestExample: Boolean, mediaType: String, draftBody: String });
const emit = defineEmits(['use-example'])
const selected = ref(''), review = ref(false), exampleOpen = ref(false)
const proposed = computed(() => {
  try { return { body: exampleBody(props.mediaType ?? '', example.value) } } catch(error) { return {error:error.message} }
})
function apply() { if (!props.canApply || proposed.value.error) return; emit('use-example', {mediaType:props.mediaType,value:example.value}); review.value = false }
const preview = value => String(value ?? '').slice(0, 4000)

const examples = computed(() =>
  Object.entries(props.content.examples ?? {})
    .map(([key, raw]) => [key, props.resolve(raw)])
    .filter(([, item]) => item && Object.hasOwn(item, 'value'))
);
const example = computed(() =>
  selected.value
    ? examples.value.find(([key]) => key === selected.value)?.[1].value
    : (props.content.example ?? examples.value[0]?.[1].value)
);
</script>
<template>
  <SchemaTree
    v-if="content.schema"
    :schema="content.schema"
    :resolve="resolve"
    name="Model"
  />
  <details v-if="example !== undefined || examples.length" @toggle="exampleOpen = $event.currentTarget.open">
    <summary>Example</summary>
    <template v-if="exampleOpen">
    <label v-if="examples.length > 1"
      >Named example<select v-model="selected">
        <option value="">Default example</option>
        <option v-for="[key, item] in examples" :key="key" :value="key">
          {{ item.summary || key }}
        </option>
      </select></label
    >
    <pre v-if="!review">{{
      typeof example === 'string' ? example : JSON.stringify(example, null, 2)
    }}</pre>
    <template v-if="requestExample && example !== undefined">
      <button v-if="!review" type="button" :disabled="!canApply || !!proposed.error" @click="review = !review">Use as draft</button>
      <p v-if="proposed.error">{{ proposed.error }}</p>
      <section v-if="review" class="example-review" aria-label="Review body replacement">
        <h4>Replace request body · {{ mediaType }}</h4>
        <p>Only the draft body changes. Existing presets still apply; body bindings are cleared. Nothing is sent.</p>
        <details><summary>Current draft body</summary><pre>{{ preview(draftBody) }}</pre></details>
        <strong>New body</strong><pre>{{ preview(proposed.body) }}</pre><small>Preview shows at most 4,000 characters; the full example is applied.</small>
        <button type="button" :disabled="!canApply" @click="apply">Replace draft body</button><button type="button" @click="review = false">Cancel replacement</button>
      </section>
    </template>
    </template>
  </details>
</template>
<style scoped>
button { padding:.35rem .6rem; border:1px solid var(--line); border-radius:.3rem; margin:.3rem .3rem .3rem 0; font-size:.8rem; }
.example-review { border:1px solid var(--line); border-radius:.4rem; padding:.6rem; margin:.5rem 0; }
.example-review button { margin:.4rem .4rem 0 0; }
.example-review small { display:block; color:var(--muted); }
pre {
  overflow: auto;
  max-height: 40dvh;
  padding: 0.7rem;
  background: var(--subtle);
  white-space: pre-wrap;
  font-size: 0.8rem;
}
details {
  margin: 0.5rem 0;
}
summary {
  cursor: pointer;
}
label {
  display: grid;
  gap: 0.3rem;
}
</style>
