const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { WhatsAppService } = require("../desktop/whatsapp-service.cjs");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mega-lead-wa-test-"));
  const service = new WhatsAppService(root);
  assert.equal(service.normalizePhone("(21) 99854-2048"), "5521998542048");
  assert.equal(service.normalizePhone("+1 212 555 0100"), "12125550100");
  const qrReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("QR não foi emitido em 25 segundos")), 25_000);
    service.on("event", ({ event, data }) => {
      if (event !== "qr") return;
      clearTimeout(timeout);
      assert.ok(String(data.qr).length > 100);
      resolve();
    });
  });
  try {
    await service.connect({ fresh: true });
    await qrReady;
    console.log("WhatsApp local: normalização e emissão de QR aprovadas");
  } finally {
    await service.disconnect({ erase: true });
    await fs.rm(root, { recursive: true, force: true });
  }
})().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
