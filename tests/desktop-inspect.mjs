import fs from 'node:fs';
const targets = await fetch('http://127.0.0.1:9237/json').then(r => r.json());
const page = targets.find(t => t.type === 'page');
if (!page) throw new Error('Janela de teste não encontrada');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r,j) => { socket.onopen=r; socket.onerror=j; });
let sequence=0; const pending = new Map();
socket.onmessage = e => { const x=JSON.parse(e.data); const cb=pending.get(x.id); if(cb){pending.delete(x.id);x.error?cb.reject(x.error):cb.resolve(x.result);} };
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
if (process.argv[2] === 'login') await call('Runtime.evaluate', {expression:"location.assign('/auth')"});
else if (process.argv[2] === 'close') {
  const closed = new Promise(resolve => socket.addEventListener('close', resolve, {once:true}));
  socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));
  await closed;
}
else {
  const result=await call('Runtime.evaluate',{expression:"({path:location.pathname,title:document.title,text:document.body.innerText.slice(0,2000),overflow:document.documentElement.scrollWidth>innerWidth})",returnByValue:true});
  console.log(JSON.stringify(result.result.value));
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.mkdirSync('audit',{recursive:true});fs.writeFileSync('audit/desktop-current.png',Buffer.from(shot.data,'base64'));
}
socket.close();
