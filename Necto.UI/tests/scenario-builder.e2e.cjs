const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../dist'),output=process.env.NECTO_BUILDER_SCREENSHOTS
const errors=[],calls=[],events=[];let page,browser,server,base,active=0,peak=0
const json={description:'Success',content:{'application/json':{schema:{type:'object'}}}}
const op=(name,extra={})=>({operationId:name,summary:name,tags:['Workflow'],responses:{200:json},...extra})
const document={openapi:'3.1.0',info:{title:'Commerce API',version:'1'},paths:{
 '/customers':{get:op('Find customer')},'/inventory':{get:op('Check inventory')},
 '/orders':{post:op('Create order',{requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{customerId:{type:'integer'},sku:{type:'string'},reference:{type:'string'}}},example:{customerId:0,sku:'',reference:''}}}}})},
 '/confirmation/{id}':{get:op('Read confirmation',{parameters:[{name:'id',in:'path',required:true,schema:{type:'integer'}}]})},
 '/audit/{id}':{post:op('Approve dispatch',{parameters:[{name:'id',in:'path',required:true,schema:{type:'integer'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{approvalCode:{type:'string'}}},example:{approvalCode:''}}}}})},
}}
;(async()=>{
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('content-type','application/json')
  if(url.pathname==='/configuration')return res.end(JSON.stringify({openApiUrl:base+'/openapi.json',apiBaseUrl:base,endpointMappingsUrl:base+'/mappings'}))
  if(url.pathname==='/openapi.json')return res.end(JSON.stringify(document))
  if(url.pathname==='/mappings')return res.end('[]')
  if(!url.pathname.startsWith('/assets/')&&url.pathname!=='/'&&!url.pathname.startsWith('/builder')&&!url.pathname.startsWith('/scenarios')){
   let body='';for await(const part of req)body+=part
   calls.push({path:url.pathname,method:req.method,body});events.push('start:'+url.pathname);peak=Math.max(peak,++active)
   if(['/customers','/inventory'].includes(url.pathname))await new Promise(resolve=>setTimeout(resolve,url.pathname==='/customers'?150:250))
   active--;events.push('end:'+url.pathname)
   return res.end(JSON.stringify(url.pathname==='/customers'?{id:41}:url.pathname==='/inventory'?{sku:'SKU-7'}:url.pathname==='/orders'?{id:901}: {ok:true}))
  }
  try{const file=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,file)))}catch{res.writeHead(404);res.end()}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const p=page=await browser.newPage({viewport:{width:1540,height:1000}});p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept())
 if(output)await fs.mkdir(output,{recursive:true});const shot=async name=>{if(output)await p.screenshot({path:path.join(output,name+'.png')})}
 await p.goto(base);await p.getByRole('button',{name:'Scenarios',exact:true}).click();await p.getByRole('button',{name:'New scenario'}).click();await p.getByRole('heading',{name:'Scenario Builder',exact:true}).waitFor()
 await p.getByRole('button', { name: 'Scenario details', exact: true }).click(); await p.getByRole('textbox', { name: 'Scenario name', exact: true }).fill('Order fulfilment'); await p.getByRole('dialog', { name: 'Scenario details' }).getByRole('button', { name: 'Done' }).click()
 const closeStep=async()=>{const step=p.locator('.step-dialog[open]');if(await step.count())await step.getByRole('button',{name:'Done',exact:true}).click()}
 const add=async(name,label)=>{await closeStep();await p.getByRole('button',{name:'+ Add request',exact:true}).click();await p.getByRole('searchbox',{name:'Find endpoint',exact:true}).fill(name);await p.locator('.endpoint-options button').filter({hasText:name}).click();await p.getByRole('textbox',{name:'Step name',exact:true}).fill(label)}
 await add('Find customer','Find customer');await add('Check inventory','Check stock');await add('Create order','Create order')
 const addInput=async({target='Body',pointer='',source='Earlier response',step,response='',generator,pattern,prompt,type})=>{
  if(target==='Body'){await p.getByRole('button',{name:'Raw JSON',exact:true}).click();const advanced=p.locator('.advanced-body-bindings');if(await advanced.getAttribute('open')===null)await advanced.locator('summary').click()}
  if(target==='Body') await p.getByRole('button',{name:'Add input',exact:true}).last().click()
  else await p.locator('[data-parameter="' + target.replace(' · ', ':') + '"]').getByRole('button',{name:'Use a run-time value'}).click()
  const card=p.locator('.input-card').last()
  if(target==='Body'){await card.getByLabel('Target',{exact:true}).selectOption({label:target});await card.getByLabel('Target JSON Pointer',{exact:true}).fill(pointer)}
  await card.getByLabel('Value source',{exact:true}).selectOption({label:source})
  if(step){await card.getByLabel('Source step',{exact:true}).selectOption({label:step});await card.getByLabel('Response JSON Pointer',{exact:true}).fill(response)}
  if(generator)await card.getByLabel('Generator tag',{exact:true}).selectOption({label:generator})
  if(pattern)await card.getByLabel('Pattern',{exact:true}).fill(pattern)
  if(prompt)await card.getByLabel('Question',{exact:true}).fill(prompt)
  if(type)await card.getByLabel('Value type',{exact:true}).selectOption({label:type})
 }
 await addInput({pointer:'/customerId',step:'Find customer',response:'/id'});await addInput({pointer:'/sku',step:'Check stock',response:'/sku'});await addInput({pointer:'/reference',source:'Generate data',generator:'Pattern · bounded regex',pattern:'INV-[A-Z]{3}-\\d{4}'})
 await add('Read confirmation','Read confirmation');await addInput({target:'path · id',step:'Create order',response:'/id'})
 await add('Approve dispatch','Approve dispatch');await addInput({target:'path · id',step:'Create order',response:'/id'});await addInput({pointer:'/approvalCode',source:'Ask at run time',prompt:'Enter dispatch approval code',type:'Text'})
 await closeStep();await p.getByRole('button',{name:'Save',exact:true}).click();await p.getByTitle('All changes saved').waitFor();assert.equal(calls.length,0);assert.equal(await p.locator('.edge').count(),6);await shot('scenario-builder-map')
 await p.getByRole('button',{name:'Review & run',exact:true}).click();await p.getByRole('heading',{name:'Review scenario run',exact:true}).waitFor();assert.equal(calls.length,0);await shot('scenario-builder-review')
 await p.getByRole('button',{name:'Run scenario',exact:true}).click();await p.getByRole('region',{name:'Human input required'}).waitFor();assert.equal(peak,2)
 assert.ok(events.indexOf('start:/orders')>events.indexOf('end:/customers'));assert.ok(events.indexOf('start:/orders')>events.indexOf('end:/inventory'))
 const order=calls.find(call=>call.path==='/orders');const body=JSON.parse(order.body);assert.equal(body.customerId,41);assert.equal(body.sku,'SKU-7');assert.match(body.reference,/^INV-[A-Z]{3}-\d{4}$/)
 await p.waitForFunction(()=>document.querySelector('[data-step-id][data-status="completed"]')&&[...document.querySelectorAll('.map-node')].some(node=>node.textContent.includes('Read confirmation')&&node.dataset.status==='completed'))
 assert.equal(calls.some(call=>call.path.startsWith('/audit/')),false);await shot('scenario-builder-human')
 await p.getByLabel('Enter dispatch approval code',{exact:false}).fill('RUN-ONLY-9472');await p.getByRole('button',{name:'Continue Approve dispatch',exact:true}).click();await p.locator('.builder-run-status').filter({hasText:'5 / 5 completed'}).waitFor()
 assert.equal(JSON.parse(calls.find(call=>call.path==='/audit/901').body).approvalCode,'RUN-ONLY-9472');assert.equal(calls.length,5);assert.equal(await p.evaluate(()=>Object.values(localStorage).join('').includes('RUN-ONLY-9472')),false)
 await p.getByRole('button',{name:'View response for Create order',exact:true}).click();await p.locator('.response-content').getByText('901',{exact:false}).waitFor();await shot('scenario-builder-completed');await closeStep()
 // Export includes the definition, never run answers, results or generated values.
 await p.locator('.builder-more summary').click();const downloading=p.waitForEvent('download');await p.getByRole('button',{name:'Export definition',exact:true}).click();const download=await downloading;const exported=await fs.readFile(await download.path(),'utf8');assert.equal(JSON.parse(exported).steps.length,5);assert.ok(!exported.includes('RUN-ONLY-9472'));assert.ok(!exported.includes(body.reference));await p.locator('.builder-more summary').click()
 // Export/save/reload never replay a request and retain only the definition.
 await p.reload();await p.getByRole('heading',{name:'Scenario Builder',exact:true}).waitFor();await p.getByRole('button', { name: '← Scenarios', exact: true }).click(); await p.getByRole('button', { name: 'Open Builder scenario ' + 'Order fulfilment', exact: true }).click();assert.equal(await p.locator('.map-node').count(),5);assert.equal(calls.length,5);assert.equal(await p.locator('.scenario-title').innerText(),'Order fulfilment')
 // Stop while waiting for human input, without sending that request.
 await p.getByRole('button',{name:'Review & run',exact:true}).click();await p.locator('.human-toggle input').uncheck();await p.getByRole('button',{name:'Run scenario',exact:true}).click();await p.getByRole('alert').filter({hasText:'Enable human-in-the-loop'}).waitFor();assert.equal(calls.length,5);await p.locator('.human-toggle input').check();await p.getByRole('button',{name:'Run scenario',exact:true}).click();await p.getByRole('region',{name:'Human input required'}).waitFor();await p.goBack();await p.getByRole('region',{name:'Human input required'}).waitFor();assert.ok(p.url().endsWith('/builder'));await p.getByRole('button',{name:'Stop run',exact:true}).click();await p.locator('.builder-run-status strong').filter({hasText:'cancelled'}).waitFor();assert.equal(calls.filter(call=>call.path.startsWith('/audit/')).length,1)
 await p.setViewportSize({width:390,height:844});await shot('scenario-builder-mobile');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[])
 console.log('PASS: authored five-step DAG via UI, parallel roots, join of manual JSON bindings, Faker pattern, fan-out, human pause/resume/cancel, response preview, save/reload without replay, mobile layout; no mappings required.')
})().catch(async error=>{console.error(error);if(page){console.error(await page.locator('.builder-inspector').innerText());await page.screenshot({path:'/tmp/necto-builder-failure.png'})}process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()})
