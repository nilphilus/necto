import test from 'node:test'
import assert from 'node:assert/strict'
import { savedBlueprint } from './definition.js'
import { newBlueprint, newStep } from './model.js'
import { executeBlueprint } from './runner.js'
import { prepareBlueprint } from './prepareBlueprint.js'
import { readOperations } from '../api-catalog/catalog.js'
import { buildRequest, resolveNamedRequestValues } from '../request-runner/request.js'
const operation=extra=>({key:'POST /test',name:'Target',apiId:'local',method:'POST',path:'/test',parameters:[],servers:[],tags:['Test'],resolve:value=>value,...extra})
const presets=(...layers)=>op=>resolveNamedRequestValues(op,...layers.map((fields,index)=>({name:'Preset '+index,values:new Map(Object.entries(fields).map(([key,value])=>[key,{value}]))})))
const setup=(op,inputs,body='{}')=>{
 const data={...newBlueprint(),steps:[{...newStep(op,{fields:{},body}),id:'target',inputs}]}
 const context={operations:[op],configuration:{apiBaseUrl:'https://api.test'},createSession:()=>({fields:{},body:''}),valuesFor:()=>new Map()}
 return {data,context}
}
const input=(source,location,name,extra={})=>({source,location,name,...extra})
const bodySchema=properties=>({content:{'application/json':{schema:{type:'object',properties}}}})
const ok=json=>({ok:true,status:200,json})

