import assert from 'node:assert/strict';
import { desktop } from './cdp.mjs';
const d=await desktop();
try{
  await d.evaluate("location.assign('/leads')");
  await d.wait("[...document.querySelectorAll('a')].some(a=>a.title==='Abrir WhatsApp')");
  await d.evaluate("[...document.querySelectorAll('a')].find(a=>a.title==='Abrir WhatsApp').click()");
  await d.wait('location.pathname==="/inbox" && !!document.querySelector(".workspace-top")');
  assert.equal(await d.evaluate('new URLSearchParams(location.search).has("phone")'),true);
  console.log('Botão do lead abriu a Central WhatsApp interna; nenhuma mensagem foi enviada.');
  console.log(await d.evaluate('(async()=>{const s=await window.megaLeadDesktop.whatsapp.status();return {connected:s.connected,queued:s.queued,hasQr:Boolean(s.qr)};})()'));
}finally{d.close();}
