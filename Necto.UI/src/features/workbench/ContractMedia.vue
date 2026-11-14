<script setup>
import { computed, ref, watch } from 'vue';
import DescriptionHelp from './DescriptionHelp.vue';
import { mediaExamples } from './openapiExamples.js';
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

const examples = computed(() => mediaExamples(props.content, props.resolve));
const examplePage = ref(0)
const pages = computed(() => Math.ceil(examples.value.length / 3))
const visibleExamples = computed(() => examples.value.slice(examplePage.value * 3, (examplePage.value + 1) * 3))
const selectedExample = computed(() => examples.value.find(item => item.id === selected.value) ?? examples.value[0])
const example = computed(() => selectedExample.value?.available ? selectedExample.value.value : undefined)
const exampleText = computed(() => typeof example.value === 'string' ? example.value : JSON.stringify(example.value, null, 2) ?? '')
function selectExample(id) { selected.value = id; review.value = false }
watch(() => props.content, () => { selected.value = ''; examplePage.value = 0; review.value = false })
</script>
<template>
  <SchemaTree
    v-if="content.schema"
    :schema="content.schema"
    :resolve="resolve"
    name="Model"
  />
  <details v-if="examples.length" @toggle="exampleOpen = $event.currentTarget.open">
    <summary>Example</summary>
    <template v-if="exampleOpen">
    <div class="example-tags" aria-label="OpenAPI example choices">
      <button v-for="item in visibleExamples" :key="item.id" type="button" :aria-pressed="selectedExample?.id === item.id" @click="selectExample(item.id)">{{ item.name }}</button>
      <template v-if="pages > 1"><button type="button" aria-label="Previous examples" :disabled="examplePage === 0" @click="examplePage--">‹</button><small>{{ examplePage + 1 }} / {{ pages }}</small><button type="button" aria-label="Next examples" :disabled="examplePage + 1 === pages" @click="examplePage++">›</button></template>
      <DescriptionHelp :label="'About example ' + selectedExample?.name" :description="selectedExample?.description" />
    </div>
    <p v-if="!selectedExample?.available">{{ selectedExample?.reason }}</p>
    <pre v-if="!review && selectedExample?.available">{{ preview(exampleText) }}</pre>
    <small v-if="!review && exampleText.length > 4000">Showing the first 4,000 characters. Applying an example uses its full value.</small>
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
.example-tags {display:flex;flex-wrap:wrap;gap:.3rem;align-items:center}
.example-tags button {border-radius:1rem}
.example-tags button[aria-pressed="true"] {background:var(--accent);color:white}

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
