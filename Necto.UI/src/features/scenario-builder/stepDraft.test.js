import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyStep, configureEndpoint } from './stepDraft.js'
import { newBlueprint, validateBlueprint } from './model.js'
import { savedBlueprint } from './useBuilder.js'
import { prepareBlueprint } from './runner.js'
test('empty connected requests can be saved but cannot execute until an endpoint is chosen',()=>{
 const step=emptyStep({x:600,y:250}),data={...newBlueprint(),steps:[step]};validateBlueprint(data);assert.deepEqual(savedBlueprint(data).steps[0].position,{x:600,y:250})
 assert.throws(()=>prepareBlueprint(data,{operations:[]}),/choose an endpoint/)
})
test('choosing/changing an endpoint preserves step identity and placement and resets contract-specific inputs',()=>{
 const step=emptyStep({x:500,y:300}),operation={key:'POST /customers',name:'Create customer',method:'POST',path:'/customers',apiId:'local'},session={fields:{},body:'{"name":""}'}
 const configured=configureEndpoint(step,operation,session);assert.equal(configured.id,step.id);assert.deepEqual(configured.position,step.position);assert.equal(configured.label,'Create customer');assert.equal(configured.request.body,session.body)
 configured.label='My request';configured.inputs=[{source:'human'}];const changed=configureEndpoint(configured,{...operation,key:'GET /customers',method:'GET'}, {fields:{},body:''},operation.name);assert.equal(changed.label,'My request');assert.deepEqual(changed.inputs,[])
})
test('imported manual positions must be finite and bounded',()=>{
 for(const position of [{x:-1,y:30},{x:30,y:Infinity},{x:30000,y:30}]){const data={...newBlueprint(),steps:[{...emptyStep(),position}]};assert.throws(()=>validateBlueprint(data),/position/)}
})
