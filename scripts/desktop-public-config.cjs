const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const values = { ...process.env };
const file = path.join(root, '.env');
if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !values[match[1]]) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
}
const supabaseUrl = values.VITE_SUPABASE_URL;
const supabasePublishableKey = values.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabasePublishableKey) throw new Error('Configuração pública do Supabase ausente.');
if (!supabaseUrl.startsWith('https://')) throw new Error('O Supabase exige HTTPS.');
const role = supabasePublishableKey.split('.').length === 3 ? JSON.parse(Buffer.from(supabasePublishableKey.split('.')[1], 'base64url')).role : null;
if (supabasePublishableKey.startsWith('sb_secret_') || (role && role !== 'anon')) throw new Error('Chaves privadas não podem ser empacotadas.');
fs.writeFileSync(path.join(root, 'desktop', 'public-config.json'), JSON.stringify({ supabaseUrl, supabasePublishableKey }, null, 2));
console.log('Configuração pública validada; nenhuma chave privada foi incluída.');
