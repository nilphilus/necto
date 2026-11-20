const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, builder, add, closeEditor, calls }) => {
  await builder()
  await add('Find customer')
  await closeEditor()
  await p.getByRole('textbox', { name: 'Scenario name', exact: true }).fill('Check customer')
  await p.locator('.scenario-description summary').click()
  await p.getByRole('textbox', { name: 'Scenario description', exact: true }).fill('Look up a customer and inspect their ID.')
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
  await card.getByRole('button', { name: 'Open Builder scenario Check customer', exact: true }).click()
  await p.getByRole('heading', { name: 'Scenario Builder', exact: true }).waitFor()
  assert.equal(await p.getByRole('textbox', { name: 'Scenario name', exact: true }).inputValue(), 'Check customer')

  await p.getByRole('button', { name: '← Scenarios', exact: true }).click()
  await card.getByRole('button', { name: 'Review and run Check customer', exact: true }).click()
  const review = p.getByRole('dialog', { name: 'Review scenario run', exact: true })
  await review.waitFor()
  assert.equal(calls.length, 0)
  await review.getByRole('button', { name: 'Run scenario', exact: true }).click()
  await p.locator('.builder-run-status').filter({ hasText: '1 / 1 completed' }).waitFor()
  assert.deepEqual(calls.map((call) => call.path), ['/customer'])

  await p.setViewportSize({ width: 390, height: 844 })
  await p.getByRole('button', { name: '← Scenarios', exact: true }).click()
  await card.waitFor()
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await quick.getByRole('button', { name: 'Run quick scenario Quick customer check' }).click()
  assert.equal(await quick.getByRole('button', { name: 'Run scenario', exact: true }).count(), 0)
  await quick.getByRole('status').getByText('completed', { exact: true }).waitFor()
  assert.deepEqual(calls.map((call) => call.path), ['/customer', '/customer'])
})
