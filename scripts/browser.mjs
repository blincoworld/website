// Local-only browser helpers; never deploy these files.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const types = {html:'text/html',css:'text/css',js:'text/javascript',json:'application/json',xml:'application/xml',txt:'text/plain',webp:'image/webp',png:'image/png',ico:'image/x-icon',woff2:'font/woff2'};
const csp = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export async function serve(directory, files, overrides = {}) {
  const requests = [];
  const server = createServer(async (req,res) => {
    const path = new URL(req.url,'http://localhost').pathname;
    requests.push({path,method:req.method});
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
    if (!files.has(name) || name === '_headers') {res.writeHead(404);res.end('Not found');return;}
    try {
      const body = await readFile(overrides[path] || join(directory,name));
      res.writeHead(200, {'Content-Type':types[name.split('.').pop()] || 'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {res.writeHead(500);res.end('Fixture failed');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,requests,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
export async function browser(directory) {
  await mkdir(directory,{recursive:true});
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${join(directory,'chrome')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let socket;
  try {
    const origin = await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(Error('Chrome start timeout')),10000);
      chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on ws:\/\/(127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve('http://'+match[1]);}});
      chrome.once('error',error=>{clearTimeout(timer);reject(error);});
    });
    const pages=await fetch(origin+'/json/list').then(r=>r.json());
    socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await once(socket,'open');
    let sequence=0;const pending=new Map(),exceptions=[],badResponses=[],requests=[];
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id){const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(message.error.message)):task.resolve(message.result);}
      if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails);
      if(message.method==='Network.responseReceived' && message.params.response.status>=400)badResponses.push(message.params.response.url);
      if(message.method==='Network.requestWillBeSent')requests.push({url:message.params.request.url,method:message.params.request.method});
    });
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
    const waitFor=async expression=>{for(let i=0;i<250;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+expression);};
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
    return {send,evaluate,waitFor,exceptions,badResponses,requests,close:()=>{socket.close();chrome.kill();}};
  } catch(error){socket?.close();chrome.kill();throw error;}
}
