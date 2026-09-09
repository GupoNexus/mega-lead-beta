// LeadMapper Connect — bridge content script injected on the LeadMapper app.
// Relays window.postMessage envelopes from the page to the service worker.

const APP_SOURCE = "leadmapper-app";
const EXT_SOURCE = "leadmapper-ext";

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== APP_SOURCE || !data.id || !data.action) return;

  chrome.runtime.sendMessage(
    { type: "lm-command", action: data.action, payload: data.payload },
    (res) => {
      if (chrome.runtime.lastError) {
        window.postMessage(
          {
            source: EXT_SOURCE,
            id: data.id,
            ok: false,
            error: "Extensão indisponível. Recarregue a página.",
          },
          window.location.origin,
        );
        return;
      }
      window.postMessage(
        {
          source: EXT_SOURCE,
          id: data.id,
          ok: !!(res && res.ok),
          data: res && res.data,
          error: res && res.error,
        },
        window.location.origin,
      );
    },
  );
});

// Events pushed by the service worker (incoming WhatsApp messages, status)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "lm-event") {
    window.postMessage(
      { source: EXT_SOURCE, event: msg.event, payload: msg.payload },
      window.location.origin,
    );
    sendResponse({ ok: true });
  }
  return false;
});
