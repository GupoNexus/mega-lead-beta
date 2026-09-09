const fs=require('node:fs');
const assert=require('node:assert/strict');
const asar=require('../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar');
const archive='release/win-unpacked/resources/app.asar';
const manifest=JSON.parse(asar.extractFile(archive,'package.json').toString());
assert.equal(manifest.main,'desktop/main.cjs');
assert.equal(manifest.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);
for(const file of ['desktop/main.cjs','desktop/preload.cjs','desktop/whatsapp-service.cjs','desktop/windows-trust.cjs','desktop/public-config.json']){
  assert.ok(asar.extractFile(archive,file).equals(fs.readFileSync(file)),file+' diverge da fonte');
}
const files=asar.listPackage(archive);
assert.equal(files.some(f=>f.endsWith('/places-config.json') || f.endsWith('\\places-config.json')),false,'Chave Places compartilhada não pode entrar no instalador');
assert.equal(files.some(f=>/^[/\\](?:\.env|\.test-profile|audit)(?:$|[/\\])/.test(f)),false);
console.log('Pacote íntegro: manifesto e arquivos principais idênticos à fonte; sem .env nem perfil de teste.');
