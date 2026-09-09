// LeadMapper Connect — content script running inside web.whatsapp.com.
// Sends messages on demand and reports incoming ones back to the app.

(() => {
  const seen = new Set();
  let ownPhone = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isConnected() {
    // The chat list only exists after the QR login is complete.
    return !!document.querySelector('#pane-side, [data-testid="chat-list"]');
  }

  async function waitFor(fn, timeoutMs = 30000, step = 300) {
    const started = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - started > timeoutMs) return null;
      await sleep(step);
    }
  }

  function getComposer() {
    return (
      document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      document.querySelector('footer div[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="6"]')
    );
  }

  function digits(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  function normalize(raw) {
    const d = digits(raw);
    if (d.length === 10 || d.length === 11) return "55" + d;
    return d;
  }

  async function openChat(phone) {
    const target = normalize(phone);
    const current = digits(new URLSearchParams(location.search).get("phone") || "");
    if (current !== target) {
      // Storing the job lets us finish after the page reload.
      location.href = "https://web.whatsapp.com/send?phone=" + target;
      await sleep(4000);
    }
    return await waitFor(getComposer, 40000);
  }

  async function typeAndSend(composer, message) {
    composer.focus();
    // Insert text preserving line breaks (shift+enter for each newline).
    const lines = String(message).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        document.execCommand("insertLineBreak");
      }
      document.execCommand("insertText", false, lines[i]);
      await sleep(40);
    }
    await sleep(400);

    const btn =
      document.querySelector('button[data-tab="11"][aria-label]') ||
      document.querySelector('span[data-icon="send"]')?.closest("button") ||
      document.querySelector('button[aria-label*="nviar"]');
    if (btn) {
      btn.click();
    } else {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
        }),
      );
    }
    await sleep(800);
    return true;
  }

  async function sendMessage(payload) {
    if (!isConnected()) {
      return { ok: false, error: "WhatsApp Web não está conectado. Escaneie o QR na aba do WhatsApp." };
    }
    const phone = normalize(payload && payload.phone);
    if (!phone) return { ok: false, error: "Telefone inválido" };
    const composer = await openChat(phone);
    if (!composer) {
      return { ok: false, error: "Não foi possível abrir a conversa (número pode não ter WhatsApp)." };
    }
    await typeAndSend(composer, payload.message || "");
    return { ok: true, data: { externalId: "out-" + phone + "-" + Date.now() } };
  }

  function readChatList() {
    const pane = document.querySelector("#pane-side");
    if (!pane) return [];
    const rows = pane.querySelectorAll('[role="listitem"], [role="row"]');
    const out = [];
    rows.forEach((row) => {
      const spans = row.querySelectorAll("span[title]");
      const title = spans[0] ? spans[0].getAttribute("title") : null;
      if (!title) return;
      const previewEl = row.querySelector('[data-testid="last-msg-status"], span[dir="ltr"], span[dir="auto"]');
      const preview = previewEl ? previewEl.textContent.trim() : "";
      const unreadEl = row.querySelector('[aria-label*="ão lida"], [aria-label*="unread"]');
      const phone = digits(title);
      if (!preview) return;
      out.push({
        title,
        phone: phone.length >= 10 ? normalize(phone) : null,
        preview,
        unread: !!unreadEl,
      });
    });
    return out;
  }

  function pullChats() {
    if (!isConnected()) {
      return { ok: false, error: "WhatsApp Web não está conectado." };
    }
    const rows = readChatList().filter((r) => r.unread && r.phone);
    const messages = [];
    rows.forEach((r) => {
      const key = r.phone + "|" + r.preview;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({
        externalId: "in-" + r.phone + "-" + hash(r.preview),
        phone: r.phone,
        contactName: r.title,
        body: r.preview,
        timestamp: Date.now(),
      });
    });
    return { ok: true, data: { messages } };
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  // Watch the chat list for new incoming messages and push them to the app.
  function startWatcher() {
    let last = 0;
    setInterval(() => {
      if (!isConnected()) return;
      const now = Date.now();
      if (now - last < 8000) return;
      last = now;
      const res = pullChats();
      if (res.ok && res.data.messages.length > 0) {
        res.data.messages.forEach((m) => {
          chrome.runtime.sendMessage({ type: "wa-event", event: "incoming", payload: m }, () => {
            void chrome.runtime.lastError;
          });
        });
      }
    }, 5000);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return false;
    if (msg.action === "status") {
      sendResponse({
        ok: true,
        data: { connected: isConnected(), phone: ownPhone, name: null },
      });
      return true;
    }
    if (msg.action === "pullChats") {
      sendResponse(pullChats());
      return true;
    }
    if (msg.action === "sendMessage") {
      sendMessage(msg.payload).then(sendResponse);
      return true; // async
    }
    return false;
  });

  startWatcher();
})();
