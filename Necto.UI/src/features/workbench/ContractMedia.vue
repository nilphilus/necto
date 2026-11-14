<script setup>
import { computed, ref } from 'vue';
import SchemaTree from './SchemaTree.vue';
const props = defineProps({ content: Object, resolve: Function });
const selected = ref('');
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
  <details v-if="example !== undefined || examples.length">
    <summary>Example</summary>
    <label v-if="examples.length > 1"
      >Named example<select v-model="selected">
        <option value="">Default example</option>
        <option v-for="[key, item] in examples" :key="key" :value="key">
          {{ item.summary || key }}
        </option>
      </select></label
    >
    <pre>{{
      typeof example === 'string' ? example : JSON.stringify(example, null, 2)
    }}</pre>
  </details>
</template>
<style scoped>
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
