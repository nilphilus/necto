const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls }) => {
  await p.route('**/openapi.json', async (route) => {
    const response = await route.fetch()
    const document = await response.json()
    document.paths['/customer'].get.parameters = [
      { in: 'query', name: 'region', schema: { type: 'string' } },
    ]
    await route.fulfill({ response, json: document })
  })
  await p.reload()
  const steps = Array.from({ length: 26 }, (_, index) => ({
    id: 'step-' + index, label: 'Request ' + (index + 1), operationKey: 'GET /customer',
    apiId: 'local', method: 'GET', path: '/customer', inputs: [], dependsOn: [],
    request: { fields: {}, body: '' },
  }))
  const scenario = {
    format: 'necto-scenario-builder', version: 7, id: 'long-workflow', name: 'Long workflow',
    variables: [], concurrency: 4, steps, connections: steps.slice(1).map((step, index) => ({
      from: steps[index].id, to: step.id,
    })),
  }
  await p.getByRole('button', { name: 'Scenarios', exact: true }).click()
  await p.locator('.library-actions input[type=file]').setInputFiles({
    name: 'long-workflow.necto.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'necto-shared-scenario', version: 1, kind: 'builder', scenario })),
  })
  await p.getByText('Imported “Long workflow” · 26 steps.', { exact: true }).waitFor()
  await p.getByRole('button', { name: 'Open Builder scenario Long workflow' }).click()
  await p.getByRole('button', { name: 'Connections (26)', exact: true }).click()
  const connections = p.getByRole('dialog', { name: 'Connections', exact: true })
  const list = connections.getByRole('list', { name: 'Connection list' })
  assert.equal(await list.evaluate((element) => element.scrollHeight > element.clientHeight), true)
  await list.hover()
  await p.mouse.wheel(0, 700)
  await p.waitForFunction(() => document.querySelector('.connection-list').scrollTop > 0)
  const filter = connections.getByRole('searchbox', { name: 'Filter connections' })
  await filter.fill('Request 26')
  await connections.getByRole('button', { name: 'Request 25 → Request 26', exact: true }).click()
  const editor = p.getByRole('dialog', { name: 'Request 25 → Request 26', exact: true })
  await editor.getByRole('button', { name: 'Back to connections', exact: true }).click()
  assert.equal(await filter.inputValue(), 'Request 26')
  await connections.getByRole('button', { name: 'Add connected request', exact: true }).click()
  const picker = p.getByRole('dialog', { name: 'Add connected request', exact: true })
  await picker.waitFor()
  assert.equal(await p.locator('dialog[open]').count(), 1)
  await p.keyboard.press('Escape')
  await picker.waitFor({ state: 'hidden' })
  assert.equal(await p.locator('.map-node').count(), 26)
  await p.locator('.map-node').filter({ hasText: 'Request 1' }).first().click()
  const parameter = p.locator('.step-dialog [data-parameter="query:region"]')
  const staticInput = parameter.getByRole('textbox')
  await staticInput.fill('EU')
  await parameter.getByRole('button', { name: 'Use a run-time value' }).click()
  await parameter.getByLabel('Value source').selectOption('random')
  assert.equal(await parameter.locator('.parameter-label input').count(), 0)
  await parameter.getByRole('button', { name: 'Remove input 1' }).click()
  assert.equal(await staticInput.inputValue(), 'EU')
  assert.equal(calls.length, 0)
})
