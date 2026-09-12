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
 async function wait(expression){for(let i=0;i<300;i++){if(await js(expression))return;await sleep(100);}throw Error('Timed out: '+expression);}
 const click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 const fill=(s,v)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(s)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await send('Runtime.enable');await send('Page.enable');
 // The existing shell has no favicon; don't issue unrelated favicon fallback requests.
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"document.addEventListener('DOMContentLoaded',()=>{const e=document.createElement('link');e.rel='icon';e.href='data:,';document.head.appendChild(e);});"});
 for(const width of [320,375,412,768,1024,1440]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
 await send('Page.navigate',{url:base+'/property-films/packages'});
 await wait("document.querySelector('[data-choose]') && !document.querySelector('[data-choose]').disabled");
 assert(await js('document.documentElement.scrollWidth<=innerWidth'),'Overflow '+width);
 assert.equal(await js("document.querySelectorAll('[data-package]').length"),3);
 assert(!await js("/\\bVAT\\b/i.test(document.body.innerText)"));
 assert.equal(await js("document.querySelector('[data-property-count]').options.length"),3);
 for(const [key,count,a,b] of [['essential',1,'£495','£790'],['signature',1,'£795','£1,290'],['multi-property',1,'£795','£1,590'],['multi-property',2,'£1,190','£1,985'],['multi-property',3,'£1,585','£2,380']]){
 const card=`[data-package="${key}"]`;
 if(key==='multi-property') await js(`(()=>{const select=document.querySelector('[data-property-count]');select.value='${count}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await js(`document.querySelector('${card} [data-total]').textContent`),a);
 await click(card+' input');
 assert.equal(await js(`document.querySelector('${card} [data-total]').textContent`),b);
 await click(card+' [data-choose]');
 assert(await js(`document.querySelector('[data-preview]').textContent.includes('${b}')`));
 await click(card+' input');
 assert.equal(await js(`document.querySelector('${card} [data-total]').textContent`),a);
 await click(card+' [data-choose]');
 assert(await js(`document.querySelector('[data-preview]').textContent.includes('${a}')`));
 if(key==='multi-property') assert(await js(`document.querySelector('[data-preview]').textContent.includes('(${count} ${count===1?'property':'properties'})')`));
 }
 await js("scrollTo({top:0,behavior:'instant'})");await sleep(300);
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(`/tmp/property-packages-${base.includes('https:')?'production':'local'}-${width}.png`,Buffer.from(shot.data,'base64'));
 console.log('PASS packages '+width+'px, all ten price combinations');
 }
 await send('Page.navigate',{url:base+'/property-films/packages/'});await wait("document.querySelector('[data-choose]') && !document.querySelector('[data-choose]').disabled");
 await js("document.querySelector('input').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 assert(await js("document.querySelector('input').checked"));
 assert.deepEqual(errors,[]);console.log('PASS keyboard and no browser exceptions');
}finally{ws?.close();const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();await stopped;await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
