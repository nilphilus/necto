<script setup>
import { sensitiveName } from '../workbench/privacy.js'
import { contractValues } from '../request-runner/contractValues.js'
import DescriptionHelp from '../workbench/DescriptionHelp.vue'
import { computed, ref, watch, inject } from 'vue'
import {
  bodyAt,
  bodyFieldEntries,
  bodyBindingsUnder,
  bindingAt,
  writeBody,
  sourceFor,
  schemaView,
  removeBodyField,
  removeArrayItem,
  pointer,
  prefix,
  inferVariant,
  BODY_VALUE,
  BODY_FIELD_EDITOR,
  BODY_SOURCE_LABELS,
  variantTemplate,
  editBodyNumber,
} from './bodySchema.js'
import { pointerParts, readPointer } from './pointers.js'
import { schemaTemplate } from '../request-runner/schemaTemplate.js'
const props = defineProps({
  step: Object,
  operation: Object,
  raw: Object,
  path: { type: Array, default: () => [] },
  name: String,
  required: Boolean,
  disabled: Boolean,
  depth: { type: Number, default: () => 0 },
  ancestors: { type: Array, default: () => [] },
  last: { type: Boolean, default: true },
})
const emit = defineEmits(['raw'])
const editField = inject(BODY_FIELD_EDITOR)
const body = inject(BODY_VALUE, null)
function current() {
  if (!body) return bodyAt(props.step, props.path)
  try {
    return readPointer(body.value, pointer(props.path))
  } catch {
    return undefined
  }
}
const variants = computed(() => {
  const raw = props.operation.resolve(props.raw)
  return raw?.oneOf ?? raw?.anyOf ?? []
})
const variant = computed(() =>
  inferVariant(
    props.operation,
    props.raw,
    current(),
    props.step.request.bodyVariants?.[pointer(props.path)]
  )
)
const error = ref(''),
  open = ref(props.depth < 4),
  visible = ref(50),
  itemsVisible = ref(10)
const schema = computed(() => schemaView(props.operation, props.raw, variant.value))
const examples = computed(() =>
  schema.value.writeOnly ||
  schema.value.format === 'password' ||
  sensitiveName(props.name ?? '') ||
  schema.value['x-necto-sensitive'] === true ||
  props.operation.resolve(props.raw)?.oneOf ||
  props.operation.resolve(props.raw)?.anyOf ||
  props.operation.resolve(props.raw)?.allOf
    ? []
    : contractValues(schema.value)
)
function useExample(index, element) {
  if (index !== '') set(examples.value[Number(index)].value)
  element.value = ''
}
const value = computed(current)
const bodyBindings = computed(() => props.step.inputs.filter((input) => input.location === 'body'))
const properties = computed(() => bodyFieldEntries(schema.value, value.value, bodyBindings.value, props.path))
const descendantFields = computed(() => new Set(bodyBindingsUnder(bodyBindings.value, props.path)))
const visibleProperties = computed(() => properties.value.filter(([name], index) =>
  index < visible.value || descendantFields.value.has(name)))
