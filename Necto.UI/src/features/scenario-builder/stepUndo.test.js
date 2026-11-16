import test from 'node:test'
import assert from 'node:assert/strict'
import { newBlueprint,newStep } from './model.js'
import { removeStepDraft,restoreStepDraft } from './stepUndo.js'
const step=id=>({...newStep({name:id,key:id,method:'GET',path:'/'+id},{fields:{},body:'{}'}),id})
test('undo restores request, placement, timing and removed response bindings while keeping later edits',()=>{
 const a={...step('a'),position:{x:500,y:80}},b=step('b');b.inputs=[{source:'response',stepId:'a',responsePointer:'/id',location:'body',pointer:'/id'}]
 const blueprint={...newBlueprint(),steps:[a,b],connections:[{from:'a',to:'b',delayMs:300}]}
 const {snapshot,next}=removeStepDraft(blueprint,'a');assert.equal(next.steps[0].inputs.length,0)
 next.steps[0].label='Edited later'
 const restored=restoreStepDraft(next,snapshot)
 assert.deepEqual(restored.steps[0],a);assert.equal(restored.steps[1].label,'Edited later');assert.deepEqual(restored.steps[1].inputs,b.inputs);assert.deepEqual(restored.connections,blueprint.connections)
 assert.throws(()=>restoreStepDraft({...next,id:'different'},snapshot),/another draft/)
})
test('undo rejects conflicting new bindings without changing the current draft',()=>{
 const a=step('a'),b=step('b');b.inputs=[{source:'response',stepId:'a',responsePointer:'/id',location:'body',pointer:'/id'}]
 const {snapshot,next}=removeStepDraft({...newBlueprint(),steps:[a,b]},'a')
 next.steps[0].inputs=[{source:'human',location:'body',pointer:'/id',prompt:'New value',valueType:'text'}]
 assert.throws(()=>restoreStepDraft(next,snapshot));assert.equal(next.steps.length,1)
})

test('undo can restore the original unfinished draft without making it executable',()=>{
 const blueprint={...newBlueprint(),steps:[{...step('a'),label:''}]}
 const {snapshot,next}=removeStepDraft(blueprint,'a')
 const restored=restoreStepDraft(next,snapshot);assert.equal(restored.steps[0].label,'')
})
