<script setup>
import { computed } from 'vue';
import ContractMedia from './ContractMedia.vue';
const props = defineProps({ operation: Object, session: Object });
const emit = defineEmits(['use-example'])
const responses = computed(() =>
  Object.entries(props.operation.responses ?? {}).map(([status, raw]) => [
    status,
    props.operation.resolve(raw) ?? {}
  ])
);
const preferred = computed(
  () =>
    responses.value.find(([status]) => /^2/.test(status))?.[0] ??
    responses.value[0]?.[0]
);
const type = (schema) => {
  const value = props.operation.resolve(schema);
  return (
    (Array.isArray(value?.type) ? value.type.join(' | ') : value?.type) ||
    (value?.oneOf ? 'oneOf' : value?.anyOf ? 'anyOf' : 'Model')
  );
};
</script>
<template>
  <div class="contract-panel">
    <details v-if="operation.requestBody" open>
      <summary>
        Request body
        <small v-if="operation.requestBody.required">· required</small>
      </summary>
      <p v-if="operation.requestBody.description">
        {{ operation.requestBody.description }}
      </p>
      <section
        v-for="(media, name) in operation.requestBody.content"
        :key="name"
      >
        <h4>{{ name }}</h4>
        <ContractMedia :content="media" :resolve="operation.resolve" request-example :can-apply="!!session && !session.pending" :media-type="name" :draft-body="session?.body" @use-example="emit('use-example', $event)" />
      </section>
    </details>
    <details
      v-for="[status, response] in responses"
      :key="status"
      :open="status === preferred"
    >
      <summary>{{ status }} · {{ response.description || 'Response' }}</summary>
      <section v-for="(media, name) in response.content" :key="name">
        <h4>{{ name }}</h4>
        <ContractMedia :content="media" :resolve="operation.resolve" />
      </section>
      <p v-if="!response.content">No response body declared.</p>
      <details v-if="response.headers">
        <summary>Response headers</summary>
        <dl>
          <template v-for="(header, name) in response.headers" :key="name"
            ><dt>{{ name }}</dt>
            <dd>{{ operation.resolve(header)?.description }}</dd></template
          >
        </dl>
      </details>
    </details>
    <details v-if="operation.parameters?.length" open>
      <summary>Parameters</summary>
      <div
        v-for="parameter in operation.parameters"
        :key="`${parameter.in}:${parameter.name}`"
        class="parameter"
      >
        <strong>{{ parameter.name }}</strong> · {{ parameter.in }} ·
        {{ type(parameter.schema)
        }}<small v-if="parameter.required || parameter.in === 'path'">
          · required</small
        >
        <p v-if="parameter.description">{{ parameter.description }}</p>
        <p v-if="operation.resolve(parameter.schema)?.enum">
          Allowed:
          {{ JSON.stringify(operation.resolve(parameter.schema).enum) }}
        </p>
      </div>
    </details>
    <details class="raw-contract">
      <summary>Raw OpenAPI fragment</summary>
      <pre>{{
        JSON.stringify(
          {
            requestBody: operation.requestBody,
            parameters: operation.parameters,
            responses: operation.responses
          },
          null,
          2
        )
      }}</pre>
    </details>
  </div>
</template>
<style scoped>
details {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--line);
}
summary {
  cursor: pointer;
  font-weight: 600;
}
h4 {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 0.6rem 0;
}
.parameter {
  font-size: 0.85rem;
  padding: 0.6rem 0;
  overflow-wrap: anywhere;
}
.parameter p {
  margin: 0.25rem 0;
  color: var(--muted);
}
pre {
  overflow: auto;
  max-height: 45dvh;
  background: var(--subtle);
  padding: 0.7rem;
  font-size: 0.78rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
