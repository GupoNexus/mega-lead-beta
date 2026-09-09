const https = require('node:https');
const tls = require('node:tls');
const { execFileSync } = require('node:child_process');
let agent;
function trustedAgent() {
  if (agent) return agent;
  const ca = [...tls.rootCertificates];
  if (process.platform === 'win32') {
    const script = "foreach ($location in @('LocalMachine','CurrentUser')) { $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', $location); $store.Open('ReadOnly'); foreach ($certificate in $store.Certificates) { [Convert]::ToBase64String($certificate.RawData) }; $store.Close() }";
    const certificates = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    for (const line of certificates.split(/\r?\n/).filter(Boolean)) {
      ca.push('-----BEGIN CERTIFICATE-----\n' + line.trim() + '\n-----END CERTIFICATE-----');
    }
  }
  agent = new https.Agent({ ca, rejectUnauthorized: true });
  return agent;
}
module.exports = { trustedAgent };
