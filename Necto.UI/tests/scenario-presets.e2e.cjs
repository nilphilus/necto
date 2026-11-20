const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
let browser,server,page,base;const calls=[],errors=[],root=path.resolve(__dirname,'../dist'),output=process.env.NECTO_PRESET_SCREENSHOTS
const response={description:'Success',content:{'application/json':{schema:{type:'object'}}}}
const properties={email:{type:'string'},code:{type:'string'},customerId:{type:'integer'},customer:{type:'object',properties:{name:{type:'string'},tier:{type:'string'}}}}
const requestBody={content:{'application/json':{schema:{type:'object',properties}}}}
const operation=(name,extra={})=>({summary:name,operationId:name,tags:['Checks'],responses:{200:response},...extra})
const document={openapi:'3.1.0',info:{title:'Preset run API',version:'1'},paths:{'/first':{post:operation('First check',{requestBody})},'/second':{post:operation('Second check',{requestBody})},'/lookup/{customerId}':{get:operation('Customer lookup',{parameters:[{in:'path',name:'customerId',required:true,schema:{type:'integer'}}]})}}}
const request=(body='')=>({fields:{},body,assertions:[],timeout:30000,responseLimitMiB:32,serverValues:{},binaryAttachmentRequired:false})
const step=(id,method,route,inputs=[])=>({id,label:id,operationKey:method+' '+route,apiId:'local',method,path:route,dependsOn:[],inputs,request:request(method==='POST'?'{"email":"draft@test.invalid","code":"draft-code","customerId":0,"customer":{"name":"Draft","tier":"keep"}}':'')})
const inputs=()=>[{source:'generate',location:'body',pointer:'/email',generator:'email'},{source:'human',location:'body',pointer:'/code',prompt:'Enter a code',valueType:'text'},{source:'variable',location:'body',pointer:'/customerId',variableId:'customer'}]
const saved={format:'necto-scenario-builder',version:4,id:'preset-demo',name:'Run checks with presets',concurrency:4,connections:[],variables:[{id:'customer',name:'customerId',source:'static',valueType:'number',value:'42'}],steps:[step('First','POST','/first',inputs()),step('Second','POST','/second',inputs()),step('Lookup','GET','/lookup/{customerId}')]}
;(async()=>{
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');const json=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value))}
  if(url.pathname==='/configuration')return json({openApiUrl:base+'/openapi.json',apiBaseUrl:base,endpointMappingsUrl:base+'/mappings'})
  if(url.pathname==='/openapi.json')return json(document)
  if(url.pathname==='/mappings')return json([])
  if(['/first','/second'].includes(url.pathname)||url.pathname.startsWith('/lookup/')){let text='';for await(const part of req)text+=part;calls.push({path:url.pathname,body:text?JSON.parse(text):null});return json({ok:true})}
  try{const file=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,file)))}catch{res.writeHead(404);res.end()}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const p=page=await browser.newPage({viewport:{width:1540,height:1000}});p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());if(output)await fs.mkdir(output,{recursive:true});const shot=async name=>{if(output)await p.screenshot({path:path.join(output,name+'.png')})}
 await p.addInitScript(({base,saved})=>{
  localStorage.setItem('necto:scenario-builder:'+base+'/openapi.json',JSON.stringify({version:1,blueprints:[saved]}))
  const entries=values=>Object.entries(values).map(([name,value])=>[name,{value}])
  localStorage.setItem('necto:environments:'+base+'/openapi.json',JSON.stringify({version:2,active:[],presets:[['Base',entries({email:'base@test.invalid',code:'PRESET-CODE',customerId:'77',name:'Preset name'})],['Override',entries({email:'override@test.invalid',customerId:'88'})]]}))
 },{base,saved})
 await p.goto(base+'/builder');await p.getByRole('button', { name: '← Scenarios', exact: true }).click(); await p.getByRole('button', { name: 'Open Builder scenario ' + saved.name, exact: true }).click();const before=await p.evaluate(base=>localStorage.getItem('necto:scenario-builder:'+base+'/openapi.json'),base)
 const bar=p.getByRole('region',{name:'Presets',exact:true})
 const basePreset=bar.getByRole('button',{name:'Base',exact:true})
 const overridePreset=bar.getByRole('button',{name:'Override',exact:true})
 const openReview=()=>p.getByRole('button',{name:'Review & run',exact:true}).click()
 const review=p.getByRole('dialog',{name:'Review scenario run',exact:true})
 const run=()=>review.getByRole('button',{name:'Run scenario',exact:true}).click()
 const cancel=()=>review.getByRole('button',{name:'Cancel',exact:true}).click()
 await openReview()
 await review.getByRole('alert').filter({hasText:'customerId is required'}).waitFor()
 assert.equal(await review.getByText('Presets for this run').count(),0)
 assert.equal(await review.getByRole('button',{name:'Run scenario',exact:true}).isDisabled(),true)
 await review.getByText('Preset Base · affected fields', { exact: true }).click()
 await review.locator('details[open]').getByText('Lookup · path customerId', { exact: true }).waitFor()
 await review.getByRole('button',{name:'Activate preset globally · Base',exact:true}).click()
 await review.getByText('Active presets · Base',{exact:true}).waitFor()
 await cancel()
 assert.equal(await basePreset.getAttribute('aria-pressed'),'true')
 await overridePreset.click()
 await openReview()
 await review.locator('.human-toggle input').uncheck()
 await review.getByText('Active presets · Base → Override',{exact:true}).waitFor()
 await shot('preset-run-review')
 assert.equal(calls.length,0)
 await run()
 await p.locator('.builder-run-status').filter({hasText:'3 / 3 completed'}).waitFor()
 assert.equal(calls.length,3)
 assert.ok(calls.some(call=>call.path==='/lookup/88'))
 for(const call of calls.filter(call=>call.body))assert.deepEqual(call.body,{email:'override@test.invalid',code:'PRESET-CODE',customerId:88,customer:{name:'Preset name',tier:'keep'}})
 assert.equal(await p.locator('.human-card').count(),0)
 await p.locator('.builder-run-status').getByText('Presets: Base → Override',{exact:true}).waitFor()
 await shot('preset-run-completed')

 // Opting out for the lookup requires an explicit one-time value even when presets are active.
 await p.locator('.map-node').filter({hasText:'Lookup'}).dblclick()
 const stepEditor=p.getByRole('dialog',{name:'Edit step',exact:true})
 await stepEditor.getByText('Request settings',{exact:true}).click()
 await stepEditor.getByRole('checkbox',{name:'Do not apply presets to this step'}).check()
 await stepEditor.getByRole('button',{name:'Done',exact:true}).click()
 await openReview()
 await review.getByRole('alert').filter({hasText:'customerId is required'}).waitFor()
 assert.equal(await review.getByRole('button',{name:/^Activate preset/}).count(),0)
 await review.getByRole('textbox',{name:'Value for customerId'}).fill('19')
 await review.getByRole('button',{name:'Use for this run'}).click()
 await run()
 await p.locator('.builder-run-status').filter({hasText:'3 / 3 completed'}).waitFor()
 assert.equal(calls.length,6)
 assert.ok(calls.some(call=>call.path==='/lookup/19'))
 await openReview()
 await review.getByRole('alert').filter({hasText:'customerId is required'}).waitFor()
 assert.equal(await review.getByRole('textbox',{name:'Value for customerId'}).inputValue(),'')
 assert.equal(await p.evaluate(base=>localStorage.getItem('necto:scenario-builder:'+base+'/openapi.json'),base),before)
 assert.deepEqual(await p.evaluate(base=>JSON.parse(localStorage.getItem('necto:environments:'+base+'/openapi.json')).active,base),['Base','Override'])
 await p.setViewportSize({width:390,height:844})
 await shot('preset-run-mobile')
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(errors,[])
 console.log('PASS: shared preset activation, required-input suggestions, ordered overrides, step opt-out, one-time values and mobile review.')
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:'/tmp/necto-preset-failure.png'});process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()})
