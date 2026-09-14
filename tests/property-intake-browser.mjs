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


 let current, mode='normal', calls=[];
 ws.addEventListener('message',async event=>{
  const d=JSON.parse(event.data);if(d.method!=='Fetch.requestPaused')return;
  const {requestId,request}=d.params;let status=200,type='application/json',body;
  if(request.url.includes('checkout-config.mjs')){type='application/javascript';body="export const checkoutConfig={enabled:false,apiUrl:'http://127.0.0.1:8792/api/intake-test/checkout'};";}
  else if(request.url.endsWith('/access')){
   calls.push({kind:'access',data:JSON.parse(request.postData)});
   if(mode==='denied'){status=403;body=JSON.stringify({error:'A completed Property Films payment is required.'});}
   else body=JSON.stringify({token:'a'.repeat(64),order:{...current,intakeStatus:mode==='submitted'?'SUBMITTED':'NEEDED',photoSource:'originals_separately',testMode:true},customer:{name:'Stripe Customer',email:'stripe@example.com',phone:'+44 7700 900123'}});
  }else if(request.method==='POST'){
   calls.push({kind:'submit',data:JSON.parse(request.postData),authorization:request.headers.Authorization||request.headers.authorization});
   if(mode==='failure'){status=503;body=JSON.stringify({error:'Please try again. Your details have been kept.'});}
   else body=JSON.stringify({success:true,photoSource:JSON.parse(request.postData).photoSource});
  }else body=JSON.stringify({order:{...current,intakeStatus:'SUBMITTED',photoSource:'listing',testMode:true},customer:{}});
  await send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:type}],body:Buffer.from(body).toString('base64')});
 });
 await send('Fetch.enable',{patterns:[{urlPattern:'*checkout-config.mjs*'},{urlPattern:'*api/intake-test/intake*'}]});
 const cases=[['essential',1,false,49500],['essential',1,true,79000],['signature',1,false,79500],['signature',1,true,129000],['multi',1,false,79500],['multi',1,true,159000],['multi',2,false,119000],['multi',2,true,198500],['multi',3,false,158500],['multi',3,true,238000]];
 for(const width of [375,1440])for(const [pkg,count,seasonal,amountPaid] of cases){
  current={package:pkg,propertyCount:count,seasonal,amountPaid};mode='normal';calls=[];
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await send('Page.navigate',{url:base+'/property-films/intake/?run='+crypto.randomUUID()+'#session_id=cs_test_browserfixture'});
  await wait("document.querySelector('#intake-form') && !document.querySelector('#intake-form').hidden");
  assert.equal(await js("document.querySelectorAll('.property-section').length"),count);
  assert.equal(await js("!document.querySelector('#seasonal-section').hidden"),seasonal);
  assert.equal(await js("document.querySelector('[name=name]').value"),'Stripe Customer');
  assert.equal(await js("document.querySelector('[name=email]').value"),'stripe@example.com');
  assert.equal(await js("document.querySelector('[name=phone]').value"),'+44 7700 900123');
  assert(await js("document.querySelector('#order-summary').textContent.includes("+JSON.stringify(new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(amountPaid/100))+")"));
  assert.equal(await js('location.hash'),'');assert.equal(calls[0].data.session_id,'cs_test_browserfixture');
  assert(await js('document.documentElement.scrollWidth<=innerWidth'));
  assert.equal(await js("document.querySelectorAll('input[type=file]').length"),0);
  await click('button[type=submit]');assert.equal(calls.filter(c=>c.kind==='submit').length,0);
  await fill('[name=businessName]','Coastal Stays');await fill('[name=name]','Corrected Customer');
  for(let i=0;i<count;i++){await fill(`[name=p${i}_name]`,`Coastal Lodge ${i+1}`);await fill(`[name=p${i}_url]`,`https://example.com/lodge-${i+1}`);}
  const photoSource=seasonal?'originals_separately':'listing';
  await click(`[name=photoSource][value=${photoSource}]`);
  if(seasonal)await fill('[name=seasonalNotes]','Winter escapes');
  if(pkg==='essential'&&!seasonal){mode='failure';await click('button[type=submit]');await wait("!document.querySelector('#submit-error').hidden");assert.equal(await js("document.querySelector('[name=businessName]').value"),'Coastal Stays');mode='normal';}
  await click('button[type=submit]');await wait("!document.querySelector('#success').hidden");
  const posted=calls.filter(c=>c.kind==='submit').at(-1);assert.equal(posted.data.properties.length,count);assert.equal(posted.data.photoSource,photoSource);assert.equal(posted.authorization,'Bearer '+'a'.repeat(64));
  assert.deepEqual(Object.keys(posted.data).sort(),['customer','properties','photoSource','seasonalNotes','generalNotes'].sort());
  assert(await js("document.querySelector('#photo-next').textContent.includes("+JSON.stringify(seasonal?'secure photo handoff':'listing')+")"));
  assert.equal(await js('document.activeElement.id'),'success');
  console.log(`PASS ${width}px ${pkg} ${count} seasonal=${seasonal}: summary, prefill, listing-only form and ${photoSource}`);
 }
 mode='denied';await send('Page.navigate',{url:base+'/property-films/intake/?run='+crypto.randomUUID()+'#session_id=cs_test_fake'});await wait("!document.querySelector('#access-error').hidden");assert(await js("document.querySelector('#intake-form').hidden"));
 mode='submitted';await send('Page.navigate',{url:base+'/property-films/intake/?run='+crypto.randomUUID()+'#session_id=cs_test_submitted'});await wait("!document.querySelector('#success').hidden");assert(await js("document.querySelector('#intake-form').hidden"));
 await js("sessionStorage.clear()");await send('Page.navigate',{url:base+'/property-films/intake/?paid=true&package=multi'});await wait("!document.querySelector('#access-error').hidden");assert(await js("document.querySelector('#intake-form').hidden"));
 // Expected denied/network responses are tested above; no uncaught JavaScript exceptions are allowed.
 assert.deepEqual(errors.filter(e=>!e.startsWith('Failed to load resource')),[]);
 console.log('PASS denied/missing/forged access, submitted state, errors and retry; no browser exceptions');
}finally{ws?.close();const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();await stopped;await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
