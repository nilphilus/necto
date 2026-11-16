const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { spawn } = require('node:child_process'), assert = require('node:assert/strict'), path = require('node:path')
const base=process.env.NECTO_SENSITIVE_BASE || 'http://127.0.0.1:5098'
let app,browser
;(async()=>{
 if(!process.env.NECTO_SENSITIVE_BASE){app=spawn(process.env.NECTO_DOTNET || 'dotnet',['SampleApi/bin/Release/net10.0/SampleApi.dll'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:base},stdio:'ignore'})}
 let ready=false
 for(let i=0;i<100;i++){try{if((await fetch(base+'/necto/configuration')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
 assert.equal(ready,true,'sample API did not start')
 browser=await chromium.launch({headless:true,args:['--no-sandbox']})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message))
 await page.goto(base+'/necto/')
 await page.getByRole('searchbox',{name:'Find an endpoint'}).fill('SensitiveInvoice')
 await page.locator('.catalog-operation').filter({has:page.locator('strong',{hasText:'SensitiveInvoice'})}).click()
 const payload={reference:'INV-42','approval-code':'PRIVATE-APPROVAL',contact:{name:'Demo',note:'<xml>PRIVATE-NOTE</xml>'}}
 await page.locator('.body-editor textarea').fill(JSON.stringify(payload))
 await page.getByRole('button',{name:'Send request',exact:true}).click()
 await page.getByText('200 OK',{exact:true}).waitFor()
 assert.match(await page.locator('.json-preview').textContent(),/PRIVATE-APPROVAL/,'live response should be unchanged')
 await page.getByRole('button',{name:'Save request',exact:true}).click()
 const save=page.locator('dialog[open]')
 await save.getByText('Marked sensitive fields are excluded',{exact:false}).waitFor()
 await save.getByRole('textbox',{name:'Request name'}).fill('Sensitive retention')
 await save.getByRole('button',{name:'Save request',exact:true}).click()
 const stored=await page.evaluate(()=>Object.values(localStorage).join('\n'))
 assert.doesNotMatch(stored,/PRIVATE-/);assert.match(stored,/Sensitive retention/)
 const tools=async name=>{await page.getByRole('button',{name:'Tools',exact:true}).click();await page.locator('.tools-menu').getByRole('button',{name:new RegExp('^'+name)}).click();await page.locator('dialog[open]').waitFor()}
 await tools('Code');assert.doesNotMatch(await page.locator('dialog[open]').textContent(),/PRIVATE-/);await page.keyboard.press('Escape')
 await tools('History');assert.doesNotMatch(await page.locator('dialog[open]').textContent(),/PRIVATE-/);await page.keyboard.press('Escape')
 assert.deepEqual(errors,[])
 console.log('PASS: real generated sensitivity metadata preserves live response and excludes values from localStorage, Code and History.')
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();app?.kill()})
