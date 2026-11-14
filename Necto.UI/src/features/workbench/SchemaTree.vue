<script setup>
import { computed } from 'vue'
const props = defineProps({
  schema: Object,
  resolve: Function,
  depth: { type: Number, default: 0 },
  name: { type: String, default: 'Body' },
  required: Boolean
})
const value = computed(() => props.resolve(props.schema) ?? {})
</script>
<template>
  <details v-if="schema" :open="depth < 1">
    <summary>
      <code>{{ name }}</code> ·
      {{
        (Array.isArray(value.type) ? value.type.join(' | ') : value.type) || (value.oneOf ? 'oneOf' : value.anyOf ? 'anyOf' : 'object')
      }}
      <span v-if="required"> · required</span
      ><span v-if="value.format"> · {{ value.format }}</span
      ><span v-if="value.readOnly"> · read only</span
      ><span v-if="value.writeOnly"> · write only</span>
    </summary>
    <p v-if="value.description">{{ value.description }}</p>
    <p v-if="value.enum">
      Allowed: <code>{{ JSON.stringify(value.enum) }}</code>
    </p>
    <template v-if="depth < 12"
      ><SchemaTree
        v-for="(property, key) in value.properties"
        :key="key"
        :schema="property"
        :resolve="resolve"
        :depth="depth + 1"
        :name="key"
        :required="value.required?.includes(key)" /><SchemaTree
        v-if="value.items"
        :schema="value.items"
        :resolve="resolve"
        :depth="depth + 1"
        name="Array item" /><template
        v-for="kind in ['allOf', 'oneOf', 'anyOf']"
        :key="kind"
        ><SchemaTree
          v-for="(variant, index) in value[kind]"
          :key="index"
          :schema="variant"
          :resolve="resolve"
          :depth="depth + 1"
          :name="`${kind} ${index + 1}`" /></template
    ></template>
    <p v-else>Expand this model from its reference to inspect deeper levels.</p>
  </details>
</template>
<style scoped>
details {
  margin: 0.4rem 0 0.4rem 0.6rem;
  font-size: 0.8rem;
}
summary {
  cursor: pointer;
  overflow-wrap: anywhere;
}
p {
  color: var(--muted);
  margin: 0.3rem;
}
</style>
