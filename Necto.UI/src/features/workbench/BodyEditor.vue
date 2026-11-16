<script setup>
import { computed, useId, watch } from 'vue'
import ExpandedBodyEditor from './ExpandedBodyEditor.vue'
import { bodyContent, formFields, isJson } from './body.js'
import { schemaIssues } from './schema.js'
import { initialPayload } from '../request-runner/request.js'
import { schemaTemplate, formatTemplate, TemplateLimitError, TEMPLATE_NOTICE } from '../request-runner/schemaTemplate.js'
const props = defineProps({ operation: Object, session: Object })
const bodyId = useId()
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
  let value
  try { value = schemaTemplate(props.operation, selected) }
  catch (error) {
    if (!(error instanceof TemplateLimitError)) throw error
    props.session.body = variantDrafts.get(`${media.value[0]}:${index}`) ?? ''
    props.session.bodyNotice = TEMPLATE_NOTICE
    return
  }
  props.session.bodyNotice = ''
  if (schema?.discriminator && value && typeof value === 'object') {
    const tag =
      Object.entries(schema.discriminator.mapping ?? {}).find(
        ([, reference]) => reference === selected.$ref
      )?.[0] ?? selected.$ref?.split('/').pop()
    if (tag) value[schema.discriminator.propertyName] = tag
  }
  try { props.session.body = variantDrafts.get(`${media.value[0]}:${index}`) ?? formatTemplate(value) }
  catch (error) {
    if (!(error instanceof TemplateLimitError)) throw error
    props.session.body = ''; props.session.bodyNotice = TEMPLATE_NOTICE
  }
}
const drafts = new Map()
function selectMedia(value) {
  drafts.set(media.value?.[0], {
    body: props.session.body,
    bodyNotice: props.session.bodyNotice,
    variantIndex: props.session.variantIndex,
    formFields: props.session.formFields,
    binaryFile: props.session.binaryFile
  })
  props.session.mediaType = value
  const generated = drafts.has(value) ? null : initialPayload(props.operation, value)
  Object.assign(
    props.session,
    drafts.get(value) ?? {
      body: generated.body,
      bodyNotice: generated.notice,
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
</script>
<template>
  <div v-if="media" class="body-editor">
    <p v-if="session.bodyNotice && !session.body?.trim()" role="status" class="generation-notice">{{ session.bodyNotice }}</p>
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
    <template v-else-if="!isJson(media[0])">
      <div class="body-heading">
        <label :for="bodyId">Request body</label>
        <ExpandedBodyEditor :session="session" />
      </div>
      <textarea :id="bodyId" v-model="session.body" rows="4" spellcheck="false" />
    </template>
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
.body-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.35rem;
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
