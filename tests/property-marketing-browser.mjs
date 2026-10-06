// Browser regression for consent controls. All chatbot and callback APIs mocked; no emails.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'marketing-browser-'));
const chrome=spawn('/opt/google/chrome/chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try {
 let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}assert(port);
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[],decisions=[];
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);};
 async function send(method,params={}){const d=await new Promise(r=>{const next=++id;pending.set(next,r);ws.send(JSON.stringify({id:next,method,params}));});if(d.error)throw Error(JSON.stringify(d.error));return d.result;}
 async function js(expression){const d=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(d.exceptionDetails)throw Error(JSON.stringify(d.exceptionDetails));return d.result.value;}
 async function wait(expression){for(let i=0;i<150;i++){if(await js(expression))return;await sleep(100);}throw Error('Timed out: '+expression);}
 let known=false,state='new';
 await send('Runtime.enable');await send('Page.enable');
 ws.addEventListener('message',async event=>{
  const data=JSON.parse(event.data);if(data.method!=='Fetch.requestPaused')return;
  const {requestId,request}=data.params;const body=JSON.parse(request.postData||'{}');
  let reply='Happy to help.',action='none',marketingOffer;
  if(body.marketingAction){decisions.push(body);if(body.marketingAction==='decline'){state='declined';reply='No problem.';}else if(body.marketingAction==='accept'&&!known){state='email';reply='What email address would you like me to use?';action='marketing_email';}else {state='subscribed';reply='Perfect — I’ll keep you updated.';}}
  else if(body.message?.includes('later')&&state==='new'){state='offered';marketingOffer={offer:'Not ready to go ahead yet? I can keep you updated with new examples, offers and Property Films news.',wording:'Yes, email me new Property Films examples, offers and news. I can unsubscribe at any time.',email:known?'known@example.com':null};}
  await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'Content-Type'},{name:'Access-Control-Allow-Methods',value:'POST,OPTIONS'}],body:Buffer.from(JSON.stringify({success:true,reply,action,sessionId:'12345678-1234-4123-8123-123456789abc',marketingOffer,wording:'Yes, email me new Property Films examples, offers and news. I can unsubscribe at any time.'})).toString('base64')});
 });
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/property-business/property-films/*'}]});
 const base=process.env.PROPERTY_FILMS_TEST_URL||'http://127.0.0.1:8792';
 async function fresh(){state='new';await send('Page.navigate',{url:base+'/property-films/'});await sleep(500);await wait("document.querySelector('#property-chat-launcher')");await js('sessionStorage.clear()');await send('Page.reload');await sleep(500);await wait("document.querySelector('#property-chat-launcher')");await js("document.querySelector('#property-chat-launcher').click()");assert.equal(await js("document.querySelectorAll('.property-chat-action-card').length"),0);}
 async function message(text){await js(`document.querySelector('#property-chat-input').value=${JSON.stringify(text)};document.querySelector('#property-chat-form').requestSubmit()`);await wait("!document.querySelector('#property-chat-send').disabled");}
 await fresh();await message('Hello');await message('Maybe later');await wait("document.querySelector('.property-chat-action-card')");
 await js("[...document.querySelectorAll('.property-chat-action-card button')].find(b=>b.textContent==='Yes, keep me updated').click()");
 await wait("document.querySelector('[name=marketing_email]')");
 await js("document.querySelector('[name=marketing_email]').value='browser@example.com';document.querySelector('[name=marketing_email]').form.requestSubmit()");
 await wait("document.querySelector('#property-chat-messages').textContent.includes('Perfect')");
 assert.equal(decisions.at(-1).email,'browser@example.com');await message('Maybe later');assert.equal(await js("document.querySelectorAll('.property-chat-action-card').length"),0);
 known=true;await fresh();await message('Hello');await message('Maybe later');await wait("document.querySelector('.property-chat-action-card')");
 assert(await js("document.querySelector('.property-chat-action-card').textContent.includes('known@example.com')"));
 await js("document.querySelector('.property-chat-action-card button').click()");await wait("document.querySelector('#property-chat-messages').textContent.includes('Perfect')");assert.equal(decisions.at(-1).email,'known@example.com');
 await fresh();await message('Hello');await message('Maybe later');await wait("document.querySelector('.property-chat-action-card')");await js("[...document.querySelectorAll('.property-chat-action-card button')].find(b=>b.textContent==='No thanks').click()");await wait("document.querySelector('#property-chat-messages').textContent.includes('No problem')");await message('Maybe later');assert.equal(await js("document.querySelectorAll('.property-chat-action-card').length"),0);
 assert.deepEqual(errors,[]);console.log('Marketing browser: unknown email, known email, decline, no repeated offer, no opening offer passed. All APIs mocked.');
}finally{ws?.close();chrome.kill();await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
