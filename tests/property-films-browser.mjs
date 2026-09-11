// Run tests/serve-property-films.py and the isolated Worker on port 8793 first.
// Uses installed Chrome, with no browser testing dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'property-films-chrome-'));
const chrome=spawn('/opt/google/chrome/chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws;
try {
 let port;
 for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
 assert(port,'Chrome starts');
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(resolve=>ws.onopen=resolve);
 let id=0;const pending=new Map(),errors=[];
 ws.onmessage=event=>{const d=JSON.parse(event.data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args.map(x=>x.value||x.description).join(' '));};
 async function send(method,params={}){const d=await new Promise(resolve=>{const next=++id;pending.set(next,resolve);ws.send(JSON.stringify({id:next,method,params}));});if(d.error)throw new Error(JSON.stringify(d.error));return d.result;}
 async function js(expression){const d=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(d.exceptionDetails)throw new Error(JSON.stringify(d.exceptionDetails));return d.result.value;}
 async function wait(expression){for(let i=0;i<100;i++){if(await js(expression))return;await pause(100);}throw new Error(`Timed out: ${expression}`);}
 async function click(selector){await js(`document.querySelector(${JSON.stringify(selector)}).click()`);}
 async function fill(selector,value){await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
 await send('Runtime.enable');await send('Page.enable');
 for(const [width,height,label] of [[375,812,'iphone'],[412,915,'android'],[768,1024,'tablet'],[1440,1000,'desktop']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  await send('Page.navigate',{url:'http://127.0.0.1:8792/property-films'});
  await wait("document.querySelector('#interest-form') && window.PROPERTY_FILMS_CONFIG");await pause(300);
  assert(await js('document.documentElement.scrollWidth <= innerWidth'),`${label}: no overflow`);
  await wait("document.querySelector('#showcase') && !document.querySelector('#showcase').hidden");
   assert(await js("document.querySelector('#film-placeholder').hidden && !document.querySelector('#showcase').hidden"),`${label}: film not loaded`);
  assert(await js("Math.abs(document.querySelector('.video-shell').getBoundingClientRect().width/document.querySelector('.video-shell').getBoundingClientRect().height-16/9)<.02"),`${label}: video ratio`);
  assert(await js("[...document.querySelectorAll('#interest-form input:not(#company_fax),select,button')].every(e=>e.getBoundingClientRect().height>=44)"),`${label}: touch targets`);
  const shot=await send('Page.captureScreenshot',{captureBeyondViewport:true,format:'png'});await fs.writeFile(`/tmp/property-films-${label}.png`,Buffer.from(shot.data,'base64'));
  console.log(`PASS ${label}: layout, touch targets, placeholder; screenshot /tmp/property-films-${label}.png`);
 }
 await js("window.testEvents=[];window.addEventListener('property-films:analytics',e=>testEvents.push(e.detail.event))");
 await click('#interest-form button');
 assert.equal(await js("document.querySelectorAll('[aria-invalid=true]').length"),7);
 assert.equal(await js('document.activeElement.id'),'name');
 const business=`Browser Lodge ${Date.now()}`;
 for(const [name,value] of Object.entries({name:'Browser Test',business_name:business,email:'browser@example.com',phone:'+44 7700 900123',website:'example.com/lodge',property_count:'1',photography:'Yes'}))await fill(`#${name}`,value);
 await fill('#email','bad-email');await click('#interest-form button');assert(await js("document.getElementById('email-error').textContent.length>0"));await fill('#email','browser@example.com');
 await js("window.realFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('Offline'))");
 await click('#interest-form button');await wait("document.querySelector('#form-error').textContent.includes('connection')");
 assert.equal(await js("document.querySelector('#name').value"),'Browser Test');
 await js('window.fetch=window.realFetch');await click('#interest-form button');
 await wait("!document.querySelector('#success').hidden");
 assert(await js("document.querySelector('#interest-form').hidden && document.activeElement.id==='success'"));
 assert(await js("testEvents.includes('property_films_form_started') && testEvents.includes('property_films_form_submitted_successfully')"));
 console.log('PASS form validation, network failure recovery, real API submission, success focus, analytics');
 const leads=await(await fetch('http://127.0.0.1:8793/api/property-business/leads',{headers:{Authorization:'Bearer local-property-business-token'}})).json();
 const lead=leads.leads.find(l=>l.business_name===business);assert(lead);assert.equal(lead.status,'NEW');assert.equal(lead.website,'https://example.com/lodge');
 await send('Page.navigate',{url:'http://127.0.0.1:8793/#property-business-leads'});
 await wait("document.querySelector('[data-module=\"property-business-leads\"]')");await click('[data-module="property-business-leads"]');await wait("document.querySelector('#property-business-leads')");
 await fill('[name=token]','local-property-business-token');await click('[data-connect] button');await wait("document.querySelector('[data-id]')");
 await click(`[data-id="${lead.id}"]`);await wait("document.querySelector('[data-edit]')");
 await fill('[name=notes]','Test notes <script>literal only</script>');await fill('[name=status]','INTERESTED');await click('[data-edit] button');await wait("document.querySelector('[data-message]').textContent==='Changes saved.'");
 const saved=await(await fetch(`http://127.0.0.1:8793/api/property-business/leads/${lead.id}`,{headers:{Authorization:'Bearer local-property-business-token'}})).json();assert.equal(saved.lead.status,'INTERESTED');assert.equal(saved.lead.notes,'Test notes <script>literal only</script>');
 await click('[data-back]');await click(`[data-id="${lead.id}"]`);assert.equal(await js("document.querySelector('[name=notes]').value"),saved.lead.notes);
 console.log('PASS Business OS navigation, real D1 lead, detail, persisted notes/status and escaping');
 assert.deepEqual(await js("[...document.querySelectorAll('[data-module^=property-business-]')].map(e=>e.textContent.trim().replace(/^[⌂◎◫▷]\\s*/,''))"),['Overview','Prospects','Leads','Property Films']);
   assert(await js("document.querySelector('.nav-section-property')?.open && !!document.querySelector('.nav-section-tradeos') && !!(document.querySelector('.nav-section-property').compareDocumentPosition(document.querySelector('.nav-section-tradeos')) & Node.DOCUMENT_POSITION_FOLLOWING)"));
 await click('[data-module="property-business-overview"]');await wait("document.querySelector('.pb-counts')");
 assert(await js("Number(document.querySelector('.pb-counts strong').textContent)>0"));
 await click('[data-module="property-business-prospects"]');await wait("document.querySelector('[data-property-business-page=prospects]')");
 assert(await js("document.querySelector('[data-property-business-page]').textContent.includes('Premier Cottages')"));
 await click('[data-module="property-business-films"]');await wait("document.querySelector('[data-formspree]')");
 assert(await js("!document.querySelector('[data-property-business-page]').textContent.includes('local-property-business-token')"));
 await click('[data-module="property-business-leads"]');await wait("document.querySelector('[data-id]')");
 console.log('PASS separated Property Business navigation, overview counts, prospects source panel, offer configuration and shared connection');
 for(const width of [375,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:812,deviceScaleFactor:1,mobile:width<600});
  assert(await js('document.documentElement.scrollWidth<=innerWidth'),'Admin no overflow');
  if(width<600)await click('#menuToggle');
  await js("document.querySelector('[data-module=property-business-films]').scrollIntoView({block:'nearest'})");
  assert(await js("document.querySelector('[data-module=property-business-films]').getBoundingClientRect().bottom<=innerHeight"),'Property navigation accessible on short screen');
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/property-business-${width}.png`,Buffer.from(shot.data,'base64'));
 }
 // Test actual playback with a disposable solid-colour fixture, never a public example asset.
 const generated=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=black:s=640x360:d=2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','/tmp/property-films-browser-fixture.mp4'],{stdio:'ignore'});
 assert.equal(generated.status,0,'Generate disposable test film');
 await send('Page.navigate',{url:'http://127.0.0.1:8792/property-films/'});
 await wait("document.querySelector('#showcase') && !document.querySelector('#showcase').hidden");
 assert(await js("document.querySelector('#film-placeholder').hidden && !document.querySelector('#showcase').autoplay && document.querySelector('#showcase').controls"));
 assert(await js("!document.querySelector('#photography-claim').textContent.includes('EVERYTHING YOU JUST WATCHED')"));
 await js("window.testEvents=[];window.addEventListener('property-films:analytics',e=>testEvents.push(e.detail.event));document.querySelector('#showcase').muted=true;document.querySelector('#showcase').play()");
 await wait("testEvents.includes('property_films_example_video_completed')");
 assert(await js("testEvents.includes('property_films_example_video_started') && testEvents.includes('property_films_example_video_50_percent')"));
 await js("document.querySelector('#showcase').dispatchEvent(new Event('error'))");
 assert(await js("document.querySelector('#showcase').hidden && !document.querySelector('#film-placeholder').hidden"));
 console.log('PASS automatic MP4 detection, native playback, no autoplay, claim guard, video milestones and media failure fallback');
 assert.deepEqual(errors,[],'No JavaScript exceptions or console errors');
 console.log('PASS console: no JavaScript errors; expected missing MP4 HEAD 404 remains until the asset is supplied');
} finally {await fs.rm('/tmp/property-films-browser-fixture.mp4',{force:true});ws?.close();chrome.kill();await pause(150);await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
