<script setup>
import { computed, ref, watch, inject } from 'vue'
import { bodyAt, bindingAt, writeBody, sourceFor, schemaView, removeBodyField, removeArrayItem, pointer, prefix, inferVariant, BODY_VALUE, variantTemplate } from './bodySchema.js'
import { pointerParts, readPointer } from './pointers.js'
import { schemaTemplate } from '../request-runner/schemaTemplate.js'
import { generators } from './generation.js'
import { pointerHints } from './pointerHints.js'
const props=defineProps({step:Object,operation:Object,raw:Object,path:{type:Array,default:()=>[]},name:String,required:Boolean,steps:Array,operations:Array,variables:Array,results:Array,disabled:Boolean,depth:{type:Number,default:()=>0},ancestors:{type:Array,default:()=>[]}})
const emit=defineEmits(['raw'])
const body=inject(BODY_VALUE,null)
function current(){if(!body)return bodyAt(props.step,props.path);try{return readPointer(body.value,pointer(props.path))}catch{return undefined}}
const variants=computed(()=>{const raw=props.operation.resolve(props.raw);return raw?.oneOf??raw?.anyOf??[]})
const variant=computed(()=>inferVariant(props.operation,props.raw,current(),props.step.request.bodyVariants?.[pointer(props.path)]))
const error=ref(''),open=ref(props.depth<2),visible=ref(50),itemsVisible=ref(10)
const schema=computed(()=>schemaView(props.operation,props.raw,variant.value))
const type=computed(()=>{const t=schema.value.type;return Array.isArray(t)?t.find(t=>t!=='null'):t??(Object.keys(schema.value.properties??{}).length?'object':schema.value.items?'array':current()!==undefined?(Array.isArray(current())?'array':current()===null?'null':typeof current()):'string')})
const nullable=computed(()=>schema.value.nullable||schema.value.type?.includes?.('null'))
const value=computed(current),binding=computed(()=>bindingAt(props.step,props.path)),source=computed(()=>binding.value?.source??'static')
const properties=computed(()=>Object.entries(schema.value.properties??{}))
const recursive=computed(()=>props.depth>=16||props.ancestors.includes(props.raw?.$ref??props.raw))
const disabled=computed(()=>props.disabled||schema.value.readOnly)
const jsonText=ref('')
watch(value,value=>{jsonText.value=value===undefined||!(recursive.value||type.value==='object'&&!properties.value.length)?'':JSON.stringify(value,null,2)},{immediate:true})
function attempt(action){error.value='';try{action()}catch(cause){error.value=cause.message}}
function set(value){attempt(()=>writeBody(props.step,props.operation,props.path,value))}
function choose(source,element){attempt(()=>{
 const affected=props.step.inputs.filter(input=>input.location==='body'&&input.pointer!==pointer(props.path)&&(prefix(props.path,pointerParts(input.pointer))||prefix(pointerParts(input.pointer),props.path)))
 if(affected.length&&!window.confirm('Replace the configured sources inside this field?'))return
 sourceFor(props.step,props.operation,props.path,source,{...schema.value,type:type.value})
});element.value=binding.value?.source??'static'}
function include(enabled,element){attempt(()=>{if(!enabled&&props.step.inputs.some(input=>input.location==='body'&&prefix(props.path,pointerParts(input.pointer)))&&!window.confirm('Remove this field and its configured input sources?'))return;if(enabled)writeBody(props.step,props.operation,props.path,schemaTemplate(props.operation,schema.value));else removeBodyField(props.step,props.path)});element.checked=value.value!==undefined}
function addItem(){attempt(()=>{const items=[...(value.value??[])];items.push(schemaTemplate(props.operation,schema.value.items??{}));writeBody(props.step,props.operation,props.path,items);itemsVisible.value=Math.max(itemsVisible.value,items.length)})}
function removeItem(index){attempt(()=>{if(!window.confirm('Remove this item and any configured input sources inside it?'))return;removeArrayItem(props.step,props.operation,props.path,index)})}
function hints(){const from=props.steps.find(step=>step.id===binding.value?.stepId);return pointerHints(props.operations.find(operation=>operation.key===from?.operationKey),props.results?.find(result=>result.id===from?.id)?.response?.json)}
function changeVariant(index,element){attempt(()=>{if(!window.confirm('Replace this field with the selected schema variant?'))return;const selected=schemaView(props.operation,props.raw,Number(index));const next=variantTemplate(props.operation,props.raw,Number(index));writeBody(props.step,props.operation,props.path,next);sourceFor(props.step,props.operation,props.path,'static',selected);props.step.request.bodyVariants={...props.step.request.bodyVariants,[pointer(props.path)]:Number(index)}});element.value=variant.value}

