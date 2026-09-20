// Read-only browser checks: no enquiries or payment requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const base=process.env.PROPERTY_FILMS_TEST_URL||'http://127.0.0.1:8792';
assert(['http://127.0.0.1:8792','https://piersblinco.com'].includes(base));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'property-release-chrome-'));
const chrome=spawn('/opt/google/chrome/chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}assert(port);
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args.map(a=>a.value||a.description).join(' '));};
 async function send(method,params={}){const d=await new Promise(r=>{const next=++id;pending.set(next,r);ws.send(JSON.stringify({id:next,method,params}));});if(d.error)throw Error(JSON.stringify(d.error));return d.result;}
 async function js(expression){const d=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(d.exceptionDetails)throw Error('Browser evaluation failed');return d.result.value;}
 async function contrast(selector, background) {
   const ratio=await js(`(()=>{const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});const lum=s=>{const c=rgb(s);return c[0]*.2126+c[1]*.7152+c[2]*.0722};const a=lum(getComputedStyle(document.querySelector(${JSON.stringify(selector)})).color),b=lum(getComputedStyle(document.querySelector(${JSON.stringify(background)})).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})()`); assert(ratio>=4.5,selector+' contrast '+ratio);
 }
 async function wait(expression){for(let i=0;i<300;i++){if(await js(expression))return;await sleep(100);}throw Error('Timed out: '+expression);}
 const click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 const fill=(s,v)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(s)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await send('Runtime.enable');await send('Page.enable');
 // The existing shell has no favicon; don't issue unrelated favicon fallback requests.
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"document.addEventListener('DOMContentLoaded',()=>{const e=document.createElement('link');e.rel='icon';e.href='data:,';document.head.appendChild(e);});"});

 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.dataLayer=[]; window.fetch=async (url, options={})=>{
 if(String(url).includes('/submit')) { const data=JSON.parse(options.body); sessionStorage.setItem('test-payload',JSON.stringify(data)); if(!sessionStorage.getItem('test-failed')) { sessionStorage.setItem('test-failed','1'); throw new TypeError('offline'); } return new Response(JSON.stringify({success:true}),{status:201}); }
 if(String(url).includes('/checkout')) { sessionStorage.setItem('test-checkout', options.body); const keys=JSON.parse(sessionStorage.getItem('test-keys')||'[]');keys.push(options.headers['Idempotency-Key']);sessionStorage.setItem('test-keys',JSON.stringify(keys));return new Response(JSON.stringify({error:'Please try again.'}),{status:503}); }
 throw new Error('Unexpected network request: '+url);
 };`});
 for(const width of [375,768,1440]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
   await send('Page.navigate',{url:base+'/property-films/'}); await wait("!!document.querySelector('#selected_package') && !!window.propertyFilmsEvent");
   assert(await js('document.documentElement.scrollWidth<=innerWidth'),'Overflow '+width);
   assert(!await js("document.body.innerText.includes('£')"));
   await contrast('.compact-objection .feature-list li','body');
   assert.equal(await js("document.querySelectorAll('#interest-form [required]').length"),5);
   for (const key of ['essential','signature','bespoke']) { await click('[data-package="'+key+'"]'); assert.equal(await js("document.querySelector('#selected_package').value"),key); }
   await click('[type=submit]');assert(await js("document.querySelector('#name').getAttribute('aria-invalid')==='true'"));
   await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(shot=>fs.writeFile('/tmp/property-funnel-'+width+'.png',Buffer.from(shot.data,'base64')));
 }
 for (const [key,value] of Object.entries({name:'Test Owner',business_name:'Test Cottage',email:'test@example.com',phone:'07700900123'})) await fill('#'+key,value);
 await click('[type=submit]');await wait("document.querySelector('#form-error').textContent.includes('connection')");
 const failedPayload=await js("JSON.parse(sessionStorage.getItem('test-payload'))");
 await click('[type=submit]');await wait("location.pathname.includes('next-steps') && document.querySelector('#callback-reassurance').textContent.includes('already in')");
 const saved=await js("JSON.parse(sessionStorage.getItem('test-payload'))"); assert.equal(saved.submission_id,failedPayload.submission_id);assert.equal(saved.selected_package,'bespoke');assert.equal(saved.form_version,'callback-v1');assert(!Object.hasOwn(saved,'photography'));
 assert(await js("!document.querySelector('#bespoke-note').hidden"));
 await wait("!document.querySelector('[data-choose]').disabled");
 for (const key of ['essential','signature']) {
   await click('[data-package="'+key+'"] [data-choose]');await wait("!document.querySelector('#checkout-preview').hidden && !document.querySelector('[data-choose]').disabled");
   assert.deepEqual(await js("JSON.parse(sessionStorage.getItem('test-checkout'))"),{package:key,propertyCount:1,seasonal:false,funnel_source:'callback-v1'});
 }
 await click('[data-package="signature"] [data-choose]');await wait("!document.querySelector('[data-choose]').disabled");
 const keys=await js("JSON.parse(sessionStorage.getItem('test-keys'))"); assert.equal(keys[1],keys[2]);assert.notEqual(keys[0],keys[1]);
 for (const width of [375,768,1440]) { await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert(await js('document.documentElement.scrollWidth<=innerWidth'),'Pricing overflow '+width); }
 await js("sessionStorage.removeItem('property-films-callback')");await send('Page.reload');await wait("document.querySelector('#callback-reassurance') && !document.querySelector('[data-choose]').disabled");assert(!await js("document.querySelector('#callback-reassurance').textContent.includes('already in')"));
 await send('Page.navigate',{url:base+'/property-films/packages/'});await wait("location.pathname.includes('next-steps') && !document.querySelector('[data-choose]').disabled");
 await contrast('.reservation-grid .package-card .package-name','.reservation-grid .package-card');
 await contrast('.reservation-grid .package-card .launch-price','.reservation-grid .package-card');
 await contrast('.package-note','body');
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile('/tmp/property-funnel-pricing.png',Buffer.from(shot.data,'base64'));
 assert.deepEqual(errors,[]);console.log('PASS responsive layouts, no landing prices, three package selections, five-field validation, failed submission recovery, idempotent redirect, bespoke reassurance, checkout payloads/retries, direct visit honesty and no browser exceptions');
}finally{ws?.close();if(chrome.exitCode===null){const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();await stopped;}await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
