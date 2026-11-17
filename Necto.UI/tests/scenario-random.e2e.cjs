const {run}=require('./qa-fixture.cjs')
run(async({p,assert,builder,add,execute,review,save,saved,shot,calls})=>{
 await builder();await p.getByRole('textbox',{name:'Scenario name',exact:true}).fill('Pick an invoice row');await add('Invoice rows');await add('Create invoice')
 const body=p.getByRole('region',{name:'Request body schema',exact:true}),field=pointer=>body.locator(`[data-body-path="${pointer}"]`)
 await body.getByRole('combobox',{name:'Source for customerId',exact:true}).selectOption('random')
 const random=field('/customerId').locator('.random-source')
 await random.getByRole('combobox',{name:'Random source step',exact:true}).selectOption({label:'Invoice rows'})
 await random.getByRole('textbox',{name:'Random item pointer',exact:true}).fill('/id')
 await save();const definition=await saved();assert.equal(definition.version,7);assert.equal(definition.steps[1].inputs[0].source,'random');assert.equal(calls.length,0)
 await random.scrollIntoViewIfNeeded();await shot();await execute(2);assert.equal(calls[0].path,'/rows');assert.equal(calls[1].path,'/invoices');assert.ok(Number.isInteger(calls[1].body.customerId));assert.ok(calls[1].body.customerId>=0&&calls[1].body.customerId<30)
 // One selected record supplies both fields via a shared random variable.
 await p.getByRole('button',{name:'Variables (0)',exact:true}).click();const vars=p.getByRole('dialog',{name:'Shared variables',exact:true})
 await vars.getByRole('button',{name:'Add variable',exact:true}).click();await vars.getByLabel('Variable name',{exact:true}).fill('selectedRow');await vars.getByLabel('Variable source',{exact:true}).selectOption('random')
 await vars.getByLabel('Random source step',{exact:true}).selectOption({label:'Invoice rows'});await vars.getByRole('button',{name:'Apply variables',exact:true}).click()
 for(const [pointer,name,code] of [['/customerId','customerId','return selected.id;'],['/name','name','return selected.name;']]){
  await body.getByRole('combobox',{name:'Source for '+name,exact:true}).selectOption('expression')
  const editor=field(pointer).locator('.expression-editor');await editor.getByLabel('Expression code',{exact:true}).fill(code);await editor.getByRole('button',{name:'Add expression input',exact:true}).click();await editor.getByLabel('Expression input name',{exact:true}).fill('selected');await editor.getByLabel('Expression input source',{exact:true}).selectOption('variable');await editor.getByLabel('Expression variable',{exact:true}).selectOption({label:'selectedRow'})
 }
 await save();const shared=await saved();assert.equal(shared.variables[0].source,'random');assert.equal(shared.variables[0].itemPointer,'')
 await execute(2);const sent=calls.at(-1).body;assert.equal(sent.name,'Invoice '+sent.customerId)
 // Reload retains the random variable definition, not the selected response data.
 await p.reload();await p.getByLabel('Saved builder scenarios',{exact:true}).selectOption({label:definition.name});await p.getByRole('button',{name:'Variables (1)',exact:true}).click();await vars.getByLabel('Random array pointer',{exact:true}).fill('/0');await vars.getByRole('button',{name:'Apply variables',exact:true}).click()
 const before=calls.length,dialog=await review();await dialog.getByRole('button',{name:'Run scenario',exact:true}).click();await p.locator('.builder-run-status').filter({hasText:'non-empty JSON array'}).waitFor();assert.equal(calls.length,before+1);assert.equal(calls.at(-1).path,'/rows')
 console.log('PASS: direct random field, shared record coherence, v7 persistence and invalid-array POST blocking')
})
