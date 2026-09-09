import { desktop } from './cdp.mjs';
const d = await desktop();
try { console.log(await d.evaluate('({path:location.pathname,cards:document.querySelectorAll("[draggable=true]").length,text:document.body?.innerText.slice(0,500),scrollHeight:document.documentElement.scrollHeight})')); } finally { d.close(); }
