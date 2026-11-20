const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../dist'),output=process.env.NECTO_WAIT_SCREENSHOTS
let browser,server,page,base,mode='complete',polls=0;const calls=[],errors=[]
const response={description:'Success',content:{'application/json':{schema:{type:'object',properties:{id:{type:'string'},state:{type:'string'},reportId:{type:'integer'}}}}}}
const op=(name,extra={})=>({summary:name,operationId:name,tags:['Jobs'],responses:{200:response},...extra})
const document={openapi:'3.1.0',info:{title:'Async reports API',version:'1'},paths:{'/jobs':{post:op('Start report job')},'/jobs/{id}':{get:op('Wait for report',{parameters:[{in:'path',name:'id',required:true,schema:{type:'string'}}]})},'/reports/{id}':{get:op('Read completed report',{parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}]})},'/health':{get:op('Independent health check')}}}
;(async()=>{
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');const json=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value))}
  if(url.pathname==='/configuration')return json({openApiUrl:base+'/openapi.json',apiBaseUrl:base,endpointMappingsUrl:base+'/mappings'})
  if(url.pathname==='/openapi.json')return json(document)
  if(url.pathname==='/mappings')return json([])
  if(['/jobs','/jobs/job-42','/reports/99','/health'].includes(url.pathname)){
   calls.push({path:url.pathname,method:req.method,at:Date.now()})
   if(url.pathname==='/jobs')return json({id:'job-42'})
   if(url.pathname==='/jobs/job-42'){polls++;return json(mode==='complete'&&polls>=3?{state:'Completed',reportId:99}:{state:'Pending'})}
   return json({ok:true})
  }
  try{const file=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,file)))}catch{res.writeHead(404);res.end()}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const p=page=await browser.newPage({viewport:{width:1540,height:1000}});p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept())
 if(output)await fs.mkdir(output,{recursive:true});const shot=async name=>{if(output)await p.screenshot({path:path.join(output,name+'.png')})}
 await p.goto(base);await p.getByRole('button',{name:'Scenarios',exact:true}).click();await p.getByRole('button',{name:'New scenario'}).click();await p.getByRole('button', { name: 'Scenario details', exact: true }).click(); await p.getByRole('textbox', { name: 'Scenario name', exact: true }).fill('Generate an asynchronous report'); await p.getByRole('dialog', { name: 'Scenario details' }).getByRole('button', { name: 'Done' }).click()
 const closeStep=async()=>{const step=p.locator('.step-dialog[open]');if(await step.count())await step.getByRole('button',{name:'Done',exact:true}).click()}
 const add=async name=>{await closeStep();await p.getByRole('button',{name:'+ Add request',exact:true}).click();await p.getByRole('searchbox',{name:'Find endpoint',exact:true}).fill(name);await p.locator('.endpoint-options button').filter({hasText:name}).click()}
 const bind=async(step,pointer)=>{await p.getByRole('button',{name:'Use a run-time value',exact:true}).click();const card=p.locator('.input-card').last();await card.getByLabel('Value source',{exact:true}).selectOption('response');await card.getByLabel('Source step',{exact:true}).selectOption({label:step});await card.getByLabel('Response JSON Pointer',{exact:true}).fill(pointer)}
 const select=async name=>{await closeStep();await p.locator('.map-node').filter({hasText:name}).dblclick();await p.getByRole('button',{name:'Configure',exact:true}).click();await closeStep()}
 const timing=async()=>{await closeStep();await p.getByRole('button',{name:'Configure connection Start report job → Wait for report',exact:true}).click()}
 const applyTiming=()=>p.getByRole('button',{name:'Apply connection',exact:true}).click()
 const review=async()=>{await p.getByRole('button',{name:'Review & run',exact:true}).click();await p.locator('.parallel-limit input').fill('1')}
 const run=async()=>{await review();await p.getByRole('button',{name:'Run scenario',exact:true}).click()}
 await add('Start report job');await add('Wait for report');await bind('Start report job','/id');await timing()
 await p.getByRole('checkbox',{name:'Delay',exact:true}).check();await p.getByRole('spinbutton',{name:'Delay milliseconds',exact:true}).fill('300')
 await p.getByRole('checkbox',{name:'Wait for response value',exact:true}).check();await p.getByLabel('Wait for response field',{exact:true}).fill('/state');await p.getByRole('textbox',{name:'Expected response value',exact:true}).fill('Completed');await p.getByRole('spinbutton',{name:'Response retry count',exact:true}).fill('3');await p.getByRole('spinbutton',{name:'Response retry interval milliseconds',exact:true}).fill('300');await applyTiming()
 await add('Read completed report');await bind('Wait for report','/reportId');await add('Independent health check');await select('Wait for report')
 await p.getByRole('button',{name:'Save',exact:true}).click();await timing();await shot('wait-controls');await p.getByRole('button',{name:'Cancel',exact:true}).click()
 const stored=await p.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([key])=>key.startsWith('necto:scenario-builder:'))[1]).blueprints[0]);assert.equal(stored.version,7);assert.equal(stored.connections.find(edge=>edge.delayMs!==undefined).delayMs,300);assert.equal(stored.connections.find(edge=>edge.waitFor).waitFor.retryCount,3)
 await review();await p.getByText(/Up to 4 GET calls/).waitFor();assert.equal(calls.length,0);await p.getByRole('button',{name:'Run scenario',exact:true}).click()
 await p.locator('.map-node[data-status="retry-wait"]').filter({hasText:'Wait for report'}).waitFor();await p.locator('.map-node').filter({hasText:'Wait for report'}).dblclick();await p.locator('.step-dialog[open] .inspector-tabs button').nth(1).click();await shot('polling-progress')
 await p.locator('.builder-run-status').filter({hasText:'4 / 4 completed'}).waitFor();const statusCalls=calls.filter(call=>call.path==='/jobs/job-42')
 assert.equal(statusCalls.length,3);assert.equal(calls.filter(call=>call.path==='/jobs'&&call.method==='POST').length,1);assert.equal(calls.filter(call=>call.path==='/reports/99').length,1);assert.ok(statusCalls[0].at-calls.find(call=>call.path==='/jobs').at>=280);assert.ok(statusCalls[1].at-statusCalls[0].at>=280);assert.ok(statusCalls[2].at-statusCalls[1].at>=280);assert.ok(calls.findIndex(call=>call.path==='/health')<calls.findIndex(call=>call.path==='/jobs/job-42'));await p.getByText('Attempt history (3)',{exact:true}).waitFor();await shot('polling-completed')
 // Old saved definitions and new timing definitions are both supported; reload must not execute.
 const beforeReload=calls.length;await p.reload();await p.getByRole('button', { name: '← Scenarios', exact: true }).click(); await p.getByRole('button', { name: 'Open Builder scenario ' + 'Generate an asynchronous report', exact: true }).click();await select('Wait for report');await timing();assert.equal(await p.getByRole('spinbutton',{name:'Delay milliseconds',exact:true}).inputValue(),'300');assert.equal(calls.length,beforeReload);await p.getByRole('button',{name:'Cancel',exact:true}).click()
 // Exhaustion retains the final HTTP 200 for inspection, but never calls the child.
 mode='pending';polls=0;await timing();await p.getByRole('checkbox',{name:'Delay',exact:true}).uncheck();await p.getByRole('spinbutton',{name:'Response retry count',exact:true}).fill('1');await p.getByRole('spinbutton',{name:'Response retry interval milliseconds',exact:true}).fill('100');await applyTiming();await run();await p.locator('.builder-run-status').filter({hasText:'not met after 2 attempts'}).waitFor();assert.equal(polls,2);assert.equal(calls.filter(call=>call.path==='/reports/99').length,1);await p.locator('.map-node').filter({hasText:'Wait for report'}).dblclick();await p.locator('.step-dialog[open] .inspector-tabs button').nth(1).click();await p.getByText('Attempt history (2)',{exact:true}).waitFor()
 // Cancel an initial delay; the poll endpoint is never sent.
 await select('Wait for report');await timing();await p.getByRole('checkbox',{name:'Delay',exact:true}).check();await p.getByRole('spinbutton',{name:'Delay milliseconds',exact:true}).fill('600000');await applyTiming();const beforeDelay=calls.filter(call=>call.path==='/jobs/job-42').length;await run();await p.locator('.map-node[data-status="delaying"]').waitFor();await p.getByRole('button',{name:'Stop run',exact:true}).click();await p.locator('.builder-run-status strong').filter({hasText:'cancelled'}).waitFor();assert.equal(calls.filter(call=>call.path==='/jobs/job-42').length,beforeDelay)
 // Cancel between retries; the long timer is aborted immediately.
 await select('Wait for report');await timing();await p.getByRole('checkbox',{name:'Delay',exact:true}).uncheck();await p.getByRole('spinbutton',{name:'Response retry interval milliseconds',exact:true}).fill('600000');await applyTiming();await run();await p.locator('.map-node[data-status="retry-wait"]').waitFor();const beforeStop=calls.length;await p.getByRole('button',{name:'Stop run',exact:true}).click();await p.locator('.builder-run-status strong').filter({hasText:'cancelled'}).waitFor();assert.equal(calls.length,beforeStop)
 await p.setViewportSize({width:390,height:844});await select('Wait for report');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await timing();await shot('wait-controls-mobile');assert.deepEqual(errors,[])
 console.log('PASS: UI-authored delay and typed response wait, exact retry count/interval, dependency release only on matching response, independent progress with concurrency one, v4 connection save/reload, exhaustion and canceling both timers, mobile layout.')
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:'/tmp/necto-wait-failure.png'});process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()})
