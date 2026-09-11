// Read-only by default. --submit explicitly authorises one labelled production enquiry.
// Uses installed Chrome. Credentials are read from the existing private token file, never logged.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const base=process.env.PROPERTY_FILMS_TEST_URL||'http://127.0.0.1:8792';
assert(['http://127.0.0.1:8792','https://piersblinco.com'].includes(base));
const localSubmit=process.argv.includes('--local-submit');
const submit=localSubmit||process.argv.includes('--submit');if(submit)assert.equal(base,localSubmit?'http://127.0.0.1:8792':'https://piersblinco.com');
const admin=localSubmit?'http://127.0.0.1:8793':'https://business-os.pbwebonlinesales.workers.dev';
const stage=localSubmit?'local':'production';
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
 for(const width of [1366,1440,1920,375,412,768]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:width===1366?768:width===1920?1080:900,deviceScaleFactor:1,mobile:width<600});
  await send('Page.navigate',{url:base+'/property-films/'});await wait("document.querySelector('#showcase') && !document.querySelector('#showcase').hidden");await sleep(300);
  assert(await js('document.documentElement.scrollWidth<=innerWidth'),'Overflow at '+width);
  if(width>=1200){
   assert(await js("(()=>{const e=document.querySelector('.video-shell');return !!e && e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0})()"),'Video section rendered at '+width);
   assert(await js("(()=>{const e=document.querySelector('h1');return !!e && parseFloat(getComputedStyle(e).fontSize)>=60})()"),'Large proposition');
  }
  assert(await js("new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>=1280);image.onerror=()=>resolve(false);image.src=document.querySelector('#showcase').poster;})"),'Real film cover loads');
  const firstFold=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/property-direct-first-${width}.png`,Buffer.from(firstFold.data,'base64'));
  assert(await js("parseFloat(getComputedStyle(document.querySelector('.hero .button')).fontSize)>=16"),'Readable CTA');
  assert(await js("document.querySelector('#showcase').controls && document.querySelector('#showcase').playsInline && !document.querySelector('#showcase').autoplay"));
  assert(await js("[...document.querySelectorAll('#interest-form input:not(#company_fax),#interest-form select,#interest-form button')].every(e=>e.getBoundingClientRect().height>=44)"));
  await js("document.querySelector('#showcase').muted=true;document.querySelector('#showcase').scrollIntoView({block:'center'});document.querySelector('#showcase').play()");
  await wait("document.querySelector('#showcase').currentTime>2");
  assert(await js("document.querySelector('#showcase').videoWidth===1920 && document.querySelector('#showcase').duration>50 && !document.querySelector('#showcase').error"));
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/property-release-video-${width}.png`,Buffer.from(shot.data,'base64'));
  await js("document.querySelector('#showcase').currentTime=48");await wait("document.querySelector('#showcase').ended");
   assert(await js("document.body.innerText.includes('LOVE YOUR FILM GUARANTEE')"));
  assert(!await js("/£|\\b700\\b|buy now|order now|unlimited revisions|stripe|checkout|more bookings|increase your revenue|higher rankings/i.test(document.body.innerText)"));
   await click('.hero .button');await wait("document.querySelector('#example').getBoundingClientRect().top>=-5 && document.querySelector('#example').getBoundingClientRect().top<150");
  // Bring the hero link into view as a visitor would before activating it.
  const offerShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(`/tmp/property-offer-${width}.png`,Buffer.from(offerShot.data,'base64'));
   await js("document.querySelector('#enquiry').scrollIntoView({block:'start',behavior:'instant'})");await sleep(100);await wait("document.querySelector('#enquiry').getBoundingClientRect().top>=-2 && document.querySelector('#enquiry').getBoundingClientRect().top<80");
  console.log('PASS '+width+'px: film playback, layout, CTAs, guarantee, paid-project wording and no pricing/checkout');
 }
 await js("window.exampleHeadingBeforeError=document.querySelector('#photography-claim').textContent;document.querySelector('#showcase').dispatchEvent(new Event('error'))");assert(await js("!document.querySelector('#film-placeholder').hidden && document.querySelector('#photography-claim').textContent===window.exampleHeadingBeforeError"));
 await click('#interest-form button');assert.equal(await js("document.querySelectorAll('[aria-invalid=true]').length"),7);
 const business='[DEPLOYMENT TEST] Property Films '+new Date().toISOString();
 for(const [name,value]of Object.entries({name:'Deployment smoke test',business_name:business,email:'property-films-smoke@example.com',phone:'+44 7700 900123',website:'https://piersblinco.com/property-films',property_count:'1',photography:'Yes'}))await fill('#'+name,value);
 await fill('#email','invalid');await click('#interest-form button');assert(await js("document.querySelector('#email-error').textContent.length>0"));await fill('#email','property-films-smoke@example.com');
 const targets=await js("[...new Set([...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')))]");for(const target of targets){if(target.startsWith('#'))assert(await js('Boolean(document.getElementById('+JSON.stringify(target.slice(1))+'))'));else assert((await fetch(new URL(target,base))).ok,'Link works: '+target);}
 const privacy=await fetch(base+'/property-films/privacy.html');assert(privacy.ok);assert(/privacy/i.test(await privacy.text()));
 console.log('PASS form validation and privacy page');
 if(submit){
  await js("window.savedFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('Offline'));");
  await click('#interest-form button');await wait("document.querySelector('#form-error').textContent.includes('connection')");
  assert(await js("document.querySelector('#interest-form button').textContent.includes('SHOW ME WHAT YOU COULD DO WITH MINE')"),'CTA restored after failure');
  await js('window.fetch=window.savedFetch');
  await click('#interest-form button');await wait("!document.querySelector('#success').hidden");assert(await js("document.querySelector('#interest-form').hidden && document.activeElement.id==='success'"));
  const raw=localSubmit?'local-test-only':(await fs.readFile('/home/piers-blinco/business-os/.dev.vars.messenger-production-token','utf8')).trim();const token=(raw.includes('=')?raw.slice(raw.indexOf('=')+1):raw).trim().replace(/^['"]|['"]$/g,'');
  const auth={Authorization:'Bearer '+token};
  const request=async route=>{const r=await fetch(admin+'/api/property-business/'+route,{headers:auth});assert.equal(r.status,200);return r.json();};
  const data=await request('leads'),lead=data.leads.find(l=>l.business_name===business);assert(lead);assert.equal(lead.status,'NEW');
  const saved=await request('leads/'+lead.id);assert.equal(saved.lead.email,'property-films-smoke@example.com');
  await fs.writeFile(localSubmit?'/tmp/property-offer-local-lead.json':'/tmp/property-release-private/smoke-lead.json',JSON.stringify({id:lead.id,business_name:business,notification_status:saved.lead.notification_status}),{mode:0o600});
  console.log('PASS '+stage+' form success and real Property Business lead:',lead.id,'notification:',saved.lead.notification_status);
  for(const route of ['overview','prospects','prospects/imports','leads','property-films']){assert.equal((await fetch(admin+'/api/property-business/'+route)).status,401);await request(route);}
  assert.equal((await fetch(admin+'/api/property-films/leads',{headers:auth})).status,404);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:admin+'/#property-business-leads'});await wait("document.querySelector('#property-business-leads')");await fill('[name=token]',token);await click('[data-connect] button');await wait("document.querySelector('[data-id]')");
  assert.deepEqual(await js("[...document.querySelectorAll('[data-module^=property-business-]')].map(e=>e.textContent.trim().replace(/^[⌂◎◫▷]\\s*/,''))"),['Overview','Prospects','Leads','Property Films']);
  await click(`[data-id="${lead.id}"]`);await wait("document.querySelector('[data-edit]')");
  await fill('[name=notes]','Production deployment smoke test; not a sales enquiry. Verified public form → Property Business Leads.');await click('[data-edit] button');await wait("document.querySelector('[data-message]').textContent==='Changes saved.'");
  await click('[data-module=property-business-overview]');await wait("document.querySelector('.pb-counts')");
  await click('[data-module=property-business-prospects]');await wait("document.querySelector('[data-workspace]') && !document.querySelector('[data-workspace]').hidden");
  assert(await js("!document.querySelector('[data-start=test]').disabled && !document.querySelector('[data-start=full]').disabled"));
  await js("window.confirm=()=>{window.checkedFullConfirmation=true;return false;}");await click('[data-start=full]');assert(await js('window.checkedFullConfirmation===true'));
  await click('[data-module=property-business-films]');await wait("document.querySelector('[data-formspree]')");
  assert.equal(await js("document.querySelector('[data-formspree]').textContent.includes('Not configured')"),true);
  for(const module of (localSubmit?[]:['dashboard','sales','prospecting','content'])){await click(`[data-module="${module}"]`);await wait("!document.querySelector('.module-loading') && !document.querySelector('.module-error')");await sleep(700);assert(await js("document.querySelector('.workspace').textContent.trim().length>50"));}
  console.log('PASS '+stage+' authentication, four Property Business areas, full confirmation cancelled'+(localSubmit?'':', existing dashboard/Sales/Prospecting/Content'));
 }
 assert.deepEqual(errors,[]);console.log('PASS no browser JavaScript errors');
}finally{ws?.close();chrome.kill();await sleep(100);await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