const arrayRows = computed(() => {
  if (!Array.isArray(value.value)) return []
  const indices = new Set(value.value.slice(0, itemsVisible.value).map((_, index) => index))
  for (const field of descendantFields.value) {
    if (/^(?:0|[1-9]\d*)$/.test(field) && Number(field) < value.value.length) indices.add(Number(field))
  }
  return [...indices].sort((left, right) => left - right)
})
watch(() => descendantFields.value.size, (count) => { if (count) open.value = true }, { immediate: true })
const type = computed(() => {
  const t = schema.value.type
  const container = Array.isArray(value.value) ? 'array'
    : value.value && typeof value.value === 'object' ? 'object' : undefined
  return Array.isArray(t)
    ? (t.includes(container) ? container : t.find((item) => item !== 'null'))
    : (t ??
        (properties.value.length
          ? 'object'
          : schema.value.items
            ? 'array'
            : current() !== undefined
              ? Array.isArray(current())
                ? 'array'
                : current() === null
                  ? 'null'
                  : typeof current()
              : 'string'))
})
const nullable = computed(() => schema.value.nullable || schema.value.type?.includes?.('null'))
const binding = computed(() => bindingAt(props.step, props.path))
const source = computed(() => binding.value?.source ?? 'static')
const recursive = computed(
  () => props.depth >= 16 || props.ancestors.includes(props.raw?.$ref ?? props.raw)
)
const disabled = computed(() => props.disabled || schema.value.readOnly)
const jsonText = ref('')
watch(
  value,
  (value) => {
    jsonText.value =
      value === undefined ||
      !(recursive.value || (type.value === 'object' && !properties.value.length))
        ? ''
        : JSON.stringify(value, null, 2)
  },
  { immediate: true }
)
function attempt(action) {
  error.value = ''
  try {
    action()
  } catch (cause) {
    error.value = cause.message
  }
}
function set(value) {
  attempt(() => writeBody(props.step, props.operation, props.path, value))
}
function choose(source, element) {
  attempt(() => {
    const affected = props.step.inputs.filter(
      (input) =>
        input.location === 'body' &&
        input.pointer !== pointer(props.path) &&
        (prefix(props.path, pointerParts(input.pointer)) ||
          prefix(pointerParts(input.pointer), props.path))
    )
    if (affected.length && !window.confirm('Replace the configured sources inside this field?'))
      return
    sourceFor(props.step, props.operation, props.path, source, {
      ...schema.value,
      type: type.value,
    })
  })
  element.value = binding.value?.source ?? 'static'
  if (binding.value) editField(pointer(props.path), element)
}
function include(enabled, element) {
  attempt(() => {
    if (
      !enabled &&
      props.step.inputs.some(
        (input) => input.location === 'body' && prefix(props.path, pointerParts(input.pointer))
      ) &&
      !window.confirm('Remove this field and its configured input sources?')
    )
      return
    if (enabled)
      writeBody(
        props.step,
        props.operation,
        props.path,
        schemaTemplate(props.operation, schema.value)
      )
    else removeBodyField(props.step, props.path)
  })
  element.checked = value.value !== undefined
}
function addItem() {
  attempt(() => {
    const items = [...(value.value ?? [])]
    items.push(schemaTemplate(props.operation, schema.value.items ?? {}))
    writeBody(props.step, props.operation, props.path, items)
    itemsVisible.value = Math.max(itemsVisible.value, items.length)
  })
}
function removeItem(index) {
  attempt(() => {
    if (!window.confirm('Remove this item and any configured input sources inside it?')) return
    removeArrayItem(props.step, props.operation, props.path, index)
  })
}
function changeVariant(index, element) {
  attempt(() => {
    if (!window.confirm('Replace static values with the selected schema variant and keep configured value sources?')) return
    const next = variantTemplate(props.operation, props.raw, Number(index))
    writeBody(props.step, props.operation, props.path, next)
    props.step.request.bodyVariants = {
      ...props.step.request.bodyVariants,
      [pointer(props.path)]: Number(index),
    }
  })
  element.value = variant.value
}
</script>
<template>
  <section
    class="schema-field"
    :data-body-path="pointer(path)"
    :class="{
      'root-field': !path.length,
      'runtime-field': source !== 'static',
      'omitted-field': path.length && value === undefined && source === 'static',
    }"
  >
    <div class="json-line">
      <div
        class="field-heading"
        :title="
          [
            schema.description,
            type,
            schema.format,
            required ? 'required' : '',
            schema.readOnly ? 'read only' : '',
          ]
            .filter(Boolean)
            .join(' · ')
        "
      >
        <button
          v-if="['object', 'array'].includes(type) && source === 'static'"
          type="button"
          class="expand-field"
          :aria-expanded="open"
          :aria-label="'Expand ' + name"
          @click="open = !open"
        >
          {{ open ? '▾' : '▸' }}</button
        ><span v-if="path.length && typeof path.at(-1) !== 'number'" class="json-key"
          >{{ JSON.stringify(name) }}<span class="punctuation">:</span></span
        ><span
          v-if="source === 'static' && ['object', 'array'].includes(type) && value !== null"
          class="punctuation"
          >{{ type === 'object' ? '{' : '['
          }}{{ !open ? ' … ' + (type === 'object' ? '}' : ']') : '' }}</span
        ><span
          v-if="required && path.length && typeof path.at(-1) !== 'number'"
          class="required-mark"
          aria-label="Required"
          >*</span
        ><DescriptionHelp
          v-if="schema.description"
          :label="'About field ' + name"
          :description="schema.description"
        /><span v-if="value === undefined && source === 'static'" class="sr-only"
          >Not included in request</span
        ><span v-if="descendantFields.size && !open" class="field-badge">{{ descendantFields.size }} run-time inputs</span
        ><span v-if="schema.readOnly" class="field-badge">read only</span>
      </div>
      <fieldset :disabled="disabled" class="field-editor">
        <label v-if="source === 'static'" class="source-picker"
          ><span class="sr-only">Value source</span
          ><select
            :value="source"
            :aria-label="'Source for ' + name"
            @change="choose($event.target.value, $event.target)"
          >
            <option value="static">Static value</option>
            <option value="response">Previous response</option>
            <option value="variable">Shared variable</option>
            <option v-if="path.length" value="preset">Run preset</option>
            <option value="generate">Generate data</option>
            <option value="expression">Expression</option>
            <option value="random">Pick random</option>
            <option value="human">Ask at run time</option>
          </select></label
        >
        <button v-else type="button" class="secondary source-badge"
          :aria-label="'Edit source for ' + name + ': ' + BODY_SOURCE_LABELS[source]"
          @click="editField(pointer(path), $event.currentTarget)">
          {{ BODY_SOURCE_LABELS[source] }}
        </button>
        <template v-if="source === 'static'"
          ><small v-if="value === null">JSON null</small>
          <select
            v-if="schema.enum"
            :value="JSON.stringify(value)"
            :aria-label="'Value for ' + name"
            @change="set(JSON.parse($event.target.value))"
          >
            <option v-if="value === undefined" value="" disabled>Choose value</option>
            <option
              v-for="item in schema.enum"
              :key="JSON.stringify(item)"
              :value="JSON.stringify(item)"
            >
              {{ typeof item === 'object' ? JSON.stringify(item) : String(item) }}
            </option>
          </select>
          <select
            v-else-if="type === 'boolean'"
            :value="value === undefined ? '' : JSON.stringify(value)"
            :aria-label="'Value for ' + name"
            @change="set(JSON.parse($event.target.value))"
          >
            <option value="" disabled>Not set</option>
            <option value="true">true</option>
            <option value="false">false</option>
            <option v-if="nullable" value="null">null</option>
          </select>
          <input
            v-else-if="type === 'number' || type === 'integer'"
            :value="step.request.bodyFieldEdits?.[pointer(path)] ?? value ?? ''"
            type="number"
            :step="type === 'integer' ? 1 : 'any'"
            :aria-label="'Value for ' + name"
            @input="
              attempt(() =>
                editBodyNumber(step, operation, path, $event.target.value, type === 'integer')
              )
            "
          />
          <input
            v-else-if="type === 'string'"
            :value="value ?? ''"
            :type="schema.writeOnly || schema.format === 'password' ? 'password' : 'text'"
            :aria-label="'Value for ' + name"
            @input="set($event.target.value)"
          />
          <select
            v-if="examples.length"
            :aria-label="'Contract examples for ' + name"
            value=""
            @change="useExample($event.target.value, $event.target)"
          >
            <option value="">Contract examples…</option>
            <option v-for="(example, index) in examples" :key="index" :value="index">
              {{ example.label }} · {{ JSON.stringify(example.value).slice(0, 48) }}
            </option>
          </select>
          <button
            v-if="['object', 'array'].includes(type) && value === null"
            type="button"
            class="secondary"
            @click="attempt(() => set(schemaTemplate(operation, schema)))"
          >
            Create {{ type }}</button
          ><button
            v-if="nullable && value !== null"
            type="button"
            class="secondary"
            @click="set(null)"
          >
            Set null
          </button>
        </template>
      </fieldset>
      <span
        v-if="source !== 'static' || !['object', 'array'].includes(type) || value === null"
        class="punctuation comma"
        >{{ last ? '' : ',' }}</span
      ><label
        v-if="
          path.length &&
          typeof path.at(-1) !== 'number' &&
          !required &&
          source === 'static' &&
          !schema.readOnly
        "
        class="include-field"
        ><input
          type="checkbox"
          :checked="value !== undefined"
          :disabled="disabled"
          :aria-label="'Include ' + name"
          @change="include($event.target.checked, $event.target)"
        /><span class="sr-only">Include {{ name }}</span></label
      >
    </div>
    <div v-if="source === 'static' && open && (value !== null || descendantFields.size)" class="schema-children">
      <label v-if="variants.length"
        >Schema variant<select
          :value="variant"
          :disabled="disabled"
          :aria-label="'Variant for ' + name"
          @change="changeVariant($event.target.value, $event.target)"
        >
          <option v-for="(item, index) in variants" :key="index" :value="index">
            {{
              operation.resolve(item)?.title ??
              item.$ref?.split('/').at(-1) ??
              'Variant ' + (index + 1)
            }}
          </option>
        </select></label
      >
      <template v-if="recursive"
        ><p class="field-note">Recursive or deeply nested schema. Edit this subtree as JSON.</p>
        <textarea
          v-model="jsonText"
          :disabled="disabled"
          :aria-label="'JSON value for ' + name"
          rows="3"
          @change="attempt(() => set(JSON.parse(jsonText)))"
        />
      </template>
      <template v-else-if="type === 'object' && properties.length">
        <BodySchemaField
          v-for="([key, property], index) in visibleProperties"
          :last="index === visibleProperties.length - 1"
          :key="key"
          :raw="property"
          :operation="operation"
          :step="step"
          :path="[...path, key]"
          :name="key"
          :required="schema.required.includes(key)"
          :disabled="disabled"
          :depth="depth + 1"
          :ancestors="[...ancestors, raw.$ref ?? raw]"
          @raw="emit('raw')"
        />
        <button
          v-if="visibleProperties.length < properties.length"
          type="button"
          class="secondary"
          @click="visible += 50"
        >
          Show next fields ({{ visibleProperties.length }} / {{ properties.length }})
        </button>
        <button
          v-if="schema.additionalProperties"
          type="button"
          class="secondary"
          @click="emit('raw')"
        >
          Edit additional properties in Raw JSON
        </button>
      </template>
      <template v-else-if="type === 'array'"
        ><div
          v-for="index in arrayRows"
          :key="index"
          class="array-item"
        >
          <BodySchemaField
            :raw="schema.items ?? {}"
            :operation="operation"
            :step="step"
            :path="[...path, index]"
            :name="'Item ' + (index + 1)"
            :last="index === value.length - 1"
            :required="true"
            :disabled="disabled"
            :depth="depth + 1"
            :ancestors="[...ancestors, raw.$ref ?? raw]"
            @raw="emit('raw')"
          /><button
            type="button"
            class="secondary"
            :disabled="disabled"
            :aria-label="'Remove ' + name + ' item ' + (index + 1)"
            @click="removeItem(index)"
          >
            Remove item
          </button>
        </div>
        <button
          v-if="Array.isArray(value) && value.length > arrayRows.length"
          type="button"
          class="secondary"
          @click="itemsVisible += 10"
        >
          Show more items ({{ arrayRows.length }} / {{ value.length }})</button
        ><button
          type="button"
          class="secondary"
          :disabled="disabled"
          :aria-label="'Add item to ' + name"
          @click="addItem"
        >
          + Add item
        </button></template
      >
      <template v-else-if="type === 'object'">
        <textarea
          v-model="jsonText"
          :disabled="disabled"
          :aria-label="'JSON value for ' + name"
          rows="3"
          @change="attempt(() => set(JSON.parse(jsonText)))"
        />
      </template>
    </div>
    <div
      v-if="source === 'static' && open && ['object', 'array'].includes(type) && value !== null"
      class="punctuation closing"
    >
      {{ type === 'object' ? '}' : ']' }}{{ last ? '' : ',' }}
    </div>
    <p
      v-if="Object.hasOwn(step.request.bodyFieldEdits ?? {}, pointer(path))"
      class="error"
      role="alert"
    >
      Enter {{ type === 'integer' ? 'an integer' : 'a number' }} before saving or running. Clearing
      the input does not mean JSON null.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.runtime-field > .json-line { border-inline-start: 2px solid var(--accent); padding-inline-start: .45rem; }