test('presets win over generated/human fields and static path/query/header inputs; last selected preset wins',async()=>{
 const op=operation({path:'/test/{id}',parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}},{in:'query',name:'email',required:true,schema:{type:'string'}},{in:'header',name:'X-Code',schema:{type:'string'}}]})
 const {data,context}=setup(op,[input('generate','query','email',{generator:'email'}),input('human','header','X-Code',{prompt:'Code',valueType:'text'})])
 data.steps[0].request.fields={'path:id':'1'};context.valuesFor=presets({id:'10',email:'first@test.invalid','x-code':'preset-code'},{id:'20',email:'last@test.invalid'})
 const before=JSON.stringify(data),[step]=prepareBlueprint(data,context);assert.equal(step.inputs.length,0);const req=buildRequest(op,context.configuration,step.session,step.values)
 assert.equal(req.url.pathname,'/test/20');assert.equal(req.url.searchParams.get('email'),'last@test.invalid');assert.equal(req.options.headers.get('X-Code'),'preset-code');assert.equal(JSON.stringify(data),before)
 const result=await executeBlueprint([step],{signal:new AbortController().signal,ask:()=>assert.fail('Covered question'),generate:()=>assert.fail('Covered generator'),execute:async()=>ok({})});assert.equal(result.status,'completed')
})
test('a fully overridden missing response binding is never read; graph dependencies remain',async()=>{
 const ops=readOperations({paths:{'/source':{get:{responses:{}}},'/target/{id}':{get:{parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}],responses:{}}}}})
 const data={...newBlueprint(),steps:ops.map((op,index)=>({...newStep(op,{fields:{},body:''}),id:index?'target':'source'}))};data.steps[1].inputs=[input('response','path','id',{stepId:'source',responsePointer:'/missing'})]
 const context={operations:ops,configuration:{apiBaseUrl:'https://api.test'},createSession:()=>({fields:{},body:''}),valuesFor:presets({id:'42'})},plan=prepareBlueprint(data,context),sent=[]
 assert.deepEqual(plan[1].dependencies,['source']);assert.equal(plan[1].inputs.length,0)
 const result=await executeBlueprint(plan,{signal:new AbortController().signal,execute:async(op,session,values)=>{sent.push(buildRequest(op,context.configuration,session,values).url.pathname);return ok({})}})
 assert.equal(result.status,'completed');assert.deepEqual(sent,['/source','/target/42'])
})
test('nested and array presets override a whole dynamic JSON body while leaving unmatched generated fields',async()=>{
 const op=operation({requestBody:bodySchema({customer:{type:'object',properties:{id:{type:'integer'},name:{type:'string'}}},items:{type:'array',items:{type:'object',properties:{id:{type:'integer'},quantity:{type:'integer'}}}}})})
 const {data,context}=setup(op,[input('generate','body','',{pointer:'',generator:'uuid'})]);context.valuesFor=presets({id:'99'})
 let sent
 const result=await executeBlueprint(prepareBlueprint(data,context),{signal:new AbortController().signal,generate:async()=>({customer:{id:1,name:'Dynamic'},items:[{id:2,quantity:7},{id:3,quantity:8}]}),execute:async(op,session,values)=>{sent=JSON.parse(buildRequest(op,context.configuration,session,values).options.body);return ok({})}})
 assert.equal(result.status,'completed');assert.deepEqual(sent,{customer:{id:99,name:'Dynamic'},items:[{id:99,quantity:7},{id:99,quantity:8}]})
})
test('a body preset can cover a manually added field absent from the schema, without asking a human',async()=>{
 const op=operation({requestBody:bodySchema({})}),{data,context}=setup(op,[input('human','body','',{pointer:'/email',prompt:'Email',valueType:'text'})]);context.valuesFor=presets({email:'preset@test.invalid'})
 const [step]=prepareBlueprint(data,context);assert.equal(step.inputs.length,0)
 // Probe fields must also exist in the actual outgoing body when their dynamic source is skipped.
 const result=await executeBlueprint([step],{signal:new AbortController().signal,ask:()=>assert.fail('Covered field'),execute:async(op,session,values)=>{assert.equal(JSON.parse(buildRequest(op,context.configuration,session,values).options.body).email,'preset@test.invalid');return ok({})}})
 assert.equal(result.status,'completed')
})
test('parent body presets suppress covered child bindings and preserve types even when equal to saved values',async()=>{
 const op=operation({requestBody:bodySchema({customer:{type:'object',properties:{id:{type:'integer'},name:{type:'string'}}}})}),{data,context}=setup(op,[input('human','body','',{pointer:'/customer/id',prompt:'ID',valueType:'number'})],'{"customer":{"id":42,"name":"Saved"}}');context.valuesFor=presets({customer:'{"id":42,"name":"Preset"}'})
 const [step]=prepareBlueprint(data,context);assert.equal(step.inputs.length,0);assert.deepEqual(JSON.parse(buildRequest(op,context.configuration,step.session,step.values).options.body),{customer:{id:42,name:'Preset'}})
})
test('an uncovered shared variable still resolves; a fully overridden shared human variable does not prompt',async()=>{
 const op=operation({requestBody:bodySchema({code:{type:'string'},email:{type:'string'}})}),{data,context}=setup(op,[input('variable','body','',{pointer:'/code',variableId:'code'}),input('variable','body','',{pointer:'/email',variableId:'email'})]);data.variables=[{id:'code',name:'code',source:'human',prompt:'Code',valueType:'text'},{id:'email',name:'email',source:'generate',generator:'email'}];context.valuesFor=presets({code:'PRESET-CODE'})
 let generated=0
 const result=await executeBlueprint(prepareBlueprint(data,context),{signal:new AbortController().signal,ask:()=>assert.fail('Covered variable'),generate:async()=>{generated++;return 'generated@test.invalid'},execute:async(op,session,values)=>{assert.deepEqual(JSON.parse(buildRequest(op,context.configuration,session,values).options.body),{code:'PRESET-CODE',email:'generated@test.invalid'});return ok({})}})
 assert.equal(result.status,'completed');assert.equal(generated,1)
})
test('no presets preserves scenario inputs; an API with presets disabled receives no overrides',()=>{
 const op=operation({parameters:[{in:'query',name:'email',schema:{type:'string'}}]}),{data,context}=setup(op,[input('generate','query','email',{generator:'email'})]);const [step]=prepareBlueprint(data,context);assert.equal(step.inputs.length,1);assert.equal(step.presetOverrides.length,0)
 const external={...op,apiId:'external',configuration:{apiBaseUrl:'https://external.test',openApiUrl:'https://external.test/openapi.json'},usePresets:false};data.steps[0].apiId='external';context.operations=[external];context.valuesFor=operation=>operation.usePresets?presets({email:'override'})(operation):new Map();assert.equal(prepareBlueprint(data,context)[0].inputs.length,1)
})


