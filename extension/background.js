// LeadMapper Connect — service worker (MV3)
// Relays commands from the LeadMapper app page to the WhatsApp Web tab.

const WA_URL = "https://web.whatsapp.com/";
const VERSION = chrome.runtime.getManifest().version;

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return tabs[0] || null;
}

async function ensureWhatsAppTab() {
  let tab = await getWhatsAppTab();
  if (!tab) {
    tab = await chrome.tabs.create({ url: WA_URL, active: false });
    await waitForTabReady(tab.id);
  }
  return tab;
}

function waitForTabReady(tabId, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = async () => {
      try {
        const t = await chrome.tabs.get(tabId);
        if (t.status === "complete") return resolve(true);
      } catch {
        return resolve(false);
      }
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(check, 500);
    };
    check();
  });
}

async function askWhatsApp(action, payload, timeoutMs = 60000) {
  const tab = await ensureWhatsAppTab();
  return await new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, error: "WhatsApp Web não respondeu. Abra a aba do WhatsApp Web e escaneie o QR." }),
      timeoutMs,
    );
    chrome.tabs.sendMessage(tab.id, { action, payload }, (res) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: "Aba do WhatsApp Web não está pronta. Abra web.whatsapp.com e faça login.",
        });
        return;
      }
      resolve(res || { ok: false, error: "Sem resposta" });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Events pushed from the WhatsApp content script → broadcast to app tabs
  if (msg && msg.type === "wa-event") {
    broadcastToApps(msg.event, msg.payload);
    sendResponse({ ok: true });
    return true;
  }

  if (!msg || msg.type !== "lm-command") return false;

  (async () => {
    const { action, payload } = msg;
    try {
      if (action === "status") {
        const tab = await getWhatsAppTab();
        if (!tab) {
          sendResponse({
            ok: true,
            data: { installed: true, connected: false, phone: null, name: null, version: VERSION },
          });
          return;
        }
        const res = await askWhatsApp("status", null, 8000);
        sendResponse({
          ok: true,
          data: {
            installed: true,
            connected: !!(res.ok && res.data && res.data.connected),
            phone: (res.data && res.data.phone) || null,
            name: (res.data && res.data.name) || null,
            version: VERSION,
          },
        });
        return;
      }

      if (action === "openWhatsApp") {
        const tab = await getWhatsAppTab();
        if (tab) await chrome.tabs.update(tab.id, { active: true });
        else await chrome.tabs.create({ url: WA_URL, active: true });
        sendResponse({ ok: true, data: { ok: true } });
        return;
      }

      if (action === "sendMessage") {
        const res = await askWhatsApp("sendMessage", payload, 90000);
        sendResponse(res);
        return;
      }

      if (action === "pullChats") {
        const res = await askWhatsApp("pullChats", null, 30000);
        sendResponse(res);
        return;
      }

      sendResponse({ ok: false, error: "Ação desconhecida: " + action });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();

  return true; // async response
});

async function broadcastToApps(event, payload) {
  const patterns = ["https://*.lovable.app/*", "http://localhost/*"];
  for (const pattern of patterns) {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: "lm-event", event, payload }, () => {
        void chrome.runtime.lastError;
      });
    }
  }
}