</script>
<template>
 <section class="schema-field" :data-body-path="pointer(path)" :class="{'root-field':!path.length}">
  <div class="field-heading"><button v-if="['object','array'].includes(type)&&source==='static'" type="button" class="expand-field" :aria-expanded="open" :aria-label="'Expand '+name" @click="open=!open">{{open?'▾':'▸'}}</button><strong>{{name}}</strong><span class="schema-type">{{type}}{{schema.format?' · '+schema.format:''}}{{required?' · required':''}}{{schema.readOnly?' · read only':''}}</span><label v-if="path.length&&!required&&source==='static'&&!schema.readOnly" class="include-field"><input type="checkbox" :checked="value!==undefined" :disabled="disabled" :aria-label="'Include '+name" @change="include($event.target.checked,$event.target)">Include</label></div>
  <small v-if="schema.description" class="description" :title="schema.description">{{schema.description}}</small>
  <fieldset :disabled="disabled" class="field-editor"><label>Value source<select :value="source" :aria-label="'Source for '+name" @change="choose($event.target.value,$event.target)"><option value="static">Static value</option><option value="response">Previous response</option><option value="variable">Shared variable</option><option v-if="path.length" value="preset">Run preset</option><option value="generate">Generate data</option><option value="human">Ask at run time</option></select></label>
   <template v-if="source==='static'"><small v-if="value===null">JSON null</small>
    <select v-if="schema.enum" :value="JSON.stringify(value)" :aria-label="'Value for '+name" @change="set(JSON.parse($event.target.value))"><option v-if="value===undefined" value="" disabled>Choose value</option><option v-for="item in schema.enum" :key="JSON.stringify(item)" :value="JSON.stringify(item)">{{typeof item==='object'?JSON.stringify(item):String(item)}}</option></select>
    <select v-else-if="type==='boolean'" :value="value===undefined?'':JSON.stringify(value)" :aria-label="'Value for '+name" @change="set(JSON.parse($event.target.value))"><option value="" disabled>Not set</option><option value="true">true</option><option value="false">false</option><option v-if="nullable" value="null">null</option></select>
    <input v-else-if="type==='number'||type==='integer'" :value="value??''" type="number" :step="type==='integer'?1:'any'" :aria-label="'Value for '+name" @change="event=>set(event.target.value===''?null:Number(event.target.value))">
    <input v-else-if="type==='string'" :value="value??''" :type="schema.writeOnly||schema.format==='password'?'password':'text'" :aria-label="'Value for '+name" @input="set($event.target.value)">
    <button v-if="['object','array'].includes(type)&&value===null" type="button" class="secondary" @click="attempt(()=>set(schemaTemplate(operation,schema)))">Create {{type}}</button><button v-if="nullable&&value!==null" type="button" class="secondary" @click="set(null)">Set null</button>
   </template>
   <template v-else-if="source==='response'"><label>Source step<select v-model="binding.stepId" :aria-label="'Response step for '+name"><option value="" disabled>Choose request</option><option v-for="other in steps.filter(other=>other.id!==step.id)" :key="other.id" :value="other.id">{{other.label}}</option></select></label><label>Response field<input v-model="binding.responsePointer" :list="'schema-path-'+binding.stepId+'-'+pointer(path)" :aria-label="'Response field for '+name" placeholder="/id"></label><datalist :id="'schema-path-'+binding.stepId+'-'+pointer(path)"><option v-for="hint in hints()" :key="hint" :value="hint" /></datalist></template>
   <label v-else-if="source==='variable'">Variable<select v-model="binding.variableId" :aria-label="'Variable for '+name"><option value="" disabled>Choose variable</option><option v-for="variable in variables" :key="variable.id" :value="variable.id">{{variable.name}}</option></select></label>
   <p v-else-if="source==='preset'" class="field-note">Select a matching preset in Review & run. This field must be filled by that preset.</p>
   <template v-else-if="source==='generate'"><label>Generator<select v-model="binding.generator" :aria-label="'Generator for '+name"><option v-for="[id,label] in generators" :key="id" :value="id">{{label}}</option></select></label><input v-if="binding.generator==='regex'" v-model="binding.pattern" :aria-label="'Pattern for '+name"></template>
   <template v-else-if="source==='human'"><label>Question<input v-model="binding.prompt" :aria-label="'Question for '+name"></label><label>Type<select v-model="binding.valueType"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="json">JSON</option></select></label></template>
  </fieldset>
  <div v-if="source==='static'&&open&&value!==null" class="schema-children">
   <label v-if="variants.length">Schema variant<select :value="variant" :disabled="disabled" :aria-label="'Variant for '+name" @change="changeVariant($event.target.value,$event.target)"><option v-for="(item,index) in variants" :key="index" :value="index">{{operation.resolve(item)?.title??item.$ref?.split('/').at(-1)??('Variant '+(index+1))}}</option></select></label>
   <template v-if="recursive"><p class="field-note">Recursive or deeply nested schema. Edit this subtree as JSON.</p><textarea v-model="jsonText" :disabled="disabled" :aria-label="'JSON value for '+name" rows="3" @change="attempt(()=>set(JSON.parse(jsonText)))" /></template>
   <template v-else-if="type==='object'&&properties.length">
    <BodySchemaField v-for="[key,property] in properties.slice(0,visible)" :key="key" :raw="property" :operation="operation" :step="step" :path="[...path,key]" :name="key" :required="schema.required.includes(key)" :steps="steps" :operations="operations" :variables="variables" :results="results" :disabled="disabled" :depth="depth+1" :ancestors="[...ancestors,raw.$ref??raw]" @raw="emit('raw')" />
    <button v-if="visible<properties.length" type="button" class="secondary" @click="visible+=50">Show next fields ({{visible}} / {{properties.length}})</button>
    <button v-if="schema.additionalProperties" type="button" class="secondary" @click="emit('raw')">Edit additional properties in Raw JSON</button>
   </template>
   <template v-else-if="type==='array'"><div v-for="(item,index) in (Array.isArray(value)?value:[]).slice(0,itemsVisible)" :key="index" class="array-item"><BodySchemaField :raw="schema.items??{}" :operation="operation" :step="step" :path="[...path,index]" :name="'Item '+(index+1)" :required="true" :steps="steps" :operations="operations" :variables="variables" :results="results" :disabled="disabled" :depth="depth+1" :ancestors="[...ancestors,raw.$ref??raw]" @raw="emit('raw')" /><button type="button" class="secondary" :disabled="disabled" :aria-label="'Remove '+name+' item '+(index+1)" @click="removeItem(index)">Remove item</button></div><button v-if="Array.isArray(value)&&value.length>itemsVisible" type="button" class="secondary" @click="itemsVisible+=10">Show more items ({{itemsVisible}} / {{value.length}})</button><button type="button" class="secondary" :disabled="disabled" :aria-label="'Add item to '+name" @click="addItem">+ Add item</button></template>
   <template v-else-if="type==='object'"><textarea v-model="jsonText" :disabled="disabled" :aria-label="'JSON value for '+name" rows="3" @change="attempt(()=>set(JSON.parse(jsonText)))" /></template>
  </div>
  <p v-if="error" class="error" role="alert">{{error}}</p>
 </section>
