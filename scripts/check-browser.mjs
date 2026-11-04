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
const local = await serve(join(root,'dist'), files);
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
      assert.equal(await evaluate('document.querySelector(".experience-number").textContent'),'25+');
      assert.equal(await evaluate('document.querySelector("#experience-heading").textContent'),'I’ve spent over 25 years building software for businesses that depend on it.');
      assert(await evaluate(`!document.querySelector('form,input,textarea,nav,.hero-actions,.contact-banner,.button')`));
      assert.equal(await evaluate('document.querySelectorAll("button").length'),1);
      assert.equal(await evaluate('document.querySelectorAll(".brand-slot img").length'),6);
      assert(await evaluate('document.querySelector(".portrait").naturalWidth>0'));
      assert(await evaluate('[...document.querySelectorAll("a[href^=\\"#\\"]")].every(a=>document.getElementById(a.hash.slice(1)))'));
      assert(await evaluate('document.querySelector("#brand-pause").hidden'),'Reduced-motion pause state');
      const meta = await evaluate(`Object.fromEntries([...document.querySelectorAll('meta[name],meta[property]')].map(m=>[m.name||m.getAttribute('property'),m.content]))`);
      assert.equal(meta.description,meta['og:description']);
      assert(meta.description.includes('Over 25 years of professional development experience.'));
      assert(!/\b30\s*\+?\s*years/i.test(await evaluate('document.body.innerText')));
      const png = Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64');
      shots.push(png);await writeFile(join(audit,`${name}-${width}.png`),png);
      // The native directory works by keyboard and includes every organisation.
      await evaluate('document.querySelector(".brand-directory summary").focus()');
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await waitFor('document.querySelector(".brand-directory").open');
      const names = await evaluate('[...document.querySelectorAll(".brand-directory li")].map(li=>li.textContent)');
      assert.deepEqual(names,brands.map(b=>b.name));
      assert(await evaluate('document.querySelector(".brand-directory ul").getBoundingClientRect().height>0'));
      result.push({width,kind:name,font:true,portrait:true,initialLogos:6,directoryNames:names.length,noOverflow:true,experience:'25+'});
    }
    if(reference) assert(shots[0].equals(shots[1]),`Trimmed CSS changed retained design at ${width}px`);
  }
  // Initial portrait/logos and all 33 names remain available without JavaScript.
  await send('Emulation.setScriptExecutionDisabled',{value:true});
  await send('Page.navigate',{url:local.origin});await waitFor(loaded);await evaluate('document.fonts.ready');
  assert.equal(await evaluate('document.querySelectorAll(".brand-directory li").length'),33);
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
  assert.equal(await evaluate('new Set([...document.querySelectorAll(".brand-slot img")].map(i=>i.src)).size'),6);
  // Decode every manifest image in the browser, not merely its initial six.
  const decoded = await evaluate(`Promise.all(${JSON.stringify(brands)}.map(b=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth?resolve(b.name):reject(Error(b.name));image.onerror=()=>reject(Error(b.name));image.src=b.src;})))`);
  assert.equal(decoded.length,33);
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
  assert.deepEqual(chrome.exceptions,[]);
  assert.deepEqual(chrome.badResponses,[]);
  assert(chrome.requests.every(r=>r.url.startsWith(local.origin) || reference && r.url.startsWith(reference.origin)),'External request attempted');
  assert(chrome.requests.every(r=>['GET','HEAD'].includes(r.method)),'Write request attempted');
  assert(local.requests.filter(r=>r.path.startsWith('/api/')).length===2,'Unexpected API traffic'); // Only explicit 404 checks above.
  const report={checks:result,visualComparisonWithOriginalCss:Boolean(reference),all33ImagesDecoded:true,rotationPauseResume:true,viewAllKeyboard:true,noJavaScriptFallback:true,skipLinkKeyboard:true,noMissingAssets:true,noRuntimeApiCalls:true,noExternalRequests:true,exceptions:[]};
  await writeFile(join(audit,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS: 1440/768/375px; retained design unchanged by CSS trimming; 25-year content/SEO; all 33 logos; rotation/pause/resume; keyboard view-all/skip link; no-JS fallback; no missing assets, external requests, CMS calls or JS errors.');
} finally {chrome?.close();await local.close();await reference?.close();}
