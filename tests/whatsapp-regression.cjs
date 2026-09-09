const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WhatsAppService } = require('../desktop/whatsapp-service.cjs');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mega-wa-regression-'));
  const service = new WhatsAppService(root);
  t.after(async () => { await service.disconnect(); fs.rmSync(root, { recursive: true, force: true }); });
  return service;
}
test('reinício restaura sessão registrada e respeita desconexão voluntária', async t => {
  const s = setup(t);
  let attempts = 0;
  s.openSocket = async () => { attempts++; return s.snapshot(); };
  await s.restoreConnection();
  assert.equal(attempts, 0);
  fs.mkdirSync(s.authDir, {recursive:true});
  fs.writeFileSync(path.join(s.authDir, 'creds.json'), JSON.stringify({registered:false, me:{id:'5521999999999:1@s.whatsapp.net'}}));
  await s.restoreConnection();
  assert.equal(attempts, 1);
  await s.disconnect();
  await s.restoreConnection();
  assert.equal(attempts, 1);
  await s.connect();
  await s.restoreConnection();
  assert.equal(attempts, 3);
});

test('status/grupos excluídos e nome salvo preservado', t => {
  const s = setup(t);
  const msg = { key: { id: '1', remoteJid: 'status@broadcast' }, message: { conversation: 'status' } };
  assert.equal(s.normalizeMessage(msg), null);
  msg.key.remoteJid = '1@g.us';
  assert.equal(s.normalizeMessage(msg), null);
  msg.key.remoteJid = '5521999999999@s.whatsapp.net';
  s.saveContact({ id: msg.key.remoteJid, name: 'Nome salvo' });
  msg.pushName = 'Outro nome';
  assert.equal(s.normalizeMessage(msg).contactName, 'Nome salvo');
});
test('histórico tolera linha corrompida e elimina duplicatas', t => {
  const s = setup(t);
  const row = { externalId: '1', timestamp: 1, chatId: '5521999999999@s.whatsapp.net', body: 'teste' };
  fs.writeFileSync(s.historyFile, JSON.stringify(row) + '\ninvalid\n' + JSON.stringify(row));
  assert.equal(s.history().length, 1);
});
test('cancelamento durante delay não envia mensagem', async t => {
  const s = setup(t); let sends = 0;
  s.status.connected = true;
  s.socket = { onWhatsApp: async () => [{ exists: true }], sendMessage: async () => { sends++; } };
  const job = await s.enqueue({ phone: '21999999999', text: 'teste', minDelaySeconds: .1, maxDelaySeconds: .1 });
  assert.equal(s.cancel(job.id).cancelled, true);
  await new Promise(r => setTimeout(r, 180));
  assert.equal(sends, 0); assert.equal(s.queue.length, 0);
});
test('envio controlado persiste histórico, uso e esvazia fila', async t => {
  const s = setup(t);
  s.status.connected = true;
  s.socket = { onWhatsApp: async () => [{ exists: true }], sendMessage: async () => ({ key: { id: 'sent-1' } }) };
  await s.enqueue({ phone: '21999999999', text: 'teste', minDelaySeconds: 0, maxDelaySeconds: 0 });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(s.queue.length, 0); assert.equal(s.usage.sent, 1);
  assert.equal(s.history()[0].body, 'teste');
});
test('ausência de foto não bloqueia lista nem dispara loop de eventos', async t => {
  const s = setup(t); let calls = 0; let events = 0;
  s.socket = { profilePictureUrl: async () => { calls++; throw new Error('privado'); } };
  fs.writeFileSync(s.historyFile, JSON.stringify({ externalId:'1', chatId:'5521999999999@s.whatsapp.net', phone:'5521999999999', body:'oi', timestamp:1 }));
  s.on('event', () => events++);
  assert.equal((await s.conversations()).length, 1);
  await s.conversations();
  assert.equal(calls, 1); assert.equal(events, 0);
});
test('pausar durante delay impede envio até retomar', async t => {
  const s=setup(t);let sends=0;
  s.status.connected=true;
  s.socket={onWhatsApp:async()=>[{exists:true}],sendMessage:async()=>{sends++;return {key:{id:'pause-test'}};}};
  await s.enqueue({phone:'21999999999',text:'teste',minDelaySeconds:.05,maxDelaySeconds:.05});
  s.pause(); await new Promise(r=>setTimeout(r,90));
  assert.equal(sends,0); assert.equal(s.queue.length,1);
  s.resume(); await new Promise(r=>setTimeout(r,90));
  assert.equal(sends,1);
});
test('fila restaurada inicia pausada e rejeita outra conta', async t => {
  const s=setup(t);
  s.status.phone='5521888888888';
  await s.enqueue({phone:'21999999999',text:'teste'});
  const restored=new WhatsAppService(path.dirname(s.root));
  assert.equal(restored.paused,true);
  restored.status.connected=true; restored.status.phone='5521777777777';
  assert.throws(()=>restored.resume(),/outra conta/);
});
test('conversa LID não é confundida com telefone e pode receber resposta', async t => {
  const s=setup(t);
  const msg={key:{id:'lid-1',remoteJid:'123456@lid'},message:{conversation:'oi'}};
  assert.equal(s.normalizeMessage(msg).phone,'');
  msg.key.remoteJidAlt='5521999999999@s.whatsapp.net';
  assert.equal(s.normalizeMessage(msg).phone,'5521999999999');
  s.status.connected=true;
  let sentTo;
  s.socket={sendMessage:async jid=>{sentTo=jid;return {key:{id:'reply'}};}};
  await s.enqueue({phone:'',chatId:'987654@lid',text:'resposta',minDelaySeconds:0,maxDelaySeconds:0});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(sentTo,'987654@lid');
});
test('pausa entre lotes é respeitada pelo processador real', async t => {
  const s=setup(t), times=[];
  s.status.connected=true;
  s.socket={onWhatsApp:async()=>[{exists:true}],sendMessage:async()=>{times.push(Date.now());return {key:{id:String(times.length)}};}};
  await s.enqueue({phone:'21999999999',text:'primeiro',minDelaySeconds:.01,maxDelaySeconds:.01,batchSize:1,batchPosition:1,batchPauseSeconds:.08});
  await s.enqueue({phone:'21999999999',text:'segundo',minDelaySeconds:.01,maxDelaySeconds:.01,batchSize:1,batchPosition:2,batchPauseSeconds:.08});
  await new Promise(r=>setTimeout(r,180));
  assert.equal(times.length,2);
  assert.ok(times[1]-times[0]>=75);
});
