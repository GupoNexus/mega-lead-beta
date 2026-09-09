import assert from 'node:assert/strict';
import fs from 'node:fs';
import { desktop } from './cdp.mjs';
const d=await desktop();
try{
  await d.evaluate("location.assign('/inbox')");
  await d.wait('document.body?.innerText.includes("Conectar conta")');
  await d.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Disparador').click()");
  await d.wait('!!document.querySelector(".wa-dispatch-panel")');
  assert.equal(await d.evaluate('document.body.innerText.includes("Selecione uma conversa direta.") && document.body.innerText.includes("Abordagens para disparo")'),true);
  assert.equal(await d.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  await d.call('Page.bringToFront');
  const shot=await d.call('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
  fs.writeFileSync('audit/whatsapp-dispatcher.png',Buffer.from(shot.data,'base64'));
  await d.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Conectar conta').click()");
  await d.wait('document.body.innerText.includes("Gerar QR code")');
  await d.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Gerar QR code').click()");
  await d.wait('(async()=>Boolean((await window.megaLeadDesktop.whatsapp.status()).qr))()');
  assert.equal(await d.evaluate('document.querySelectorAll("svg path").length>0'),true);
  console.log('WhatsApp UI: conversas + disparador simultâneos, sem overflow; QR real gerado pelo aplicativo.');
}finally{d.close();}
