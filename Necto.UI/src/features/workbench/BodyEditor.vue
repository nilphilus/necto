<script setup>
import { computed, watch } from 'vue'
import { bodyContent, formFields, isJson } from './body.js'
import { schemaIssues } from './schema.js'
import { initialBody } from '../request-runner/request.js'
const props = defineProps({ operation: Object, session: Object })
const media = computed(() => bodyContent(props.operation, props.session))
const forms = computed(() =>
  ['multipart/form-data', 'application/x-www-form-urlencoded'].includes(
    media.value?.[0]
  )
)
const binary = computed(
  () =>
    media.value?.[0] === 'application/octet-stream' ||
    props.operation.resolve(media.value?.[1]?.schema)?.format === 'binary'
)
const examples = computed(() =>
  Object.entries(media.value?.[1]?.examples ?? {})
)
const issues = computed(() => {
  if (!media.value || !isJson(media.value[0])) return []
  try {
    return schemaIssues(
      JSON.parse(props.session.body),
      media.value[1].schema,
      props.operation.resolve
    )
  } catch {
    return ['Body is not valid JSON.']
  }
})
const variants = computed(() => {
  const schema = props.operation.resolve(media.value?.[1]?.schema)
  return schema?.oneOf ?? schema?.anyOf ?? []
})
const variantDrafts = new Map()
function variant(index) {
  variantDrafts.set(
    `${media.value[0]}:${props.session.variantIndex}`,
    props.session.body
  )
  props.session.variantIndex = index
  const schema = props.operation.resolve(media.value?.[1]?.schema)
  const selected = variants.value[index]
  const value = template(props.operation.resolve(selected))
  if (schema?.discriminator && value && typeof value === 'object') {
    const tag =
      Object.entries(schema.discriminator.mapping ?? {}).find(
        ([, reference]) => reference === selected.$ref
      )?.[0] ?? selected.$ref?.split('/').pop()
    if (tag) value[schema.discriminator.propertyName] = tag
  }
  props.session.body =
    variantDrafts.get(`${media.value[0]}:${index}`) ??
    JSON.stringify(value, null, 2)
}
function template(schema = {}, depth = 0) {
  if (depth > 8) return null
  if (schema.example !== undefined) return schema.example
  if (schema.const !== undefined) return schema.const
  if (schema.default !== undefined) return schema.default
  if (schema.enum) return schema.enum[0]
  if (schema.type === 'object' || schema.properties)
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([, child]) => !props.operation.resolve(child)?.readOnly)
        .map(([name, child]) => [
          name,
          template(props.operation.resolve(child), depth + 1)
        ])
    )
  return schema.type === 'array'
    ? []
    : schema.type === 'integer' || schema.type === 'number'
      ? 0
      : schema.type === 'boolean'
        ? false
        : ''
}
const drafts = new Map()
function selectMedia(value) {
  drafts.set(media.value?.[0], {
    body: props.session.body,
    variantIndex: props.session.variantIndex,
    formFields: props.session.formFields,
    binaryFile: props.session.binaryFile
  })
  props.session.mediaType = value
  Object.assign(
    props.session,
    drafts.get(value) ?? {
      body: initialBody(props.operation, value),
      variantIndex: undefined,
      formFields: formFields(props.operation, value),
      binaryFile: undefined
    }
  )
}
watch(
  () => props.session,
  () => {
    drafts.clear()
    variantDrafts.clear()
  },
  { immediate: true }
)
watch(
  media,
  (value) => {
    if (forms.value && !props.session.formFields)
      props.session.formFields = formFields(props.operation, value[0])
  },
  { immediate: true }
)
function example(value) {
  const item = props.operation.resolve(media.value[1].examples[value])
  if (item?.value !== undefined)
    props.session.body =
      typeof item.value === 'string' && !isJson(media.value[0])
        ? item.value
        : JSON.stringify(item.value, null, 2)
}
</script>
<template>
  <div v-if="media" class="body-editor">
    <label v-if="Object.keys(operation.requestBody.content).length > 1"
      >Body format
      <select :value="media[0]" @change="selectMedia($event.target.value)">
        <option
          v-for="type in Object.keys(operation.requestBody.content)"
          :key="type"
        >
          {{ type }}
        </option>
      </select></label
    >
    <small v-else-if="!isJson(media[0])">Request body · {{ media[0] }}</small>
    <label v-if="examples.length"
      >Example
      <select @change="example($event.target.value)">
        <option value="">Choose example…</option>
        <option v-for="[key, value] in examples" :value="key" :key="key">
          {{ value.summary || key }}
        </option>
      </select></label
    >
    <template v-if="forms">
      <div
        v-for="(row, index) in session.formFields"
        :key="index"
        class="form-row"
      >
        <input
          v-model="row.enabled"
          type="checkbox"
          :aria-label="`Include ${row.name}`"
          :disabled="row.required"
        />
        <label
          ><span
            ><code>{{ row.name }}</code
            ><small v-if="row.required"> · required</small></span
          >
          <small v-if="row.attachmentRequired && !row.files?.length"
            >Attach this file again; files are not saved.</small
          >
          <input
            v-if="row.kind === 'file'"
            type="file"
            :multiple="row.multiple"
            @change="row.files = Array.from($event.target.files)" />
          <input
            v-else
            v-model="row.value"
            :disabled="!row.enabled"
            :required="row.required"
            :placeholder="row.multiple ? 'JSON array or single value' : ''"
        /></label>
      </div>
    </template>
    <label v-else-if="binary"
      >Choose request file
      <small v-if="session.binaryAttachmentRequired && !session.binaryFile"
        >Attach this file again; files are not saved.</small
      >
      <input type="file" @change="session.binaryFile = $event.target.files[0]"
    /></label>
    <label v-else-if="!isJson(media[0])"
      >Request body
      <textarea v-model="session.body" rows="4" spellcheck="false" />
    </label>
    <template v-else
      ><label v-if="variants.length"
        >Schema variant<select
          :value="session.variantIndex ?? -1"
          @change="variant(Number($event.target.value))"
        >
          <option :value="-1" disabled>Choose variant…</option>
          <option v-for="(item, index) in variants" :key="index" :value="index">
            {{
              operation.resolve(item)?.title ||
              item.$ref?.split('/').pop() ||
              `Variant ${index + 1}`
            }}
          </option>
        </select></label
      ><slot />
      <details v-if="issues.length">
        <summary>{{ issues.length }} schema hints</summary>
        <ul>
          <li v-for="issue in issues" :key="issue">{{ issue }}</li>
        </ul>
        <small
          >Common schema constraints only; the API validates the complete
          contract.</small
        >
      </details></template
    >
  </div>
</template>
<style scoped>
.body-editor {
  display: grid;
  gap: 0.5rem;
}
label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.8rem;
}
select,
input,
textarea {
  max-width: 100%;
  width: 100%;
}
.form-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.form-row > input {
  width: auto;
}
.form-row label {
  flex: 1;
  min-width: 0;
}
textarea {
  font-family: monospace;
  max-height: 35vh;
}
small {
  color: var(--muted);
}
</style>
