import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, ref } from 'vue'
import { importedWorkspaceId, workspaceIdentity } from './workspaceIdentity.js'
import { useScenarios } from '../scenarios/useScenarios.js'
import { useRequestRunner } from '../request-runner/useRequestRunner.js'
import { useAuthentication } from '../authentication/useAuthentication.js'
test('distinct logical API separates storage and drafts without changing transport URL', async () => {
  const stored = new Map(); globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key,value) => stored.set(key,value) }
  const configuration = ref({ openApiUrl: 'https://example.test/openapi.json' })
  stored.set('necto:scenarios:'+configuration.value.openApiUrl, JSON.stringify({version:1,scenarios:[]}))
  const scope=effectScope(); let runner,scenarios
  scope.run(()=>{runner=useRequestRunner(configuration);scenarios=useScenarios(configuration)})
  const operation={key:'GET /lookup',apiId:'local',parameters:[]}
  runner.sessionFor(operation).fields.reference='OLD'
  const id=importedWorkspaceId(configuration.value,'Partner ledger')
  assert.equal(id,importedWorkspaceId(configuration.value,'Partner ledger'))
  assert.notEqual(id,importedWorkspaceId(configuration.value,'Other API'))
  configuration.value={...configuration.value,workspaceId:id}; await nextTick()
  assert.equal(workspaceIdentity(configuration.value),id)
  assert.equal(configuration.value.openApiUrl,'https://example.test/openapi.json')
  assert.equal(runner.sessionFor(operation).fields.reference,undefined)
  assert.deepEqual(scenarios.scenarios.value,[])
  scope.stop()
})
test('same workspace retains credentials; a separate API drops them',()=>{
 const store=useAuthentication(), scheme={type:'http',scheme:'bearer'}, configuration={openApiUrl:'https://example.test/openapi.json'}
 const register=config=>store.register({id:'local',configuration:config,schemes:{bearer:scheme},origins:['https://example.test']})
 register(configuration);store.save('local','bearer',scheme,{token:'synthetic',origins:['https://example.test']})
 register(configuration);assert.ok(store.apis.get('local').credentials.bearer)
 register({...configuration,workspaceId:importedWorkspaceId(configuration,'Partner')});assert.deepEqual(store.apis.get('local').credentials,{})
 assert.throws(()=>importedWorkspaceId(configuration,' '),/workspace name/)
})