test('preset values for schema-free manual targets retain JSON number and boolean types',async()=>{
 const op=operation({requestBody:bodySchema({})}),{data,context}=setup(op,[input('human','body','',{pointer:'/count',prompt:'Count',valueType:'number'}),input('human','body','',{pointer:'/enabled',prompt:'Enabled',valueType:'boolean'})]);context.valuesFor=presets({count:'42',enabled:'false'})
 const [step]=prepareBlueprint(data,context);assert.equal(step.inputs.length,0);assert.deepEqual(JSON.parse(buildRequest(op,context.configuration,step.session,step.values).options.body),{count:42,enabled:false})
})


test('JSON-looking text payloads are not treated as JSON fields when text media is selected',()=>{
 const op=operation({requestBody:{content:{'application/json':{schema:{type:'object',properties:{code:{type:'string'}}}},'text/plain':{schema:{type:'string'}}}}}),{data,context}=setup(op,[],'{"code":"original"}');data.steps[0].request.mediaType='text/plain';context.valuesFor=presets({code:'override'})
 const [step]=prepareBlueprint(data,context);assert.equal(buildRequest(op,context.configuration,step.session,step.values).options.body,'{"code":"original"}')
})

test('protected body expressions are evaluated and their results survive preset serialization', async () => {
  const op = operation({ requestBody: bodySchema({
    limits: { type: 'object', properties: { min: { type: 'integer' }, max: { type: 'integer' } } },
    name: { type: 'string' },
  }) })
  const { data, context } = setup(op, [
    input('expression', 'body', '', { pointer: '/limits/min', expression: 'return -1;', bindings: [] }),
  ], '{"limits":{"min":123,"max":20},"name":"Draft"}')
  context.valuesFor = presets({ limits: '{"min":0,"max":5}', min: '0', name: 'Preset' })
  async function actualBody(protectBodyExpressions) {
    const plan = prepareBlueprint(data, { ...context, protectBodyExpressions })
    let body
    const result = await executeBlueprint(plan, {
      signal: new AbortController().signal,
      execute: async (op, session, values) => {
        body = JSON.parse(buildRequest(op, context.configuration, session, values).options.body)
        return ok({})
      },
    })
    assert.equal(result.status, 'completed')
    return body
  }
  assert.deepEqual(await actualBody(true), { limits: { min: -1, max: 20 }, name: 'Preset' })
  assert.deepEqual(await actualBody(false), { limits: { min: 0, max: 5 }, name: 'Preset' })
  data.steps[0].inputs[0] = input('expression', 'body', '', {
    pointer: '', expression: 'return { limits: { min: -1 } };', bindings: [],
  })
  assert.deepEqual(await actualBody(true), { limits: { min: -1 } })
})

test('required JSON input can come from an active preset or a typed one-time value', () => {
 const op = operation({ requestBody: { content: { 'application/json': {
  schema: { type: 'object', required: ['count'], properties: { count: { type: 'integer' } } },
 } } } })
 const { data, context } = setup(op, [])
 assert.throws(() => prepareBlueprint(data, context), error =>
  error.missingInput && error.target.location === 'body' && error.target.name === '/count')
 context.valuesFor = presets({ count: '4' })
 const [withPreset] = prepareBlueprint(data, context)
 assert.equal(JSON.parse(withPreset.session.body).count, 4)
 data.steps[0].ignorePresets = true
 assert.equal(savedBlueprint(data).steps[0].ignorePresets, true)
 assert.throws(() => prepareBlueprint(data, context), error => error.missingInput)
 context.requestOverrides = new Map([['target', [{ location: 'body', pointer: '/count', value: 7 }]]])
 const [oneTime] = prepareBlueprint(data, context)
 assert.equal(JSON.parse(oneTime.session.body).count, 7)
 assert.equal(data.steps[0].request.body, '{}')
})

test('missing JSON properties can still be sent for an explicit validation-error scenario', () => {
 const op = operation({ requestBody: { content: { 'application/json': {
  schema: { type: 'object', required: ['count'], properties: { count: { type: 'integer' } } },
 } } } })
 const { data, context } = setup(op, [])
 data.steps[0].request.assertions = [{ kind: 'status', expected: '400' }]
 assert.doesNotThrow(() => prepareBlueprint(data, context))
})
