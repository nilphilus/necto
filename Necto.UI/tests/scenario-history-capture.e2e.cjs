const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls }) => {
  await p.getByRole('button', { name: /Create invoice/ }).first().click()
  const send = p.getByRole('button', { name: 'Send request', exact: true })
  for (let index = 0; index < 2; index++) {
    await Promise.all([
      p.waitForResponse((response) => new URL(response.url()).pathname === '/invoices'),
      send.click(),
    ])
    await send.waitFor()
  }
  await p.getByRole('button', { name: 'Tools', exact: true }).click()
  await p.getByRole('button', { name: 'Add last request to scenario…', exact: true }).click()
  const capture = p.getByRole('dialog', { name: 'Add to scenario', exact: true })
  await capture.getByLabel('Scenario name').fill('Invoice capture')
  await capture.getByRole('button', { name: 'Add requests', exact: true }).click()
  await p.getByText('Added to “Invoice capture”. Open it from Scenarios.', { exact: true }).waitFor()

  await p.getByRole('button', { name: 'Tools', exact: true }).click()
  await p.getByRole('button', { name: 'History (2)', exact: true }).click()
  const history = p.locator('.history-panel')
  const entries = history.locator('details').filter({ hasText: 'Restore draft inputs' })
  for (const entry of await entries.all()) {
    await entry.locator('summary').click()
    await entry.getByLabel('Select request for scenario').check()
  }
  await history.getByRole('button', { name: 'Add selected requests to scenario (2)', exact: true }).click()
  await capture.getByLabel('Scenario', { exact: true }).selectOption({ label: 'Invoice capture' })
  await capture.getByRole('button', { name: 'Add requests', exact: true }).click()

  await p.getByRole('button', { name: 'Scenarios', exact: true }).click()
  const card = p.locator('.scenario-card').filter({ hasText: 'Invoice capture' })
  await card.getByText('Builder · 3 steps', { exact: true }).waitFor()
  const [saved] = await p.evaluate(() => JSON.parse(
    Object.entries(localStorage).find(([key]) => key.startsWith('necto:scenario-builder:'))[1]
  ).blueprints)
  assert.deepEqual(saved.connections, [
    { from: saved.steps[0].id, to: saved.steps[1].id },
    { from: saved.steps[1].id, to: saved.steps[2].id },
  ])
  for (const { request } of saved.steps) {
    const body = JSON.parse(request.body)
    assert.equal(body.customerId, 7)
    assert.equal(Object.hasOwn(body, 'password'), false)
    assert.equal(Object.hasOwn(body, 'token'), false)
  }
  assert.equal(calls.length, 2)
})
