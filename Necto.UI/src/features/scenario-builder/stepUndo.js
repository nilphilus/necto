import { inputSources } from './variables.js'
const usesStep=(input,id)=>inputSources(input).some(source=>source.source==='response'&&source.stepId===id)
import { validateBlueprint } from './model.js'
const clone=value=>value instanceof Blob?value:Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)])):value
const validationMessage=blueprint=>{try{validateBlueprint(blueprint);return ''}catch(cause){return cause.message}}
export function removeStepDraft(blueprint,id) {
 const index=blueprint.steps.findIndex(step=>step.id===id)
 if(index<0)throw new Error('Step no longer exists.')
 const snapshot={validation:validationMessage(blueprint),scenarioId:blueprint.id,index,step:clone(blueprint.steps[index]),connections:clone(blueprint.connections.filter(edge=>edge.from===id||edge.to===id)),consumers:blueprint.steps.filter(step=>step.id!==id).map(step=>({id:step.id,inputs:clone(step.inputs.filter(input=>usesStep(input,id))),dependsOn:step.dependsOn.includes(id)}))}
 const next={...blueprint,connections:blueprint.connections.filter(edge=>edge.from!==id&&edge.to!==id),steps:blueprint.steps.filter(step=>step.id!==id).map(step=>({...step,dependsOn:step.dependsOn.filter(dependency=>dependency!==id),inputs:step.inputs.filter(input=>!usesStep(input,id))}))}
 return {snapshot,next}
}
export function restoreStepDraft(blueprint,snapshot) {
 if(blueprint.id!==snapshot.scenarioId||blueprint.steps.some(step=>step.id===snapshot.step.id))throw new Error('This removed step belongs to another draft or has already been restored.')
 const steps=blueprint.steps.map(step=>{const consumer=snapshot.consumers.find(item=>item.id===step.id);return consumer?{...step,inputs:[...step.inputs,...clone(consumer.inputs)],dependsOn:consumer.dependsOn?[...new Set([...step.dependsOn,snapshot.step.id])]:step.dependsOn}:step})
 steps.splice(Math.min(snapshot.index,steps.length),0,clone(snapshot.step))
 const ids=new Set(steps.map(step=>step.id)),existing=new Set(blueprint.connections.map(edge=>JSON.stringify([edge.from,edge.to])))
 const next={...blueprint,steps,connections:[...blueprint.connections,...clone(snapshot.connections).filter(edge=>(edge.from===null||ids.has(edge.from))&&ids.has(edge.to)&&!existing.has(JSON.stringify([edge.from,edge.to])))]}
 const problem=validationMessage(next)
 if(problem&&problem!==snapshot.validation)throw new Error(problem)
 return next
}
