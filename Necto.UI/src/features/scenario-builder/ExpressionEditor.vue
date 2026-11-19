<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'
import { evaluateExpression, validateExpression } from './expression.js'
import { expressionCompletions, formatExpressionCode } from './expressionEditing.js'
import { pointerHints } from './pointerHints.js'
import { readPointer } from './pointers.js'
import { staticVariableValue } from './variables.js'
import { schemaIssues } from '../workbench/schema.js'
const props=defineProps({input:Object,step:Object,steps:Array,variables:{type:Array,default:()=>[]},results:Array,operations:Array,expectedSchema:Object,resolve:Function,disabled:Boolean})
const error=computed(()=>{try{validateExpression(props.input);return ''}catch(cause){return cause.message}})
function add(){props.input.bindings.push({name:'value'+(props.input.bindings.length+1),source:'response',stepId:'',responsePointer:''})}
const showPreview = ref(false)
const samples = ref(new Map())
const preview = ref(null)
watch(() => [props.input.expression, props.input.bindings], () => { preview.value = null }, { deep: true })
const editor = ref(null)
const completionList = ref(null)
const completionId = useId()
const completions = ref([])
const activeCompletion = ref(0)
const formatting = ref(false)
const editorNotice = ref('')

function pathsFor(binding) {
  if (binding.source === 'variable') {
    const variable = props.variables.find(item => item.id === binding.variableId)
    if (variable?.source !== 'static') return []
    try { return pointerHints(undefined, staticVariableValue(variable)) } catch { return [] }
  }
  const producer = props.steps.find(item => item.id === binding.stepId)
  const operation = props.operations?.find(item => item.key === producer?.operationKey)
  const response = props.results?.find(item => item.id === binding.stepId && item.status === 'completed')?.response?.json
  const base = binding.responsePointer ?? ''
  const contractPaths = pointerHints(operation)
    .filter(path => path.startsWith(base + '/')).map(path => path.slice(base.length))
  let observed
  try {
    const sample = samples.value.get(binding.name)?.trim()
    observed = sample ? JSON.parse(sample) : readPointer(response, base)
  } catch { /* Contract paths are available before the first run. */ }
  return [...new Set([...pointerHints(undefined, observed), ...contractPaths])]
}
function suggest(target, memberOnly = false) {
  editorNotice.value = ''
  completions.value = expressionCompletions(target.value, target.selectionStart, props.input.bindings, pathsFor, memberOnly)
  activeCompletion.value = 0
  if (!memberOnly && !completions.value.length) editorNotice.value = 'No suggestions at the cursor.'
}
async function applyCompletion(completion) {
  const source = props.input.expression
  const next = source.slice(0, completion.start) + completion.name + source.slice(completion.end)
  completions.value = []
  if (next.length > 4096) return
  props.input.expression = next
  await nextTick()
  editor.value?.focus()
  const cursor = completion.start + completion.name.length
  editor.value?.setSelectionRange(cursor, cursor)
}
async function completionKeys(event) {
  if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
    event.preventDefault()
    suggest(event.currentTarget)
    return
  }
  if (!completions.value.length || event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    completions.value = []
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    activeCompletion.value = (activeCompletion.value + delta + completions.value.length) % completions.value.length
    await nextTick()
    completionList.value?.children[activeCompletion.value]?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter' || event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    await applyCompletion(completions.value[activeCompletion.value])
  } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    completions.value = []
  }
}
async function formatCode() {
  const target = props.input
  const source = target.expression
  formatting.value = true
  editorNotice.value = ''
  try {
    const formatted = await formatExpressionCode(source)
    if (props.input === target && target.expression === source) target.expression = formatted
  } catch {
    if (props.input === target && target.expression === source)
      editorNotice.value = 'Could not format this expression. Check its syntax and length.'
  } finally {
    formatting.value = false
  }
}
function bindingValue(binding) {
  if (binding.source === 'variable') {
    const variable = props.variables.find(item => item.id === binding.variableId)
    if (variable?.source === 'static') return staticVariableValue(variable)
    throw new Error(`No preview value for shared variable "${variable?.name ?? binding.variableId}". Enter a sample for "${binding.name}".`)
  }
  const result = props.results?.find(item => item.id === binding.stepId && item.status === 'completed')
  try { return readPointer(result?.response?.json, binding.responsePointer) }
  catch {
    const origin = props.steps.find(item => item.id === binding.stepId)
    throw new Error(`Missing "${binding.name}" from "${origin?.label ?? binding.stepId}" at ${binding.responsePointer || '(whole response)'}. Enter a sample or run the earlier step.`)
  }
}
const jsonText = value => JSON.stringify(value, null, 2)
const displayJson = value => {
  const text = jsonText(value)
  return text.length > 4000 ? text.slice(0, 4000) + '…' : text
}
function runPreview() {
  try {
    validateExpression(props.input)
    const values = Object.create(null)
    for (const binding of props.input.bindings) {
      const sample = samples.value.get(binding.name)
      if (sample?.trim()) {
        try { values[binding.name] = JSON.parse(sample) }
        catch { throw new Error(`Sample for "${binding.name}" must be valid JSON.`) }
      } else values[binding.name] = bindingValue(binding)
    }
    const result = evaluateExpression(props.input.expression, values)
    const type = result === null ? 'null' : Array.isArray(result) ? 'array' : Number.isInteger(result) ? 'integer' : typeof result
    preview.value = { values, result, type, issues: schemaIssues(result, props.expectedSchema, props.resolve) }
  } catch (cause) {
    const alias = cause.path?.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0]
    const binding = props.input.bindings.find(item => item.name === alias && item.source === 'response')
    const origin = binding && props.steps.find(item => item.id === binding.stepId)
    const source = origin ? ` Source: "${origin.label}" at ${binding.responsePointer || '(whole response)'}.` : ''
    preview.value = { error: cause.message + source }
  }
}
</script>
<template>
 <fieldset class="expression-editor" :disabled="disabled" aria-label="Expression configuration">
  <div class="code-tools">
   <label :for="completionId + '-code'">Expression</label>
   <button type="button" class="secondary" :disabled="formatting || !input.expression?.trim()" @click="formatCode">
    Format code
   </button>
   <button type="button" class="secondary" title="Ctrl+Space" @click="editor.focus(); suggest(editor)">Suggestions</button>
  </div>
  <div class="code-box">
   <textarea :id="completionId + '-code'" ref="editor" v-model="input.expression"
     aria-label="Expression code" rows="5" spellcheck="false" maxlength="4096"
     :aria-controls="completions.length ? completionId : undefined"
     :aria-activedescendant="completions.length ? completionId + '-' + activeCompletion : undefined"
     aria-autocomplete="list" aria-keyshortcuts="Control+Space Meta+Space"
     placeholder="switch (invoice.status) { case 'draft': return 'review'; default: return 'skip'; }"
     @keydown="completionKeys" @input="!$event.isComposing && suggest($event.target, true)"
     @click="completions = []" @blur="completions = []" />
   <ul v-if="completions.length" :id="completionId" ref="completionList" role="listbox" aria-label="Expression suggestions">
    <li v-for="(completion, index) in completions" :id="completionId + '-' + index" :key="completion.name"
      role="option" :aria-selected="index === activeCompletion"
      @mousedown.prevent @click="applyCompletion(completion)">
     <code>{{ completion.name }}</code><small>{{ completion.kind }}</small>
    </li>
   </ul>
  </div>
  <p v-if="editorNotice" class="editor-notice" role="status">{{ editorNotice }}</p>
  <div v-for="(binding,index) in input.bindings" :key="index" class="expression-binding">
   <label>Name<input v-model="binding.name" aria-label="Expression input name" maxlength="64" placeholder="invoice"></label>
   <label>Source<select v-model="binding.source" aria-label="Expression input source"><option value="response">Earlier response</option><option value="variable">Shared variable</option></select></label>
   <template v-if="binding.source==='response'"><label>Step<select v-model="binding.stepId" aria-label="Expression source step"><option value="" disabled>Choose step</option><option v-for="other in steps.filter(item=>item.id!==step.id)" :key="other.id" :value="other.id">{{other.label}}</option></select></label><label>JSON Pointer<input v-model="binding.responsePointer" aria-label="Expression response pointer" placeholder="/status · empty = whole JSON"></label></template>
   <label v-else>Variable<select v-model="binding.variableId" aria-label="Expression variable"><option value="" disabled>Choose variable</option><option v-for="variable in variables" :key="variable.id" :value="variable.id">{{variable.name}}</option></select></label>
   <button type="button" class="secondary" :aria-label="'Remove expression input '+(index+1)" @click="input.bindings.splice(index,1)">×</button>
  </div>
  <button type="button" class="secondary" :disabled="input.bindings.length>=16" @click="add">Add expression input</button>
  <p v-if="error" class="error" role="status">{{error}}</p>
  <small>Read selected inputs by name. Return a JSON value. Supports const, if, switch and basic operators; no functions, loops, imports or browser access. {{ input.location === 'body' ? 'Body expressions take precedence over matching presets.' : 'Matching active presets override this value unless the step excludes presets.' }} Code is saved as written; keep secrets in local authorization or human inputs.</small>
  <details v-if="input.location === 'body'" class="expression-preview" @toggle="showPreview = $event.target.open">
   <summary>Preview result</summary>
   <template v-if="showPreview">
    <p>Uses the latest completed response or sample JSON entered below. Preview sends no request and samples are not saved.</p>
    <label v-for="binding in input.bindings" :key="binding.name">
     Sample for {{ binding.name }}
     <textarea :value="samples.get(binding.name) ?? ''" rows="2" maxlength="65536" spellcheck="false"
       placeholder="Optional JSON override"
       @input="samples.set(binding.name, $event.target.value); preview = null" />
    </label>
    <button type="button" class="secondary" :disabled="!!error" @click="runPreview">Evaluate expression</button>
    <p v-if="preview?.error" class="error" role="alert">{{ preview.error }}</p>
    <template v-else-if="preview">
     <template v-if="input.bindings.length"><strong>Inputs</strong><pre>{{ displayJson(preview.values) }}</pre></template>
     <strong>Result · {{ preview.type }}</strong>
     <pre>{{ displayJson(preview.result) }}</pre>
     <ul v-if="preview.issues.length" class="error"><li v-for="issue in preview.issues" :key="issue">{{ issue }}</li></ul>
    </template>
   </template>
  </details>
 </fieldset>
