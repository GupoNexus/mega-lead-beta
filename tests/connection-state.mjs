import { desktop } from './cdp.mjs';
const d=await desktop();
try { console.log(await d.evaluate('(async()=>{const s=await window.megaLeadDesktop.whatsapp.status();return {connected:s.connected,connecting:s.connecting,queued:s.queued,paused:s.paused,hasQr:Boolean(s.qr),hasPairingCode:Boolean(s.pairingCode)};})()')); } finally { d.close(); }
