<script setup>
import MarkdownText from './MarkdownText.vue'
import { computed, ref, watch } from 'vue'
const props = defineProps({
  schema: Object,
  resolve: Function,
  depth: { type: Number, default: 0 },
  name: { type: String, default: 'Body' },
  required: Boolean
})
const value = computed(() => props.resolve(props.schema) ?? {})
const open = ref(props.depth < 1), page = ref(1)
const children = computed(() => [
  ...Object.entries(value.value.properties ?? {}).map(([name, schema]) => ({ key: 'property:' + name, name, schema, required: value.value.required?.includes(name) })),
  ...(value.value.items ? [{ key:'items', name:'Array item', schema:value.value.items }] : []),
  ...['allOf','oneOf','anyOf'].flatMap(kind => (value.value[kind] ?? []).map((schema, index) => ({key:kind+index,name:`${kind} ${index+1}`,schema})))
])
const pages = computed(() => Math.max(1, Math.ceil(children.value.length / 25)))
const visible = computed(() => children.value.slice((page.value - 1) * 25, page.value * 25))
watch(() => props.schema, () => { page.value = 1; open.value = props.depth < 1 })
</script>
<template>
  <details v-if="schema" :open="open" @toggle="open = $event.currentTarget.open">
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
    <template v-if="open">
      <MarkdownText v-if="value.description" :text="value.description" />
      <p v-if="value.enum">Allowed: <code>{{ JSON.stringify(value.enum.slice(0, 25)) }}</code><small v-if="value.enum.length > 25"> · first 25 of {{ value.enum.length }} values; see Raw for all values.</small></p>
      <template v-if="depth < 12">
        <div v-if="pages > 1" class="model-pager" role="group" :aria-label="name + ' fields pages'">
          <button type="button" :disabled="page === 1" @click="page--">Previous fields</button>
          <span>Fields {{ (page - 1) * 25 + 1 }}–{{ Math.min(page * 25, children.length) }} / {{ children.length }}</span>
          <button type="button" :disabled="page === pages" @click="page++">Next fields</button>
        </div>
        <SchemaTree v-for="child in visible" :key="child.key" :schema="child.schema" :resolve="resolve" :depth="depth + 1" :name="child.name" :required="child.required" />
      </template>
      <p v-else>Model depth limit reached. Use Raw OpenAPI fragment to inspect deeper references.</p>
    </template>
  </details>
</template>
<style scoped>
.model-pager { display:flex; align-items:center; flex-wrap:wrap; gap:.4rem; margin:.4rem 0; font-size:.75rem; }
.model-pager button { padding:.25rem .4rem; border:1px solid var(--line); border-radius:.3rem; }
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
