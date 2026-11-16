require('./qa-fixture.cjs').run(async({p,assert,shot})=>{
 for(const kind of ['Entity','Endpoint']){
 await p.getByRole('button',{name:kind+' graph',exact:true}).click();const canvas=p.getByLabel('Scrollable '+kind.toLowerCase()+' graph',{exact:true}),svg=canvas.locator(':scope > svg'),map=p.getByRole('group',{name:kind+' graph minimap',exact:true});await map.waitFor();const before=Number(await svg.getAttribute('width')),box=await canvas.boundingBox();await p.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await p.mouse.wheel(0,-120);await p.waitForTimeout(100);assert.ok(Number(await svg.getAttribute('width'))>before)
 await p.getByRole('button',{name:'Reset zoom',exact:true}).click();const overview=map.locator('svg');await overview.focus();await overview.press('End');await p.waitForTimeout(50);const far=await canvas.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));assert.ok(far.x>0||far.y>0);await overview.press('Home');await p.waitForTimeout(50);assert.equal(await canvas.evaluate(el=>el.scrollLeft+el.scrollTop),0);await overview.press('ArrowRight');await p.waitForTimeout(50);assert.ok(await canvas.evaluate(el=>el.scrollLeft)>0)
 if(kind==='Endpoint')await shot()
 }
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
})
