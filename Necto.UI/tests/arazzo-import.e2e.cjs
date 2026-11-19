const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert, calls, execute }) => {
  await p.getByRole('button', { name: 'Scenarios', exact: true }).click()
  await p.locator('.library-actions input[type=file]').setInputFiles({
    name: 'demo.arazzo.yaml', mimeType: 'application/yaml', buffer: Buffer.from(`
arazzo: 1.0.1
info: { title: Fixture, version: "1" }
sourceDescriptions: [{ name: demo, type: openapi, url: ./openapi.json }]
workflows:
  - workflowId: unsupported-retry
    steps:
      - stepId: retry
        operationId: Customer
        onFailure: [{ name: retry, type: retry, retryLimit: 2 }]
  - workflowId: create-invoice
    summary: Create invoice from customer
    steps:
      - stepId: customer
        operationId: Customer
        outputs:
          id: $response.body#/id
      - stepId: invoice
        operationId: Create
        requestBody:
          contentType: application/json
          payload:
            name: From Arazzo
            customerId: $steps.customer.outputs.id
        successCriteria:
          - condition: $statusCode == 200
`),
  })
  const dialog = p.getByRole('dialog', { name: 'Import Arazzo workflow' })
  await dialog.getByRole('button', { name: 'Import and open' }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Arazzo step 1 (retry)' }).waitFor()
  assert.equal(calls.length, 0)
  await dialog.getByRole('combobox', { name: 'Workflow' }).selectOption('create-invoice')
  await dialog.getByRole('list', { name: 'Workflow steps' }).getByText('invoice', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Import and open' }).click()
  await p.getByRole('heading', { name: 'Scenario Builder', exact: true }).waitFor()
  assert.equal(await p.getByRole('textbox', { name: 'Scenario name', exact: true }).inputValue(), 'Create invoice from customer')
  assert.equal(calls.length, 0)
  await execute(2)
  assert.deepEqual(calls, [
    { path: '/customer', body: undefined },
    { path: '/invoices', body: { name: 'From Arazzo', customerId: 42 } },
  ])
})
