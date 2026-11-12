<script setup>
import { computed, ref } from 'vue'
import JsonNode from '../request-runner/JsonNode.vue'
import PreviewPager from '../request-runner/PreviewPager.vue'
import { pageRange, TEXT_PAGE_SIZE } from '../request-runner/preview.js'

const props = defineProps({ value: {}, text: String })
const page = ref(1)
const range = computed(() => pageRange(props.text?.length ?? 0, page.value, TEXT_PAGE_SIZE))
</script>

<template>
  <div class="trace-payload" tabindex="0" aria-label="Payload preview">
    <JsonNode v-if="value !== undefined" :value="value" :path="[]" :selectors="[]" root />
    <template v-else>
      <PreviewPager :range="range" label="Text characters" @change="page = $event" />
      <pre>{{ text?.slice(range.start, range.end) }}</pre>
    </template>
  </div>
</template>

<style scoped>
.trace-payload { max-height: 19rem; overflow: auto; padding: .65rem; border-radius: .4rem; background: #182420; color: #e7f3eb; font: .78rem/1.55 ui-monospace, Consolas, monospace; }
pre { margin: 0; font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