</template>
<style scoped>
.expression-editor { display:grid; gap:.45rem; border:0; padding:.5rem 0; margin:0; min-width:0; width:100%; }label { display:grid; gap:.2rem; min-width:0; font:.73rem system-ui; }textarea { width:100%; min-width:0; padding:.4rem; font:.75rem/1.5 ui-monospace,monospace; resize:vertical; }input,select { min-width:0; width:100%; padding:.3rem; }.expression-binding { display:flex; flex-wrap:wrap; align-items:end; gap:.35rem; }.expression-binding label { flex:1 1 7rem; }.expression-editor>button { justify-self:start; }small { color:var(--muted); font:.68rem/1.5 system-ui; }.error { margin:0; font:.72rem system-ui; }
.code-tools { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
.code-tools label { margin-inline-end: auto; }
.code-tools button { font-size: .72rem; }
.code-box { position: relative; }
.code-box ul { position: absolute; z-index: 2; inset: 100% 0 auto; max-height: 10rem; overflow: auto; list-style: none; margin: 0; padding: .2rem; background: var(--surface); border: 1px solid var(--line); border-radius: .35rem; }
.code-box li { display: flex; justify-content: space-between; gap: .5rem; padding: .25rem .35rem; cursor: pointer; }
.code-box li:hover, .code-box li[aria-selected=true] { background: var(--accent-soft); }
.editor-notice { margin: 0; font-size: .72rem; }
.expression-preview { border-top: 1px solid var(--line); padding-top: .5rem; font: .75rem system-ui; }
.expression-preview summary { cursor: pointer; }
.expression-preview label { margin-block: .4rem; }
.expression-preview strong { display: block; margin-top: .5rem; }
.expression-preview pre { background: var(--surface); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 15rem; overflow: auto; padding: .4rem; }
</style>
