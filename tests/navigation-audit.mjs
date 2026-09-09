import fs from 'node:fs';
import assert from 'node:assert/strict';
import { desktop } from './cdp.mjs';
const d=await desktop();const results=[];
try{
  for(const [path,title] of [['/crm','CRM Pipeline'],['/inbox','Central WhatsApp'],['/conexoes','Configurações'],['/leads','Prospecção']]){
    await d.evaluate('location.assign('+JSON.stringify(path)+')');
    await d.wait('document.body?.innerText.includes('+JSON.stringify(title)+') && !!document.querySelector(".workspace-top")');
    await new Promise(r=>setTimeout(r,1500));
    if(path==='/crm') await d.wait('document.querySelectorAll("[draggable=true]").length > 0');
    const state=await d.evaluate(`({nav:[...document.querySelectorAll('nav[aria-label="Navegação principal"] a')].map(x=>x.textContent),overflow:document.documentElement.scrollWidth>innerWidth,error:document.body.innerText.includes('Não foi possível carregar esta página'),cards:document.querySelectorAll('[draggable=true]').length})`);
    assert.equal(state.nav.length,4);assert.equal(state.overflow,false);assert.equal(state.error,false);
    if(path==='/crm') assert.ok(state.cards>0);
    await d.call('Page.bringToFront');
    const shot=await d.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false});
    fs.writeFileSync('audit/'+path.slice(1)+'.png',Buffer.from(shot.data,'base64'));
    results.push({path,...state});
  }
  fs.writeFileSync('audit/navigation.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
}finally{d.close();}
