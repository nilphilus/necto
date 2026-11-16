import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyAt, writeBody, sourceFor, schemaView, removeArrayItem, inferVariant, variantTemplate } from './bodySchema.js'
import { newBlueprint,newStep,validateBlueprint } from './model.js'
import { savedBlueprint } from './useBuilder.js'
import { prepareBlueprint } from './runner.js'
import { resolveRequestValues } from '../request-runner/request.js'
import { schemaTemplate } from '../request-runner/schemaTemplate.js'
const operation={key:'POST /test',apiId:'local',method:'POST',path:'/test',name:'Test',parameters:[],servers:[],tags:['Test'],resolve:value=>value,requestBody:{content:{'application/json':{schema:{type:'object',properties:{code:{type:'string'}}}}}}}
const step=()=>newStep(operation,{fields:{},body:'{"items":[{"id":1},{"id":2},{"id":3}]}'});
test('schema fields write typed values and replace overlapping bindings atomically',()=>{const s=step();writeBody(s,operation,['enabled'],false);assert.equal(bodyAt(s,['enabled']),false);sourceFor(s,operation,['items',1,'id'],'human',{type:'integer'});assert.equal(s.inputs[0].valueType,'number');sourceFor(s,operation,['items'],'variable',{type:'array',items:{type:'object'}});assert.equal(s.inputs.length,1);assert.equal(s.inputs[0].pointer,'/items');sourceFor(s,operation,['items'],'static',{});assert.equal(s.inputs.length,0)})
test('removing an array item drops its bindings and reindexes later bindings',()=>{const s=step();sourceFor(s,operation,['items',1,'id'],'human',{type:'integer'});sourceFor(s,operation,['items',2,'id'],'generate',{type:'integer'});removeArrayItem(s,operation,['items'],1);assert.deepEqual(bodyAt(s,['items']),[{id:1},{id:3}]);assert.equal(s.inputs.length,1);assert.equal(s.inputs[0].pointer,'/items/1/id')})
test('allOf and a selected variant expose all fields and generate the selected template',()=>{const raw={allOf:[{type:'object',properties:{base:{type:'string'}},required:['base']}],oneOf:[{type:'object',properties:{first:{type:'string'}}},{type:'object',properties:{second:{type:'integer'}}}]};const view=schemaView(operation,raw,1);assert.deepEqual(Object.keys(view.properties),['base','second']);assert.deepEqual(view.required,['base']);assert.deepEqual(JSON.parse(JSON.stringify(schemaTemplate(operation,view))),{base:'string',second:0});assert.equal(inferVariant(operation,raw,{second:42}),1)})
test('schema variant metadata and explicit preset sources round-trip; missing run presets fail before requests',()=>{const s=step();s.request.bodyVariants={'':1};sourceFor(s,operation,['code'],'preset',{type:'string'});const data={...newBlueprint(),steps:[s]};validateBlueprint(data);const saved=savedBlueprint(data);assert.equal(saved.steps[0].request.bodyVariants[''],1);assert.equal(saved.steps[0].inputs[0].source,'preset');const context={operations:[operation],configuration:{apiBaseUrl:'https://api.test'},createSession:()=>({fields:{},body:''}),valuesFor:()=>new Map()};assert.throws(()=>prepareBlueprint(data,context),/select a matching run preset/);context.valuesFor=()=>resolveRequestValues(operation,new Map([['code',{value:'FROM-PRESET'}]]));assert.equal(prepareBlueprint(data,context)[0].inputs.length,0)})


test('raw edits and discriminator variants retain the correct schema selection',()=>{
 const raw={oneOf:[{type:'object',properties:{a:{type:'string'}}},{type:'object',properties:{b:{type:'integer'}}}]};assert.equal(inferVariant(operation,raw,{a:'raw edit'},1),0)
 const schemas={business:{type:'object',properties:{company:{type:'string'}}},person:{type:'object',properties:{name:{type:'string'}}}},op={...operation,resolve:value=>value?.$ref?schemas[value.$ref]:value},discriminated={discriminator:{propertyName:'kind',mapping:{business:'business',person:'person'}},oneOf:[{$ref:'business'},{$ref:'person'}]}
 assert.deepEqual(JSON.parse(JSON.stringify(variantTemplate(op,discriminated,1))),{name:'string',kind:'person'});assert.equal(inferVariant(op,discriminated,{kind:'person'},0),1)
})
