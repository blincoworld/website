import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'property-preview-chrome-'));
const chrome=spawn('/opt/google/chrome/chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}assert(port);
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){pending.get(x.id)?.(x);pending.delete(x.id);}};
 async function send(method,params={}){const x=await new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});if(x.error)throw new Error(JSON.stringify(x.error));return x.result;}
 async function js(expression){return (await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;}
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.fetch=(url)=>Promise.resolve(new Response(JSON.stringify({business_name:'Preview Cottages',video_url:String(url)+'/video'}),{status:200}));`});
 for(const [width,height,label] of [[375,812,'mobile'],[1440,900,'desktop']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  await send('Page.navigate',{url:'http://127.0.0.1:8792/property-films/preview/?token='+ 'a'.repeat(48)});
  for(let i=0;i<50&&!await js("document.querySelector('#content') && !document.querySelector('#content').hidden");i++)await pause(100);
  assert.equal(await js("document.querySelector('#business').textContent"),'Preview Cottages');
  assert(await js('document.documentElement.scrollWidth <= innerWidth'),label+' overflow');
  assert(await js("document.querySelector('video').controls && document.querySelector('video').playsInline"));
  assert(await js("document.querySelector('meta[name=robots]').content==='noindex, nofollow'"));
  console.log('PASS '+label+' public preview layout');
 }
}finally{ws?.close();chrome.kill();await pause(400);await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});}
