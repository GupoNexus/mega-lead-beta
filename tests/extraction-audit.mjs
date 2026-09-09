import assert from 'node:assert/strict';
import fs from 'node:fs';
import { desktop } from './cdp.mjs';
const d=await desktop();
try{
  await d.evaluate("location.assign('/leads')");
  await d.wait('!!document.querySelector("form") && document.body.innerText.includes("Iniciar Prospecção")');
  await d.evaluate("(()=>{const form=document.querySelector('form');const input=form.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'móveis');input.dispatchEvent(new Event('input',{bubbles:true}));const select=form.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'RJ');select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await d.evaluate("(()=>{const input=[...document.querySelectorAll('form input')].find(i=>i.placeholder.includes('São Paulo'));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Rio de Janeiro');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await d.evaluate("[...document.querySelectorAll('form input')].find(i=>i.placeholder.includes('São Paulo')).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await d.evaluate("document.querySelector('form').requestSubmit()");
  let text='';
  for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,1500));text=await d.evaluate('document.body.innerText');if(/leads novos capturados|leads capturados!|Busca concluída|Erro ao prospectar|Unauthorized|Google Maps [45]/.test(text))break;}
  assert.ok(/leads novos capturados|leads capturados!|Busca concluída/.test(text),'Extração não confirmou conclusão');
  const result={passed:true,query:'móveis, Rio de Janeiro/RJ',message:text.match(/[^\n]*(?:leads novos capturados|leads capturados!|Busca concluída)[^\n]*/)?.[0]};
  fs.writeFileSync('audit/extraction.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{d.close();}
