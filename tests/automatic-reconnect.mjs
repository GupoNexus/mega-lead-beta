import fs from 'node:fs';
import { desktop } from './cdp.mjs';
const d = await desktop();
try {
  await d.wait('(async()=>Boolean((await window.megaLeadDesktop.whatsapp.status()).connected))()');
  const result = await d.evaluate('(async()=>{const s=await window.megaLeadDesktop.whatsapp.status();return {version:window.megaLeadDesktop.version,connected:s.connected,hasQr:Boolean(s.qr),queued:s.queued};})()');
  fs.writeFileSync('audit/automatic-reconnect.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { d.close(); }
