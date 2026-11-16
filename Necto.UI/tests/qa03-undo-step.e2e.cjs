require('./qa-fixture.cjs').run(async({p,assert,builder,add,save,saved,shot})=>{
 await builder();await add('Create invoice');await p.getByLabel('Step name',{exact:true}).fill('Configured invoice');await p.getByRole('textbox',{name:'Value for name',exact:true}).fill('Retain this body');await save();const before=await saved()
 await p.getByRole('button',{name:'Remove step',exact:true}).click();assert.equal(await p.locator('.map-node').count(),0);await shot();await p.getByRole('button',{name:'Undo remove step',exact:true}).click();await save();assert.deepEqual((await saved()).steps,before.steps)
 await p.getByRole('button',{name:'Remove step',exact:true}).click();await p.getByRole('button',{name:'New',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Undo remove step',exact:true}).count(),0)
})
