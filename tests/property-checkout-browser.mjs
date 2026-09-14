// Local browser tests with mocked Checkout responses; no Stripe requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const base=process.env.PROPERTY_FILMS_TEST_URL||'http://127.0.0.1:8792';
assert.equal(base,'http://127.0.0.1:8792');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'property-release-chrome-'));
const chrome=spawn('/opt/google/chrome/chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}assert(port);
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args.map(a=>a.value||a.description).join(' '));};
 async function send(method,params={}){const d=await new Promise(r=>{const next=++id;pending.set(next,r);ws.send(JSON.stringify({id:next,method,params}));});if(d.error)throw Error(JSON.stringify(d.error));return d.result;}
 async function js(expression){const d=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(d.exceptionDetails)throw Error('Browser evaluation failed');return d.result.value;}
 async function wait(expression){for(let i=0;i<300;i++){if(await js(expression))return;await sleep(100);}throw Error('Timed out: '+expression);}
 const click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 const fill=(s,v)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(s)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await send('Runtime.enable');await send('Page.enable');
 // The existing shell has no favicon; don't issue unrelated favicon fallback requests.
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"document.addEventListener('DOMContentLoaded',()=>{const e=document.createElement('link');e.rel='icon';e.href='data:,';document.head.appendChild(e);});"});

 let statusPaid = true;
 ws.addEventListener('message', async event => {
   const data = JSON.parse(event.data);
   if (data.method !== 'Fetch.requestPaused') return;
   const {requestId,request} = data.params;
   let text, type='application/javascript';
   if (request.url.includes('checkout-config.mjs')) text="export const checkoutConfig={enabled:true,apiUrl:'/checkout-mock'};";
   else if (request.url.includes('checkout.stripe.com')) { type='text/html'; text='<title>Mock Stripe Checkout</title><p>Hosted Checkout destination</p>'; }
   else { type='application/json'; text=JSON.stringify(request.url.includes('/access') ? {token:'a'.repeat(64),order:{package:'essential',propertyCount:1,seasonal:false,amountPaid:49500,testMode:true,intakeStatus:'NEEDED'},customer:{name:'Test customer',email:'test@example.com',phone:''}} : {paid:statusPaid,testMode:true}); }
   await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:type}],body:Buffer.from(text).toString('base64')});
 });
 await send('Fetch.enable',{patterns:[{urlPattern:'*checkout-config.mjs*'},{urlPattern:'https://checkout.stripe.com/*'},{urlPattern:'*checkout-mock-status*'},{urlPattern:'*checkout-mock/access*'}]});
 for(const width of [375,1440]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
   await send('Page.navigate',{url:base+'/property-films/packages/'});
   await wait("document.querySelector('[data-choose]') && !document.querySelector('[data-choose]').disabled");
   await js(`window.calls=[];window.fetch=async (url,options)=>{calls.push({url,body:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return new Response(JSON.stringify({error:'Secure checkout is temporarily unavailable. Please try again shortly.'}),{status:503});}`);
   for(const [pkg,count] of [['essential',1],['signature',1],['multi-property',1],['multi-property',2],['multi-property',3]]) for(const seasonal of [false,true]) {
     await js(`(()=>{const card=document.querySelector('[data-package="${pkg}"]');card.querySelector('input').checked=${seasonal};card.querySelector('input').dispatchEvent(new Event('change'));const count=card.querySelector('select');if(count){count.value='${count}';count.dispatchEvent(new Event('change'));}card.querySelector('[data-choose]').click();})()`);
     await wait("!document.querySelector('[data-choose]').disabled");
     assert.deepEqual(await js('calls.at(-1).body'),{package:pkg==='multi-property'?'multi':pkg,propertyCount:count,seasonal});
     assert(await js("document.querySelector('[data-preview]').textContent.includes('Please try again')"));
   }
   const firstKey=await js('calls.at(-1).key');
   await click('[data-package="multi-property"] [data-choose]'); await wait("!document.querySelector('[data-choose]').disabled");
   assert.equal(await js('calls.at(-1).key'),firstKey);
   await js("window.fetch=async()=>{throw new TypeError('network failed')}");
   await click('[data-choose]');await wait("!document.querySelector('[data-choose]').disabled");
   assert(await js("document.querySelector('[data-preview]').textContent.includes('selection has been kept')"));
   await js("window.fetch=()=>new Promise(resolve=>window.finishCheckout=resolve)");
   await click('[data-choose]');
   assert(await js("[...document.querySelectorAll('[data-choose]')].every(b=>b.disabled)"));
   await js("finishCheckout(new Response(JSON.stringify({checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_fixture'})))");
   await wait("location.hostname==='checkout.stripe.com'");
   console.log(`PASS ${width}px: ten state payloads, retry, errors, busy state, hosted redirect`);
 }
 for(const paid of [false,true]) {
   statusPaid=paid;
   await send('Page.navigate',{url:base+'/property-films/thank-you/?session_id=cs_test_fixture'});
   await wait("document.querySelector('#payment-label') && document.querySelector('#payment-label').textContent!=='Checking payment'");
   assert.equal(await js("!document.querySelector('#confirmed').hidden"),paid);
   if(paid){
     assert.equal(await js("document.querySelector('#payment-label').textContent"),'PAYMENT RECEIVED');
     assert(await js("!document.querySelector('#test-note').hidden"));
     assert(await js('document.documentElement.scrollWidth<=innerWidth'));
     await click('#confirmed a');await wait("location.pathname.includes('/intake')");
     await wait("document.querySelectorAll('.property-section').length===1");
     assert(await js("!document.querySelector('#intake-form').hidden"));
   }
 }
 await send('Page.navigate',{url:base+'/property-films/thank-you/'});
 await wait("document.querySelector('#payment-message')?.textContent.includes('valid payment reference')");
 assert(await js("document.querySelector('#confirmed').hidden"));
 assert.deepEqual(errors,[]);console.log('PASS paid/unpaid/missing-reference confirmation and verified intake handoff; no browser exceptions');
}finally{ws?.close();const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();await stopped;await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
