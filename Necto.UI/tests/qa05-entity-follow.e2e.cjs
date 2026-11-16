require('./qa-fixture.cjs').run(async({p,assert,shot})=>{
 await p.getByRole('button',{name:'Entity graph',exact:true}).click();await p.getByRole('button',{name:'Reset zoom',exact:true}).click();await p.getByRole('button',{name:'Inspect entity Entity00',exact:true}).click();const canvas=p.getByLabel('Scrollable entity graph',{exact:true})
 await canvas.evaluate(el=>el.scrollTo(el.scrollWidth/2,0));const before=await canvas.evaluate(el=>el.scrollLeft);await p.locator('.relationship-list button').filter({hasText:'Entity01'}).click();await p.waitForTimeout(100);const after=await canvas.evaluate(el=>el.scrollLeft);assert.notEqual(after,before)
 const viewport=await canvas.boundingBox(),active=await canvas.locator('.entity-node.active').boundingBox();assert.ok(active.x>=viewport.x-1&&active.x+active.width<=viewport.x+viewport.width+1);assert.equal(await p.getByRole('button',{name:'Reset zoom',exact:true}).innerText(),'100%');await shot()
})
