const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, builder, add, closeEditor, calls }) => {
  await builder()
  await add('Find customer')
  await closeEditor()
  await p.getByRole('button', { name: 'Scenario details', exact: true }).click(); await p.getByRole('textbox', { name: 'Scenario name', exact: true }).fill('Check customer'); await p.getByRole('dialog', { name: 'Scenario details' }).getByRole('button', { name: 'Done' }).click()
  await p.getByRole('button', { name: 'Scenario details', exact: true }).click()
  await p.getByRole('textbox', { name: 'Scenario description', exact: true }).fill('Look up a customer and inspect their ID.')
  await p.getByRole('dialog', { name: 'Scenario details' }).getByRole('button', { name: 'Done' }).click()
  await p.getByRole('button', { name: 'Save', exact: true }).click()

  await p.evaluate(() => {
    const key = 'necto:scenarios:' + location.origin + '/openapi.json'
    localStorage.setItem(key, JSON.stringify({ version: 1, scenarios: [{
      version: 1, id: 'quick-customer', name: 'Quick customer check', steps: [{
        operationKey: 'GET /customer', apiId: 'local', method: 'GET', path: '/customer',
        name: 'Find customer', fields: {}, body: '', bindings: [],
      }],
    }] }))
  })

  await p.reload()
  await p.getByRole('button', { name: 'Scenarios', exact: true }).click()
  const card = p.locator('.scenario-card').filter({ has: p.getByRole('heading', { name: 'Check customer', exact: true }) })
  const quick = p.locator('.scenario-card').filter({ has: p.getByRole('heading', { name: 'Quick customer check' }) })
  await quick.getByText('Find customer', { exact: true }).first().waitFor()
  await card.getByText('Look up a customer and inspect their ID.', { exact: true }).waitFor()
  const filter = p.getByRole('searchbox', { name: 'Filter saved scenarios' })
  await filter.fill('inspect their ID')
  await quick.waitFor({ state: 'hidden' })
  await card.waitFor()
  await filter.fill('no matching scenario')
  await p.getByText('No saved scenarios match your search.', { exact: true }).waitFor()
  await card.waitFor({ state: 'hidden' })
  await filter.fill('Check customer')
  await card.getByRole('button', { name: 'Open Builder scenario Check customer', exact: true }).click()
  await p.getByRole('heading', { name: 'Scenario Builder', exact: true }).waitFor()
  assert.equal(await p.locator('.scenario-title').innerText(), 'Check customer')

  await p.getByRole('button', { name: '← Scenarios', exact: true }).click()
  assert.equal(await filter.inputValue(), 'Check customer')
  await filter.fill('')
  await quick.waitFor()
  await card.getByRole('button', { name: 'Review and run Check customer', exact: true }).click()
  const review = p.getByRole('dialog', { name: 'Review scenario run', exact: true })
  await review.waitFor()
  assert.equal(calls.length, 0)
  await review.getByRole('button', { name: 'Run scenario', exact: true }).click()
  await p.locator('.builder-run-status').filter({ hasText: '1 / 1 completed' }).waitFor()
  assert.deepEqual(calls.map((call) => call.path), ['/customer'])

  await p.getByRole('button', { name: '← Scenarios', exact: true }).click()
  await card.getByRole('button', { name: 'Run Builder scenario Check customer', exact: true }).click()
  await p.locator('.builder-run-status').filter({ hasText: '1 / 1 completed' }).waitFor()
  assert.equal(await review.isVisible(), false)
  assert.deepEqual(calls.map((call) => call.path), ['/customer', '/customer'])

  await p.setViewportSize({ width: 390, height: 844 })
  await p.getByRole('button', { name: '← Scenarios', exact: true }).click()
  await card.waitFor()
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await quick.getByRole('button', { name: 'Run quick scenario Quick customer check' }).click()
  assert.equal(await quick.getByRole('button', { name: 'Run scenario', exact: true }).count(), 0)
  await quick.getByRole('status').getByText('completed', { exact: true }).waitFor()
  assert.deepEqual(calls.map((call) => call.path), ['/customer', '/customer', '/customer'])
  const [definition] = await Promise.all([
    p.waitForEvent('download'),
    card.getByRole('button', { name: 'Export', exact: true }).click(),
  ])
  assert.match(definition.suggestedFilename(), /^builder-check-customer-.+\.json$/)
  await card.getByRole('button', { name: 'Delete Builder scenario Check customer' }).click()
  await card.waitFor({ state: 'detached' })

})
