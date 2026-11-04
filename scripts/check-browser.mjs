// Dependency-free Chrome smoke test. Enquiries are mocked on loopback only.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const audit = join(root, '.audit');
await mkdir(audit, {recursive:true});
const manifest = JSON.parse(await readFile(join(audit, 'live-manifest.json')));
const production = new Set(JSON.parse(await readFile(join(root, 'production-files.json'))));
let posted = [], postMode = 'success';
async function serve(directory) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'POST' && path === '/api/enquiries/agency') {
        const chunks=[];for await (const c of req) chunks.push(c);
        posted.push(JSON.parse(Buffer.concat(chunks).toString()));
        res.writeHead(postMode === 'error' ? 503 : 200, {'Content-Type':'application/json'});
        res.end(JSON.stringify(postMode === 'error' ? {error:'Mock unavailable; retry safely.'} : {status:'sent'}));return;
      }
      if (req.method !== 'GET') {res.writeHead(405);res.end();return;}
      const record = manifest.files[path === '/agency-partners/' ? '/agency-partners' : path];
      if (!record || !production.has(record.file)) {res.writeHead(404);res.end('Not found');return;}
      const body=await readFile(join(directory,record.file));
      res.writeHead(200, record.headers);res.end(body);
    } catch {res.writeHead(500);res.end('Fixture failed');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {server, origin:`http://127.0.0.1:${server.address().port}`};
}
const baseline=await serve(join(audit,'live')), local=await serve(join(root,'dist'));
const chrome=spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${join(audit,'chrome')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket;
try {
  const debuggerOrigin=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('Chrome start timeout')),10000);
    chrome.stderr.on('data',c=>{output+=c;const m=output.match(/DevTools listening on ws:\/\/(127\.0\.0\.1:\d+)/);if(m){clearTimeout(timer);resolve('http://'+m[1]);}});
    chrome.once('error',reject);
  });
  const pages=await fetch(debuggerOrigin+'/json/list').then(r=>r.json());
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(socket,'open');
  let sequence=0;const pending=new Map(), exceptions=[],badResponses=[],requests=[];
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);
    if(m.method==='Network.responseReceived' && m.params.response.status>=400)badResponses.push(m.params.response.url);
    if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});
  });
  function send(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async function waitFor(expression){for(let i=0;i<200;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out '+expression);}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const results=[];
  for(const width of [1440,768,375]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const path of ['/','/agency-partners/']) {
      const shots=[];
      for(const [kind,fixture] of [['baseline',baseline],['local',local]]) {
        await send('Page.navigate',{url:fixture.origin+path});
        await waitFor('document.readyState === "complete" && document.querySelector(".brand-grid") && [...document.images].every(i=>i.complete && i.naturalWidth > 0)');
        await evaluate('document.fonts.ready');
        assert(await evaluate('document.fonts.check("600 16px Inter")'),'Font failed');
        assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'Horizontal overflow');
        assert(await evaluate('[...document.querySelectorAll("a[href^=\\"#\\"]")].every(a=>document.getElementById(a.hash.slice(1)))'),'Broken anchors');
        const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        const bytes=Buffer.from(shot.data,'base64');shots.push(bytes);
        await writeFile(join(audit,`${kind}-${path==='/'?'home':'agency'}-${width}.png`),bytes);
        results.push({kind,path,width,images:await evaluate('document.images.length'),font:true,noOverflow:true});
        if(kind==='local' && path==='/')assert(await evaluate('document.body.innerText.includes("for more than 30 years.")'));
      }
      if(path==='/agency-partners/')assert(shots[0].equals(shots[1]),'Agency visual baseline differs');
    }
  }
  // Rotation still works when visitors have not requested reduced motion.
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await send('Page.navigate',{url:local.origin+'/'});
  await waitFor('document.readyState === "complete" && document.querySelector("#brand-pause") && !document.querySelector("#brand-pause").hidden');
  const initial=await evaluate('[...document.querySelectorAll(".brand-grid img")].map(i=>i.src).join()');
  await waitFor(`[...document.querySelectorAll('.brand-grid img')].map(i=>i.src).join() !== ${JSON.stringify(initial)}`);
  await evaluate('document.querySelector("#brand-pause").click()');
  assert.equal(await evaluate('document.querySelector("#brand-pause").getAttribute("aria-pressed")'),'true');
  await evaluate('document.querySelector("#brand-pause").click()');
  assert.equal(await evaluate('document.querySelector("#brand-pause").getAttribute("aria-pressed")'),'false');
  // Follow the homepage CTA into Agency Partners.
  await evaluate('document.querySelector(".hero-actions a").click()');
  await waitFor('location.pathname === "/agency-partners/" && location.hash === "#enquiry" && document.querySelector("#agency-enquiry-form fieldset").disabled === false');
  const fill=`(() => {const f=document.querySelector('#agency-enquiry-form');f.elements.name.value='Local test';f.elements.company.value='Fixture agency';f.elements.email.value='test@example.com';f.elements.project_summary.value='Mock submission, never sent to production.';f.elements.response_requested.checked=true;f.requestSubmit();})()`;
  await evaluate('document.querySelector("#agency-enquiry-form").requestSubmit()');
  assert.equal(posted.length,0,'HTML validation did not block empty form');
  postMode='error';await evaluate(fill);
  await waitFor('document.querySelector("#agency-form-status").textContent.includes("Mock unavailable")');
  const first=posted[0];assert(first.response_requested && first.submission_id && first.email==='test@example.com');
  postMode='success';await evaluate('document.querySelector("#agency-enquiry-form").requestSubmit()');
  await waitFor('document.querySelector("#agency-form-status").textContent.includes("received successfully")');
  assert.deepEqual(posted[1],first,'Retry changed idempotency payload');
  assert(await evaluate('document.querySelector("#agency-enquiry-form fieldset").disabled'));
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  assert.deepEqual(badResponses.filter(x=>!x.endsWith('/api/enquiries/agency')),[]);
  assert(requests.every(x=>x.url.startsWith('http://127.0.0.1:')),'Browser made an external request');
  const report={checks:results,agencyScreenshotsIdentical:true,rotationAndPause:true,ctaNavigation:true,formValidation:true,mockedFormSuccessAndRetry:true,externalRequests:0,missingAssets:0,consoleExceptions:0};
  await writeFile(join(audit,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS: desktop/tablet/mobile; Agency screenshots match live baseline; fonts/images/anchors; logo rotation/pause; CTA navigation; form validation, mocked error/retry/success; no external requests or JS exceptions.');
} finally {
  socket?.close();chrome.kill();
  await Promise.all([baseline,local].map(({server})=>new Promise(r=>{server.close(r);server.closeAllConnections();})));
}