.source-badge { background: var(--accent-soft); color: var(--accent); font-size: .72rem; }

.omitted-field > .json-line > .field-heading,
.omitted-field > .json-line > .field-editor,
.omitted-field > .schema-children {
  opacity: 0.45;
}
.omitted-field:focus-within > .json-line > .field-editor {
  opacity: 0.85;
}
.required-mark {
  color: var(--accent);
  font-size: 0.65rem;
}

.schema-field {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.76rem;
}
.json-line {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  min-height: 2.3rem;
  padding: 0.15rem 0;
}
.field-heading {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex: none;
}
.json-key {
  color: var(--accent);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.punctuation {
  color: var(--muted);
  font-weight: 600;
}
.expand-field {
  padding: 0 0.15rem;
  border: 0;
  background: transparent;
  color: var(--muted);
}
.field-badge {
  font: 0.6rem system-ui;
  color: var(--muted);
}
.include-field {
  display: flex;
  align-items: center;
  margin-left: auto;
}
.include-field input {
  width: auto;
}
.field-editor {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.field-editor label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  font: 0.65rem system-ui;
}
.field-editor .source-picker {
  flex: none;
}
.source-picker select {
  max-width: 9rem;
  background: var(--accent-soft);
  font-size: 0.65rem;
}
.field-editor > input,
.field-editor > select {
  flex: 1;
  min-width: 5rem;
}
.field-editor label:not(.source-picker) {
  flex: 1;
  flex-wrap: wrap;
}
.field-editor label:not(.source-picker) input,
.field-editor label:not(.source-picker) select {
  flex: 1;
  min-width: 5rem;
}
input,
select,
textarea {
  min-width: 0;
  max-width: 100%;
  padding: 0.25rem 0.35rem;
  font: inherit;
}
input[type='text'],
input[type='password'] {
  color: var(--accent);
}
.schema-children {
  margin-left: 1.25rem;
  padding-left: 0.5rem;
  border-left: 1px solid var(--line);
}
.schema-children > label {
  font: 0.7rem system-ui;
}
.field-note {
  color: var(--muted);
  font: 0.68rem system-ui;
  margin: 0.2rem 0;
}
.array-item > button,
.schema-children > button {
  font: 0.65rem system-ui;
  margin: 0.15rem 0;
  padding: 0.2rem 0.4rem;
}
.closing {
  min-height: 1.5rem;
  display: flex;
  align-items: center;
  white-space: pre;
}
.error {
  font: 0.73rem system-ui;
  margin: 0.3rem 0;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@container (max-width:450px) {
  .schema-children {
    margin-left: 0.6rem;
    padding-left: 0.3rem;
  }
  .field-editor {
    flex-basis: 100%;
    margin-left: 0.7rem;
  }
  .source-picker select {
    max-width: 8rem;
  }
  .include-field {
    margin-left: 0;
  }
  .json-line {
    gap: 0.2rem;
  }
}
</style>
