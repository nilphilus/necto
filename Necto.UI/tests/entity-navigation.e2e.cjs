const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../dist'),errors=[]
const schemas=Object.fromEntries(Array.from({length:80},(_,i)=>['Entity'+String(i).padStart(2,'0'),{type:'object',properties:{id:{type:'integer'},...(i<79?{next:{$ref:'#/components/schemas/Entity'+String(i+1).padStart(2,'0')}}:{})}}]))
const spec={openapi:'3.1.0',info:{title:'Large entity navigation demo',version:'1'},components:{schemas},paths:{'/entities':{get:{operationId:'GetEntities',responses:{200:{description:'Entities',content:{'application/json':{schema:{$ref:'#/components/schemas/Entity00'}}}}}}}}}
let browser,server,page,base
;(async()=>{
 server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost'),json=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value))};if(url.pathname==='/configuration')return json({openApiUrl:base+'/openapi.json',apiBaseUrl:base,endpointMappingsUrl:base+'/mappings'});if(url.pathname==='/openapi.json')return json(spec);if(url.pathname==='/mappings')return json([]);try{const file=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,file)))}catch{res.writeHead(404);res.end()}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1540,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('button',{name:'Entity graph',exact:true}).click()
 const canvas=page.getByLabel('Scrollable entity graph',{exact:true}),map=page.getByRole('group',{name:'Entity graph minimap',exact:true}),svg=canvas.locator(':scope > svg')
 await map.waitFor();assert.equal(await canvas.locator('.entity-node').count(),80)
 const state=()=>canvas.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop,w:el.clientWidth,h:el.clientHeight,sw:el.scrollWidth,sh:el.scrollHeight,scale:el.querySelector('svg').width.baseVal.value/el.querySelector('svg').viewBox.baseVal.width}))
 const box=await canvas.boundingBox(),x=Math.round(box.width*.55),y=Math.round(box.height*.4)
 await page.mouse.move(box.x+x,box.y+y)
 const before=await state()
 await page.mouse.wheel(0,-100)
 await page.waitForTimeout(100)
 assert.equal((await state()).scale,before.scale)
 await page.keyboard.down('Control')
 await page.mouse.wheel(0,-100);await page.waitForFunction(old=>document.querySelector('.graph-canvas > svg').width.baseVal.value>old,await svg.evaluate((el,scale)=>el.viewBox.baseVal.width*scale,before.scale));await page.waitForTimeout(100)
 const after=await state();assert.ok(after.scale>before.scale);assert.ok(Math.abs(after.x-Math.max(0,Math.min(after.sw-after.w,(before.x+x)/before.scale*after.scale-x)))<2);assert.ok(Math.abs(after.y-Math.max(0,Math.min(after.sh-after.h,(before.y+y)/before.scale*after.scale-y)))<2)
 for(let i=0;i<6;i++){await page.mouse.wheel(0,-100);await page.waitForTimeout(40)}
 await page.keyboard.up('Control')
 await canvas.evaluate(el=>el.scrollTo(0,0))
 const panStart=await canvas.evaluate(el=>{
   const rect=el.getBoundingClientRect()
   for(let y=120;y<el.clientHeight-140;y+=20){
     for(let x=120;x<el.clientWidth-180;x+=20){
       const target=document.elementFromPoint(rect.left+x,rect.top+y)
       if(el.contains(target)&&!target.closest('button'))return {x:rect.left+x,y:rect.top+y}
     }
   }
 })
 assert.ok(panStart)
 const selectionBeforePan=await canvas.locator('.entity-node.active').allTextContents()
 await page.mouse.move(panStart.x,panStart.y)
 await page.mouse.down()
 await page.mouse.move(panStart.x-70,panStart.y-60,{steps:5})
 await page.mouse.up()
 const panned=await state()
 assert.deepEqual([panned.x,panned.y],[Math.min(70,panned.sw-panned.w),Math.min(60,panned.sh-panned.h)])
 assert.ok(panned.x>0||panned.y>0)
 assert.deepEqual(await canvas.locator('.entity-node.active').allTextContents(),selectionBeforePan)
 const mini=map.locator('svg'),bounds=await mini.boundingBox();await mini.click({position:{x:bounds.width*.85,y:bounds.height*.85}});await page.waitForTimeout(100);const moved=await state();assert.ok(moved.x>0||moved.y>0)
 const viewport=map.locator('.map-viewport');assert.ok(Number(await viewport.getAttribute('width'))<Number(await mini.getAttribute('viewBox').then(v=>v.split(' ')[2])))
 await page.mouse.move(bounds.x+bounds.width*.8,bounds.y+bounds.height*.8);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.3,bounds.y+bounds.height*.3,{steps:5});await page.mouse.up();await page.waitForTimeout(100);const dragged=await state();assert.ok(dragged.x<moved.x||dragged.y<moved.y)
 await page.getByRole('button',{name:'Fit to view',exact:true}).click();await canvas.locator('.entity-node').first().click();assert.equal(await map.locator('.map-selected').count(),1)
 const widths=await svg.locator(':scope > path').evaluateAll(edges=>edges.map(edge=>Number(edge.getAttribute('stroke-width'))))
 assert.ok(widths.includes(1.5))
 assert.equal(widths.at(-1),4)
 assert.deepEqual(widths,[...widths].sort((a,b)=>a-b))
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Center selection',exact:true}).click();await page.getByRole('button',{name:'Zoom out',exact:true}).click()
 await page.getByRole('button',{name:'Reset zoom',exact:true}).click();assert.ok(Math.abs((await state()).scale-1)<.001)
 if(process.env.NECTO_ENTITY_SCREENSHOTS){await fs.mkdir(process.env.NECTO_ENTITY_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.NECTO_ENTITY_SCREENSHOTS,'entity-navigation.png')})}
 await page.getByRole('searchbox',{name:'Find an entity',exact:true}).fill('Entity79');assert.equal(await map.locator('.map-node,.map-selected').count(),1)
 await page.getByRole('searchbox',{name:'Find an entity',exact:true}).fill('missing-entity');await map.waitFor({state:'hidden'})
 await page.getByRole('searchbox',{name:'Find an entity',exact:true}).fill('');await page.setViewportSize({width:390,height:844});await map.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(errors,[]);console.log('PASS: 80-entity graph mouse-anchored wheel zoom, minimap click/drag navigation, selected state, fit/reset/button zoom, filters, empty graph and mobile layout.')
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:'/tmp/necto-entity-navigation-failure.png'});process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()})
