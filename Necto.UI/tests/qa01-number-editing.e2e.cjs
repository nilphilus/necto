require('./qa-fixture.cjs').run(async({p,assert,builder,add,save,saved,execute,shot,calls})=>{
 await builder();await add('Create invoice');const editor=p.getByRole('region',{name:'Request body schema',exact:true}),count=editor.getByRole('spinbutton',{name:'Value for customerId',exact:true})
 await count.fill('');await p.getByLabel('Step name',{exact:true}).click();assert.equal(await p.getByRole('button',{name:'Save scenario',exact:true}).isDisabled(),true);assert.equal(await p.locator('.builder-actions button').filter({hasText:'Review & run'}).isDisabled(),true);await editor.getByRole('alert').filter({hasText:'Clearing the input does not mean JSON null'}).waitFor();await shot()
 await count.fill('0');await save();assert.equal(JSON.parse((await saved()).steps[0].request.body).customerId,0)
 await count.fill('');await editor.getByRole('button',{name:'Raw JSON',exact:true}).click();await editor.locator('textarea').first().fill('{"name":"Raw negative","customerId":null,"amount":12}');await save();assert.equal(JSON.parse((await saved()).steps[0].request.body).customerId,null);await editor.locator('textarea').first().fill('{"name":"Raw valid","customerId":0,"amount":12}');assert.equal(await p.getByRole('button',{name:'Save scenario',exact:true}).isEnabled(),true)
 await editor.getByRole('button',{name:'JSON builder',exact:true}).click();assert.equal(await count.inputValue(),'0')
 const amount=editor.locator('[data-body-path="/amount"]');await amount.getByRole('button',{name:'Set null',exact:true}).click();await save();assert.equal(JSON.parse((await saved()).steps[0].request.body).amount,null)
 await execute();assert.equal(calls[0].body.customerId,0);assert.equal(calls[0].body.amount,null)
})
