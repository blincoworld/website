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
const withYears = s => s.replaceAll('{years}', years);
const experienceHeading = withYears(home.sections.find(s=>s.type==='experience').heading);
const gridCount = Math.min(6, brands.length);
const remoteOrigin = process.env.SITE_ORIGIN?.replace(/\/$/, '');
if (remoteOrigin) assert(new URL(remoteOrigin).protocol === 'https:', 'Remote checks require HTTPS');
const label = process.env.SITE_LABEL || (remoteOrigin ? 'remote' : 'static');
assert(/^[a-z0-9-]+$/.test(label));
const local = remoteOrigin ? {origin:remoteOrigin,requests:[],close:async()=>{}} : await serve(join(root,'dist'), files);
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
      assert(await evaluate(`!document.querySelector('form,input,textarea,nav,.hero-actions,.contact-banner,.button')`));
      assert.equal(await evaluate('document.querySelectorAll("button").length'),1);
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
  // Unknown paths return 404; there is no backend, proxy or homepage fallback.
  for (const path of ['/agency-partners/','/api/pages/home','/api/enquiries/agency','/missing']) {
    assert.equal((await fetch(local.origin+path)).status,404,path);
  }
  // On production, Cloudflare's Web Analytics may inject its beacon script into some responses (it did for GitHub's
  // runners on 6 Nov 2026). The site's CSP blocks it, so it never runs; that one blocked script is not a site fault
  // (D-208). Only on remote checks, and only that exact host: any other error or external request still fails.
  const injected = s => remoteOrigin && /^https:\/\/static\.cloudflareinsights\.com\//.test(String(s).match(/https:\/\/\S+/)?.[0] || '') && /Content Security Policy|cloudflareinsights/.test(String(s));
  assert.deepEqual(chrome.exceptions,[]);
  assert.deepEqual(chrome.consoleErrors.filter(m=>!injected(m)),[]);
  assert.deepEqual(chrome.badResponses,[]);
  assert(chrome.requests.every(r=>r.url.startsWith(local.origin) || reference && r.url.startsWith(reference.origin) || injected(r.url)),'External request attempted');
  assert(chrome.requests.every(r=>['GET','HEAD'].includes(r.method)),'Write request attempted');
  if(!remoteOrigin) assert(local.requests.filter(r=>r.path.startsWith('/api/')).length===2,'Unexpected API traffic');
  assert(!chrome.requests.some(r=>new URL(r.url).pathname.startsWith('/api/')),'Page made a runtime API request'); // Only explicit 404 checks above.
  const report={origin:local.origin,checks:result,visualComparisonWithOriginalCss:Boolean(reference),allLogoImagesDecoded:brands.length,rotationPauseResume:true,viewAllKeyboard:true,noJavaScriptFallback:true,skipLinkKeyboard:true,noMissingAssets:true,noRuntimeApiCalls:true,noExternalRequests:true,exceptions:[]};
  await writeFile(join(audit,`${label}-browser-results.json`),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS: 1440/768/375px; retained design unchanged by CSS trimming; ${years}-year content/SEO; all ${brands.length} logos; rotation/pause/resume; keyboard view-all/skip link; no-JS fallback; no missing assets, external requests, CMS calls or JS errors.`);
} finally {chrome?.close();await local.close();await reference?.close();}
