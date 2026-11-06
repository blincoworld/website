// Standalone static-site smoke test. Only a local file server is available.
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { browser, serve } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
const audit = join(root, '.audit/static-portfolio');
await mkdir(audit, {recursive:true});
const files = new Set(JSON.parse(await readFile(join(root,'production-files.json'))));
const brands = JSON.parse(await readFile(join(root,'brands.json')));
// Expected copy comes from the content the page is rendered from (D-208).
const site = JSON.parse(await readFile(join(root,'content/site.json')));
const home = JSON.parse(await readFile(join(root,'content/home.json')));
const years = String(site.experienceYears);
const privacy = JSON.parse(await readFile(join(root,'content/privacy.json')));
// The contact form (D-211) is a movable homepage section; without it the page has no form controls.
const hasContact = home.sections.some(s=>s.type==='contact');
const api = {enquiry:{status:503,body:{ok:false,error:'unavailable'}}};
const withYears = s => s.replaceAll('{years}', years);
const experienceHeading = withYears(home.sections.find(s=>s.type==='experience').heading);
const gridCount = Math.min(6, brands.length);
const remoteOrigin = process.env.SITE_ORIGIN?.replace(/\/$/, '');
if (remoteOrigin) assert(new URL(remoteOrigin).protocol === 'https:', 'Remote checks require HTTPS');
const label = process.env.SITE_LABEL || (remoteOrigin ? 'remote' : 'static');
assert(/^[a-z0-9-]+$/.test(label));
const local = remoteOrigin ? {origin:remoteOrigin,requests:[],close:async()=>{}} : await serve(join(root,'dist'), files, {}, api);
let reference, chrome;
try {
  // Optional one-time visual comparison: simplified HTML with original full CSS.
  const hasReference = await access(join(audit,'original-styles.css')).then(()=>true,()=>false);
  if (hasReference) reference = await serve(join(root,'dist'), files, {
    '/':join(audit,'reference-index.html'),
    '/styles.css':join(audit,'original-styles.css'),
    '/site.js':join(audit,'original-site.js'),
  });
  chrome = await browser(join(audit,'browser-check'));
  const {send,evaluate,waitFor} = chrome;
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const loaded = 'document.readyState === "complete" && document.querySelector(".brand-grid") && [...document.images].every(i=>i.complete && i.naturalWidth>0)';
  const result = [];
  for (const width of [1440,768,375]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    const shots = [];
    for (const [name,fixture] of [...(reference?[['reference',reference]]:[]),['static',local]]) {
      await send('Page.navigate',{url:fixture.origin});await waitFor(loaded);await evaluate('document.fonts.ready');
      assert(await evaluate('document.fonts.check("600 16px Inter")'),'Local font failed');
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow');
      assert.equal(await evaluate('document.querySelector(".experience-number").textContent'),`${years}+`);
      assert.equal(await evaluate('document.querySelector("#experience-heading").textContent'),experienceHeading);
      assert(await evaluate(`!document.querySelector('nav,.hero-actions,.contact-banner,.button')`));
      if (hasContact) {
        assert.equal(await evaluate('document.querySelectorAll("form").length'),1);
        assert.deepEqual(await evaluate('[...document.querySelectorAll("#contact-form [name]")].map(e=>e.name)'),['name','email','phone','business','need','message','website']);
        // Every visible field has a label; the honeypot is off-screen and out of the tab order.
        assert(await evaluate('[...document.querySelectorAll("#contact-form input,#contact-form select,#contact-form textarea")].every(e=>document.querySelector(`label[for="${e.id}"]`))'));
        assert(await evaluate('document.querySelector("#cf-website").tabIndex===-1 && document.querySelector(".contact-hp").getBoundingClientRect().right<0'));
      } else assert(await evaluate(`!document.querySelector('form,input,textarea,select')`));
      assert.equal(await evaluate('document.querySelectorAll("button").length'),hasContact?2:1);
      assert.equal(await evaluate('document.querySelectorAll(".brand-slot img").length'),gridCount);
      assert(await evaluate('document.querySelector(".portrait").naturalWidth>0'));
      assert(await evaluate('[...document.querySelectorAll("a[href^=\\"#\\"]")].every(a=>document.getElementById(a.hash.slice(1)))'));
      assert(await evaluate('document.querySelector("#brand-pause").hidden'),'Reduced-motion pause state');
      const meta = await evaluate(`Object.fromEntries([...document.querySelectorAll('meta[name],meta[property]')].map(m=>[m.name||m.getAttribute('property'),m.content]))`);
      assert.equal(meta.description,meta['og:description']);
      assert(meta.description.includes(withYears(home.seo.description)));
      assert.equal(await evaluate('document.querySelector("link[rel=canonical]").href'),'https://piersblinco.com/');
      assert.equal(meta['og:url'],'https://piersblinco.com/');
      assert(!/\b30\s*\+?\s*years/i.test(await evaluate('document.body.innerText')));
      const png = Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64');
      shots.push(png);await writeFile(join(audit,`${name==='static'?label:name}-${width}.png`),png);
      // The native directory works by keyboard and includes every organisation.
      await evaluate('document.querySelector(".brand-directory summary").focus()');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await waitFor('document.querySelector(".brand-directory").open');
      const names = await evaluate('[...document.querySelectorAll(".brand-directory li")].map(li=>li.textContent)');
      assert.deepEqual(names,brands.map(b=>b.name));
      assert(await evaluate('document.querySelector(".brand-directory ul").getBoundingClientRect().height>0'));
      result.push({width,kind:name,font:true,portrait:true,initialLogos:gridCount,directoryNames:names.length,noOverflow:true,experience:`${years}+`});
    }
    // The privacy notice (D-211): same look, no overflow, linked from the footer.
    await send('Page.navigate',{url:`${local.origin}/privacy`});await waitFor('document.readyState === "complete"');await evaluate('document.fonts.ready');
    assert.equal(await evaluate('document.querySelector("h1").textContent'),privacy.title);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`Privacy page overflows at ${width}px`);
    assert.equal(await evaluate('document.querySelectorAll(".legal-body h2").length'),privacy.sections.length);
    assert(await evaluate('document.querySelector(".footer-links a").getAttribute("href")==="/privacy"'));
    await writeFile(join(audit,`${label}-privacy-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
    if(reference) assert(shots[0].equals(shots[1]),`Trimmed CSS changed retained design at ${width}px`);
  }
  // Initial portrait/logos and all 33 names remain available without JavaScript.
  await send('Emulation.setScriptExecutionDisabled',{value:true});
  await send('Page.navigate',{url:local.origin});await waitFor(loaded);await evaluate('document.fonts.ready');
  assert.equal(await evaluate('document.querySelectorAll(".brand-directory li").length'),brands.length);
  await evaluate('document.querySelector(".brand-directory summary").click()');
  assert(await evaluate('document.querySelector(".brand-directory").open'));
  assert(await evaluate('document.querySelector("#brand-pause").hidden'));
  await send('Emulation.setScriptExecutionDisabled',{value:false});
  // Normal motion: test rotation, sustained pause, resume and keyboard focus.
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await send('Page.navigate',{url:local.origin});await waitFor(loaded);
  await waitFor('!document.querySelector("#brand-pause").hidden');
  const current = '[...document.querySelectorAll(".brand-slot img")].map(i=>i.src).join()';
  const initial = await evaluate(current);
  await waitFor(`${current} !== ${JSON.stringify(initial)}`);
  await evaluate('document.querySelector("#brand-pause").click()');
  assert.equal(await evaluate('document.querySelector("#brand-pause").getAttribute("aria-pressed")'),'true');
  const paused = await evaluate(current);await new Promise(r=>setTimeout(r,4500));
  assert.equal(await evaluate(current),paused,'Logos rotated while paused');
  await evaluate('document.querySelector("#brand-pause").click()');
  await waitFor(`${current} !== ${JSON.stringify(paused)}`);
  assert.equal(await evaluate('new Set([...document.querySelectorAll(".brand-slot img")].map(i=>i.src)).size'),gridCount);
  // Decode every manifest image in the browser, not merely its initial six.
  const decoded = await evaluate(`Promise.all(${JSON.stringify(brands)}.map(b=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth?resolve(b.name):reject(Error(b.name));image.onerror=()=>reject(Error(b.name));image.src=b.src;})))`);
  assert.equal(decoded.length,brands.length);
  // Every content image (portrait, image blocks) decodes too.
  assert(await evaluate('[...document.images].every(i=>i.complete && i.naturalWidth>0)'));
  // Reload and tab to the skip link, then activate its native in-page target.
  await send('Page.navigate',{url:local.origin});await waitFor(loaded);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.activeElement.className'),'skip-link');
  assert(await evaluate('document.activeElement.getBoundingClientRect().top>=0'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await waitFor('location.hash === "#main"');
  // Automated browsers send no visit ping (navigator.webdriver), so nothing above was counted.
  assert(!local.requests.some(r=>r.method==='POST'),'Automated browser sent a ping');
  if (!remoteOrigin) {
    // Visit pings (D-210), as a real browser would send them: one per page load, path only; ?notrack=1 stops them in
    // this browser and ?notrack=0 starts them again (neither of those loads is counted).
    const {identifier} = await send('Page.addScriptToEvaluateOnNewDocument',{source:'Object.defineProperty(Navigator.prototype,"webdriver",{get:()=>false})'});
    const pings = () => local.requests.filter(r=>r.method==='POST' && r.path==='/api/v');
    const visit = async (path, expectPing) => {
      const before = pings().length;
      await send('Page.navigate',{url:local.origin+path});await waitFor(loaded.replace('&& document.querySelector(".brand-grid")', path.startsWith('/privacy') ? '' : '&& document.querySelector(".brand-grid")'));
      await new Promise(r=>setTimeout(r,400));
      assert.equal(pings().length-before,expectPing?1:0,`${path}: ping ${expectPing?'expected':'not expected'}`);
      return pings().at(-1);
    };
    assert.deepEqual(JSON.parse((await visit('/',true)).body),{p:'/'});
    assert.deepEqual(JSON.parse((await visit('/?r=clinic-42',true)).body),{p:'/',c:'clinic-42'});
    await visit('/?notrack=1',false);
    assert.equal(await evaluate('localStorage.getItem("pb-notrack")'),'1');
    await visit('/',false);
    await visit('/privacy',false);
    await visit('/?notrack=0',false);
    assert.equal(await evaluate('localStorage.getItem("pb-notrack")'),null);
    assert.deepEqual(JSON.parse((await visit('/privacy',true)).body),{p:'/privacy'});
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});

    if (hasContact) {
      // The contact form (D-211), with Cloudflare Turnstile replaced by a stub that hands over a token.
      await send('Fetch.enable',{patterns:[{urlPattern:'https://challenges.cloudflare.com/*'}]});
      const stub = 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("stub-token"),50);return "w1";},reset:()=>{}};window.pbTurnstileReady&&window.pbTurnstileReady();';
      chrome.on('Fetch.requestPaused',p=>{send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(stub).toString('base64')}).catch(()=>{});});
      const enquiries = () => local.requests.filter(r=>r.method==='POST' && r.path==='/api/enquiry');
      const fill = `(()=>{const f=document.querySelector("#contact-form");const v={name:"Jo Bloggs",email:"jo@example.com",phone:"",business:"Example Clinic",need:"online_booking",message:"Hello"};for(const[k,x] of Object.entries(v))f.elements[k].value=x;f.elements.name.focus();})()`;
      const open = async () => { await send('Page.navigate',{url:local.origin});await waitFor(loaded); };
      const submitForm = 'document.querySelector(".contact-submit").click()';
      // Empty: field messages, nothing sent, Turnstile not loaded until the form is used.
      await open();
      assert(!chrome.requests.some(r=>r.url.startsWith('https://challenges.cloudflare.com/')),'Turnstile loaded before the form was used');
      await evaluate(submitForm);
      await waitFor('!document.querySelector("#cf-name-error").hidden');
      assert.equal(await evaluate('document.querySelector("#cf-name").getAttribute("aria-invalid")'),'true');
      assert.equal(enquiries().length,0);
      // Sent: the thank-you message replaces the form.
      api.enquiry = {status:200,body:{ok:true}};
      await evaluate(fill);await evaluate(submitForm);
      await waitFor('document.querySelector(".contact-done")');
      const sent = JSON.parse(enquiries().at(-1).body);
      assert.deepEqual(sent,{name:'Jo Bloggs',email:'jo@example.com',phone:'',business:'Example Clinic',need:'online_booking',message:'Hello',website:'',turnstile:'stub-token',path:'/'});
      // The Back Office's field messages are shown against the fields.
      await open();api.enquiry = {status:400,body:{ok:false,error:'invalid',fields:{email:'That email address doesn’t look right.'}}};
      await evaluate(fill);await evaluate(submitForm);
      await waitFor('!document.querySelector("#cf-email-error").hidden');
      // The Back Office down (the site Worker answers "unavailable"): a friendly message with the email address.
      await open();api.enquiry = {status:503,body:{ok:false,error:'unavailable'}};
      await evaluate(fill);await evaluate(submitForm);
      await waitFor('document.querySelector("#contact-status a[href=\'mailto:piers@piersblinco.com\']")');
      assert.match(await evaluate('document.querySelector("#contact-status").textContent'),/Please email me instead at piers@piersblinco\.com/);
      assert(await evaluate('document.querySelector("#contact-form")'),'The form stays, with what was typed');
      await send('Fetch.disable');
    }
  }
  // Unknown paths return 404; there is no backend, proxy or homepage fallback.
  for (const path of ['/agency-partners/','/api/pages/home','/api/enquiries/agency','/missing']) {
    assert.equal((await fetch(local.origin+path)).status,404,path);
  }
  // On production, Cloudflare's Web Analytics may inject its beacon script into some responses (it did for GitHub's
  // runners on 6 Nov 2026). The site's CSP blocks it, so it never runs; that one blocked script is not a site fault
  // (D-208). Only on remote checks, and only that exact host: any other error or external request still fails.
  const injected = s => remoteOrigin && /^https:\/\/static\.cloudflareinsights\.com\//.test(String(s).match(/https:\/\/\S+/)?.[0] || '') && /Content Security Policy|cloudflareinsights/.test(String(s));
  assert.deepEqual(chrome.exceptions,[]);
  // The form test's deliberate 400 and 503 answers from /api/enquiry are logged by Chrome; nothing else may be.
  const formTest = hasContact && !remoteOrigin;
  const expectedFail = m => formTest && /^Failed to load resource: the server responded with a status of (400|503) /.test(m);
  assert.deepEqual(chrome.consoleErrors.filter(m=>!injected(m) && !expectedFail(m)),[]);
  assert.equal(chrome.consoleErrors.filter(expectedFail).length, formTest ? 2 : 0);
  assert.deepEqual(chrome.badResponses.filter(u=>!(formTest && new URL(u).pathname==='/api/enquiry')),[]);
  // The only outside request is Turnstile's script, and only in the form test above (served by the stub).
  const turnstile = u => hasContact && !remoteOrigin && u.startsWith('https://challenges.cloudflare.com/turnstile/v0/api.js');
  assert(chrome.requests.every(r=>r.url.startsWith(local.origin) || reference && r.url.startsWith(reference.origin) || injected(r.url) || turnstile(r.url)),'External request attempted');
  // The only writes: visit pings and the form, in the tests above.
  assert(chrome.requests.every(r=>['GET','HEAD'].includes(r.method) || ['/api/v','/api/enquiry'].includes(new URL(r.url).pathname) && !remoteOrigin),'Unexpected write request');
  if(!remoteOrigin) assert(local.requests.filter(r=>r.path.startsWith('/api/') && r.method==='GET').length===2,'Unexpected API traffic');
  const report={origin:local.origin,checks:result,visualComparisonWithOriginalCss:Boolean(reference),allLogoImagesDecoded:brands.length,rotationPauseResume:true,viewAllKeyboard:true,noJavaScriptFallback:true,skipLinkKeyboard:true,noMissingAssets:true,visitPingsAndNotrack:!remoteOrigin,contactForm:hasContact && !remoteOrigin,privacyPage:true,noExternalRequests:true,exceptions:[]};
  await writeFile(join(audit,`${label}-browser-results.json`),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS: 1440/768/375px; retained design unchanged by CSS trimming; ${years}-year content/SEO; all ${brands.length} logos; rotation/pause/resume; keyboard view-all/skip link; no-JS fallback; privacy page; ${remoteOrigin ? 'no pings from automated browsers' : 'visit pings and ?notrack'}; contact form ${hasContact ? (remoteOrigin ? 'present' : 'sent, field errors, Back Office down') : 'not on the page'}; no missing assets, unexpected external requests or JS errors.`);
} finally {chrome?.close();await local.close();await reference?.close();}
