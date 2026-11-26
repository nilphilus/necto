<script setup>
import { ref } from 'vue'
import OperationRunner from '../request-runner/OperationRunner.vue'
import CollectValuesDialog from './CollectValuesDialog.vue'
import { applyCollectedValues } from './collectionFields.js'

const props = defineProps({
  operation: Object, session: Object, workspace: String, configuration: Object,
  fields: Array, tools: Object, presetColors: Map, defaultPresetColor: String,
  ancestors: { type: Array, default: () => [] },
})
const dialog = ref(null)
const prerequisiteFinder = ref(null)

function open(trigger, location, name) {
  return dialog.value?.open(trigger, location, name)
}

function apply(session, selections) {
  if (props.session === session && !session.pending) applyCollectedValues(session, selections)
}

defineExpose({ open })
</script>

<template>
  <CollectValuesDialog ref="dialog" :operation="operation" :session="session"
    :workspace="workspace" :configuration="configuration" :values-for="tools.valuesFor" :fields="fields"
    :choices-for="tools.choicesFor" :sources-for="tools.sourcesFor" :ancestors="ancestors"
    :create-session="tools.createDraft" :cancel-request="tools.cancelRequest" :apply="apply">
    <template #default="{ operation: sourceOperation, session: sourceSession, selectors, selectObject,
      canSelect, selectionNote, reusableValues, reuseValue, valueLabel, prerequisiteFields, prerequisiteSources }">
      <OperationRunner :key="sourceOperation.key" :operation="sourceOperation" :session="sourceSession"
        :configuration="configuration" :values="tools.valuesFor(sourceOperation)" :preset-colors="presetColors"
        :default-preset-color="defaultPresetColor" default-response-view="preview" :selectors="selectors"
        :can-select="canSelect" :selection-note="selectionNote"
        :value-sources="prerequisiteSources" :collectable-fields="prerequisiteFields" source-collection-only
        @collect-values="(trigger, location, name) => prerequisiteFinder?.open(trigger, location, name)"
        @select-response-object="selectObject" :run="tools.runInContext" :prepare="tools.prepareRequest" :cancel="tools.cancelRequest"
        @inspect-openapi="trigger => tools.inspectOpenApi(sourceOperation, trigger)">
        <template #request-actions>
          <button v-if="prerequisiteFields.length" class="secondary" type="button" aria-haspopup="dialog"
            :disabled="sourceSession.pending" @click="prerequisiteFinder?.open($event.currentTarget)">Find source inputs</button>
        </template>
        <template #choices="{ location, parameterName }">
          <template v-if="reusableValues[location + ':' + parameterName]?.length">
            <button v-if="reusableValues[location + ':' + parameterName].length === 1" class="secondary use-collected-value"
              type="button" :disabled="sourceSession.pending" @click="reuseValue(location, parameterName)">
              {{ reusableValues[location + ':' + parameterName][0].fromRequest ? 'Use request value' : 'Use collected value' }} · {{ valueLabel(reusableValues[location + ':' + parameterName][0]) }}
            </button>
            <label v-else class="use-collected-value">Use a value
              <select :aria-label="'Use a value for ' + parameterName" :disabled="sourceSession.pending"
                @change="$event.target.value !== '' && reuseValue(location, parameterName, Number($event.target.value))">
                <option value="">Choose a value…</option>
                <option v-for="(choice, index) in reusableValues[location + ':' + parameterName]"
                  :key="index" :value="String(index)">{{ valueLabel(choice) }} · {{ choice.source }}</option>
              </select>
            </label>
          </template>
        </template>
      </OperationRunner>
      <ValueFinder v-if="prerequisiteFields.length" ref="prerequisiteFinder"
        :operation="sourceOperation" :session="sourceSession" :workspace="workspace" :configuration="configuration"
        :fields="prerequisiteFields" :tools="tools" :ancestors="[...ancestors, operation.key]"
        :preset-colors="presetColors" :default-preset-color="defaultPresetColor" />
    </template>
  </CollectValuesDialog>
</template>

<style scoped>
.use-collected-value { width: fit-content; max-width: 100%; font-size: .8rem; overflow-wrap: anywhere; }
</style>