</template>
<style scoped>
.schema-field { min-width:0; padding:.6rem 0; border-bottom:1px solid var(--line); }.root-field { border:0; }.field-heading { display:flex; align-items:center; flex-wrap:wrap; gap:.3rem; font-size:.78rem; }.schema-type { font-size:.65rem; color:var(--muted); }.include-field { margin-left:auto; display:flex; gap:.2rem; align-items:center; font-size:.65rem; }.expand-field { padding:.15rem .3rem; }.description { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:.68rem; color:var(--muted); margin:.25rem 0; }.field-editor { border:0; padding:0; min-width:0; display:grid; gap:.4rem; margin:.4rem 0 0; }label { display:grid; gap:.2rem; font-size:.7rem; }input,select,textarea { width:100%; min-width:0; padding:.35rem; }.schema-children { padding-left:.65rem; border-left:2px solid var(--accent-soft); margin-top:.4rem; }.field-note { color:var(--muted); font-size:.7rem; margin:.3rem 0; }.array-item { padding-bottom:.5rem; }.array-item > button { font-size:.65rem; }.error { font-size:.73rem; margin:.3rem 0; }
@container (min-width:650px) { .field-editor { grid-template-columns:minmax(12rem,30%) minmax(0,1fr); align-items:end; } }
</style>
