const { run } = require('./qa-fixture.cjs')

run(async ({ p, assert }) => {
  await p.route('**/openapi.json', async route => {
    const response = await route.fetch()
    const document = await response.json()
    document.paths['/invoices'].post.parameters = [
      { in:'query',name:'assetId',required:true,schema:{type:'integer'} },
      { in:'header',name:'tenant',required:true,schema:{type:'string'} },
    ]
    await route.fulfill({response,json:document})
  })
  let includeAlternative = false
  let failRows = false
  await p.route('**/mappings', route => route.fulfill({json:[
    ...['id','externalId'].map(property => ({source:{operationId:'Customer',property},
      target:{operationId:'Create',location:'query',name:'assetId'}})),
    {source:{operationId:'Rows',eachItem:true,property:'id'},
      target:{operationId:'Create',location:'header',name:'tenant'}},
    ...(includeAlternative ? [{
      source:{operationId:'Missing',property:'id'},
      target:{operationId:'Create',location:'header',name:'tenant'},
    }] : []),
  ]}))
  await p.route('**/customer', route => route.fulfill({json:{id:42,externalId:84}}))
  await p.route('**/rows', route => route.fulfill(failRows
    ? {status:500,json:{message:'Temporary failure'}}
    : {json:[{name:'Record without a mapped id'}]}))
  await p.reload()
  await p.getByRole('button',{name:/POST Create invoice/}).click()
  await p.setViewportSize({width:390,height:844})
  const trigger=p.getByRole('button',{name:'Find request values',exact:true})
  const w=p.getByRole('dialog',{name:'Find request values'})
  const send=w.getByRole('button',{name:'Send request',exact:true})
  await trigger.click()
  await send.click()
  await w.getByRole('button',{name:'Select object at []',exact:true}).press('Enter')
  const choice=w.getByRole('combobox',{name:'Use response value for query assetId'})
  await choice.waitFor()
  assert.ok(await choice.evaluate(el => el === document.activeElement))
  await choice.selectOption('1')
  await w.getByText('Collected · 84 · Find customer',{exact:true}).waitFor()
  assert.equal(await w.getByText('Choose a value for: assetId',{exact:true}).count(),0)
  await w.getByText('Collected: assetId',{exact:true}).first().waitFor()
  await w.getByRole('button',{name:'Missing: tenant',exact:true}).click()
  await w.locator('.active-source').getByText('GET /rows',{exact:true}).waitFor()
  assert.ok(await send.evaluate(el => el === document.activeElement))
  await send.click()
  await w.getByText('No mapped values found in this response.',{exact:true}).waitFor()
  await w.getByText('$[*].id',{exact:true}).waitFor()
  await w.getByRole('button',{name:'Apply 1 value',exact:true}).click()
  await w.waitFor({state:'hidden'})
  await trigger.click()
  assert.equal(await w.getByRole('checkbox',{name:/assetId query/}).isChecked(),false)
  assert.equal(await w.getByRole('checkbox',{name:/tenant header/}).isChecked(),true)
  await w.getByRole('button',{name:'Sources for header tenant',exact:true}).waitFor()
  await w.locator('.active-source').getByText('Checked · no values found for tenant',{exact:true}).waitFor()
  assert.equal(await w.getByText('No mapped values found in this response.',{exact:true}).count(),0)

  await w.getByRole('button',{name:'Cancel',exact:true}).click()
  includeAlternative = true
  failRows = true
  await p.reload()
  await trigger.click()
  await w.getByRole('button',{name:'Sources for header tenant',exact:true}).click()
  await w.getByRole('button',{name:/Invoice rows/}).click()
  await send.click()
  await w.locator('.active-source').getByText('Source returned HTTP 500.',{exact:true}).waitFor()
  await w.getByRole('button',{name:'Other sources for tenant',exact:true}).click()
  const alternative = w.getByRole('button',{name:/Expected missing/})
  assert.ok(await alternative.evaluate(el => el === document.activeElement))
  failRows = false
  await send.click()
  await w.getByText('No mapped values found in this response.', { exact: true }).waitFor()
  await w.getByRole('button',{name:'Show sources for all fields',exact:true}).click()
  await w.getByRole('button',{name:/Find customer/}).click()
  await send.click()
  await w.getByRole('button',{name:'Select object at []',exact:true}).click()
  await choice.selectOption('1')
  await w.getByRole('button',{name:'Apply 1 value',exact:true}).click()
  await w.waitFor({state:'hidden'})
  await trigger.click()
  await w.locator('.active-source').getByText('GET /missing',{exact:true}).waitFor()
  await w.getByRole('button',{name:'More sources (1)',exact:true}).click()
  await w.getByRole('button',{name:/Invoice rows.*Checked/}).waitFor()
})
