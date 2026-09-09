const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { trustedAgent } = require("./windows-trust.cjs");
const { EventEmitter } = require("node:events");

class WhatsAppService extends EventEmitter {
  constructor(userData, logger = () => {}) {
    super();
    this.root = path.join(userData, "whatsapp");
    this.authDir = path.join(this.root, "session");
    this.connectionFile = path.join(this.root, "connection.json");
    this.queueFile = path.join(this.root, "queue.json");
    this.failedFile = path.join(this.root, "failed.json");
    this.usageFile = path.join(this.root, "usage.json");
    this.historyFile = path.join(this.root, "messages.jsonl");
    this.contactsFile = path.join(this.root, "contacts.json");
    this.log = logger;
    this.socket = null;
    this.connecting = null;
    this.processing = false;
    this.manualDisconnect = false;
    this.dailyResumeTimer = null;
    this.reconnectTimer = null;
    this.pendingPairingPhone = null;
    this.contacts = new Map(Object.entries(this.readJson(this.contactsFile, {})));
    this.avatarChecks = new Map();
    this.credsSaving = Promise.resolve();
    this.queue = [];
    this.status = { connected: false, connecting: false, qr: null, phone: null, name: null };
    fs.mkdirSync(this.root, { recursive: true });
    this.queue = this.readJson(this.queueFile, []).map((job) => ({
      ...job,
      phone: this.normalizePhone(job.phone),
      status: "queued",
    }));
    this.failed = this.readJson(this.failedFile, []);
    this.paused = this.queue.length > 0;
    this.usage = this.readJson(this.usageFile, { day: this.today(), sent: 0 });
    this.persistQueue();
  }

  readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
  }
  today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  scheduleDailyResume() {
    if (this.dailyResumeTimer) clearTimeout(this.dailyResumeTimer);
    const next = new Date();
    next.setHours(24, 0, 2, 0);
    this.dailyResumeTimer = setTimeout(() => {
      this.dailyResumeTimer = null;
      void this.processQueue();
    }, Math.max(1000, next.getTime() - Date.now()));
  }
  snapshot() {
    return {
      ...this.status,
      queued: this.queue.length,
      jobs: this.queue.slice(0, 100).map(({ id, phone, text, status, attempts, createdAt }) => ({
        id, phone, text, status, attempts, createdAt,
      })),
      failed: this.failed.length,
      paused: this.paused,
    };
  }
  publish(event, data) { this.emit("event", { event, data }); }
  persistQueue() { fs.writeFileSync(this.queueFile, JSON.stringify(this.queue, null, 2)); }
  persistFailed() { fs.writeFileSync(this.failedFile, JSON.stringify(this.failed.slice(-500), null, 2)); }
  persistUsage() { fs.writeFileSync(this.usageFile, JSON.stringify(this.usage, null, 2)); }
  persistContacts() { fs.writeFileSync(this.contactsFile, JSON.stringify(Object.fromEntries(this.contacts), null, 2)); }
  hasSavedSession() { return fs.existsSync(path.join(this.authDir, "creds.json")); }
  async restoreConnection() {
    const creds = this.readJson(path.join(this.authDir, "creds.json"), {});
    if (!(creds.registered || creds.me?.id) || this.readJson(this.connectionFile, {}).autoConnect === false) return this.snapshot();
    return this.connect();
  }
  normalizePhone(phone) {
    const raw = String(phone || "").trim();
    let digits = raw.replace(/\D/g, "");
    if (!raw.startsWith("+") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
    return digits;
  }
  isDirectChatId(jid) {
    return typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid")) && !jid.startsWith("status@");
  }
  contactFor(jid) { return this.contacts.get(jid) || {}; }
  resolveChatId(jid) { return this.contactFor(jid).phoneNumber || jid; }
  saveContact(contact) {
    if (!contact?.id || !this.isDirectChatId(contact.id)) return;
    const previous = this.contactFor(contact.id);
    const savedName = contact.name || previous.savedName || null;
    const name = savedName || contact.notify || contact.verifiedName || previous.name || null;
    const phoneNumber = contact.phoneNumber || previous.phoneNumber || (contact.id.endsWith("@s.whatsapp.net") ? contact.id : null);
    const next = { ...previous, savedName, name, phoneNumber };
    this.contacts.set(contact.id, next);
    if (phoneNumber) this.contacts.set(phoneNumber, next);
    if (contact.lid) this.contacts.set(contact.lid, next);
    this.persistContacts();
  }
  async refreshAvatar(jid) {
    if (!this.socket || !this.isDirectChatId(jid)) return this.contactFor(jid).avatarUrl || null;
    if (Date.now() - (this.avatarChecks.get(jid) || 0) < 300000) return this.contactFor(jid).avatarUrl || null;
    this.avatarChecks.set(jid, Date.now());
    try {
      const avatarUrl = await this.socket.profilePictureUrl(jid, "image");
      if (avatarUrl && avatarUrl !== this.contactFor(jid).avatarUrl) {
        this.contacts.set(jid, { ...this.contactFor(jid), avatarUrl });
        this.persistContacts();
        this.publish("contacts.updated", { id: jid });
      }
      return avatarUrl || null;
    } catch { return this.contactFor(jid).avatarUrl || null; }
  }

  async resetSession() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    try { socket?.end(undefined); } catch {}
    await this.credsSaving.catch(() => {});
    await fsp.rm(this.authDir, { recursive: true, force: true });
    this.status = { connected: false, connecting: false, qr: null, pairingCode: null, pairingPhone: null, phone: null, name: null };
    this.manualDisconnect = false;
  }

  async connect({ fresh = false } = {}) {
    if (this.status.connected) return this.snapshot();
    if (this.connecting) return this.connecting;
    if (fresh) {
      await this.resetSession();
      this.pendingPairingPhone = null;
    }
    if (this.socket && this.status.connecting) return this.snapshot();
    this.manualDisconnect = false;
    fs.writeFileSync(this.connectionFile, JSON.stringify({ autoConnect: true }));
    this.connecting = this.openSocket({ pairingPhone: this.pendingPairingPhone }).catch(error => {
      this.status = { ...this.status, connecting: false };
      this.publish("status", this.snapshot());
      throw error;
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async pair(phone) {
    const digits = this.normalizePhone(phone);
    if (!/^\d{12,15}$/.test(digits)) throw new Error("Informe o número com DDD e código do país");
    if (this.connecting) await this.connecting.catch(() => {});
    await this.resetSession();
    this.pendingPairingPhone = digits;
    fs.writeFileSync(this.connectionFile, JSON.stringify({ autoConnect: true }));
    this.connecting = this.openSocket({ pairingPhone: digits }).catch(error => {
      this.status = { ...this.status, connecting: false, pairingCode: null };
      this.publish("status", this.snapshot());
      throw error;
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async openSocket({ pairingPhone = null } = {}) {
    this.status = { ...this.status, connecting: true, qr: null, pairingCode: null, pairingPhone };
    this.publish("status", this.snapshot());
    const baileys = await import("@whiskeysockets/baileys");
    const pino = (await import("pino")).default;
    await fsp.mkdir(this.authDir, { recursive: true });
    const { state, saveCreds } = await baileys.useMultiFileAuthState(this.authDir);
    const { version } = await baileys.fetchLatestBaileysVersion();
    const socket = baileys.default({
      version,
      auth: {
        creds: state.creds,
        keys: baileys.makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Mega Lead", "Desktop", "1.3.4"],
      agent: trustedAgent(),
      syncFullHistory: true,
      shouldSyncHistoryMessage: () => true,
      markOnlineOnConnect: false,
    });
    this.socket = socket;
    socket.ev.on("creds.update", () => {
      this.credsSaving = this.credsSaving
        .then(() => saveCreds())
        .catch((error) => this.log("whatsapp-save-credentials-failed", { error: String(error) }));
    });
    socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (this.socket !== socket) return;
      if (qr && !pairingPhone) {
        this.status = { connected: false, connecting: true, qr, pairingCode: null, pairingPhone: null, phone: null, name: null };
        this.log("whatsapp-qr-ready");
        this.publish("qr", { qr });
        this.publish("status", this.snapshot());
      }
      if (connection === "open") {
        this.pendingPairingPhone = null;
        this.status = {
          connected: true,
          connecting: false,
          qr: null,
          phone: socket.user?.id?.split(":")[0] || null,
          name: socket.user?.name || null, pairingCode: null, pairingPhone: null,
        };
        this.log("whatsapp-connection-open", { phone: this.status.phone });
        this.publish("status", this.snapshot());
        setTimeout(() => void this.processQueue(), 1500);
      }
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOutCode = code === baileys.DisconnectReason.loggedOut;
        const errorText = String(lastDisconnect?.error?.message || lastDisconnect?.error || "unknown");
        const connectionConflict = /conflict|replaced/i.test(errorText);
        const loggedOut = loggedOutCode && !connectionConflict;
        this.log("whatsapp-connection-closed", {
          code: code ?? null,
          error: errorText,
          loggedOut, connectionConflict,
        });
        this.socket = null;
        this.status = { connected: false, connecting: false, qr: null, pairingCode: null, pairingPhone: null, phone: null, name: null };
        this.publish("status", this.snapshot());
        if (loggedOut && !this.manualDisconnect) {
          // A 401 means the persisted credentials can no longer be used. Remove
          // them and immediately start a clean QR flow instead of getting stuck.
          void this.credsSaving.catch(() => {}).then(async () => {
            await fsp.rm(this.authDir, { recursive: true, force: true });
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null;
              void this.connect();
            }, 350);
          });
        } else if (!this.manualDisconnect) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.credsSaving;
            void this.connect();
          }, code === baileys.DisconnectReason.restartRequired ? 250 : 3000);
        }
      }
    });
    socket.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) this.saveContact(contact);
    });
    socket.ev.on("contacts.update", (contacts) => {
      for (const contact of contacts) this.saveContact(contact);
    });
    socket.ev.on("messaging-history.set", ({ messages, contacts }) => {
      // This event also carries WhatsApp Status. Keep only direct chats: status,
      // groups, broadcasts and channels never enter the Mega Lead inbox.
      for (const contact of contacts || []) this.saveContact(contact);
      for (const message of messages || []) {
        if (message.message?.protocolMessage?.requestId) continue;
        const item = this.normalizeMessage(message);
        if (item) fs.appendFileSync(this.historyFile, `${JSON.stringify(item)}\n`);
      }
      this.publish("history.synced", { messages: messages?.length || 0, contacts: contacts?.length || 0 });
    });
    socket.ev.on("messages.upsert", ({ messages }) => {
      for (const message of messages) {
        if (message.message?.protocolMessage?.requestId) continue;
        const item = this.normalizeMessage(message);
        if (!item) continue;
        fs.appendFileSync(this.historyFile, `${JSON.stringify(item)}\n`);
        this.publish(message.key.fromMe ? "message.ack" : "message.in", item);
      }
    });
    socket.ev.on("messages.update", (updates) => {
      for (const update of updates) this.publish("message.ack", update);
    });
    if (pairingPhone && !state.creds.registered) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (this.socket !== socket) throw new Error("A conexão foi reiniciada; tente gerar o código novamente");
      const pairingCode = await socket.requestPairingCode(pairingPhone);
      this.status = { ...this.status, connecting: true, qr: null, pairingCode, pairingPhone };
      this.log("whatsapp-pairing-code-ready", { phoneSuffix: pairingPhone.slice(-4) });
      this.publish("pairing.code", { pairingCode, pairingPhone });
      this.publish("status", this.snapshot());
    }
    return this.snapshot();
  }

  normalizeMessage(message) {
    if (!message?.message || !this.isDirectChatId(message.key?.remoteJid)) return null;
    if (message.key.remoteJid.endsWith("@lid") && message.key.remoteJidAlt?.endsWith("@s.whatsapp.net")) {
      this.saveContact({ id: message.key.remoteJid, phoneNumber: message.key.remoteJidAlt });
    }
    const chatId = this.resolveChatId(message.key.remoteJid);
    const content = message.message;
    const body = content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption || content.documentMessage?.caption || content.buttonsResponseMessage?.selectedDisplayText || content.listResponseMessage?.title || "";
    if (!body) return null;
    return {
      externalId: message.key.id || crypto.randomUUID(),
      chatId,
      phone: chatId.endsWith("@s.whatsapp.net") ? chatId.split("@")[0] : "",
      contactName: this.contactFor(message.key.remoteJid).name || (!message.key.fromMe ? message.pushName : null) || null,
      body,
      fromMe: !!message.key.fromMe,
      timestamp: Number(message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000,
      status: message.status ?? null,
    };
  }

  async enqueue({ phone, text, chatId = null, minDelaySeconds = 2, maxDelaySeconds = 8, dailyLimit = 200, batchSize = 0, batchPauseSeconds = 0, batchPosition = 0, targetId = null, campaignId = null, leadId = null, contactName = null }) {
    const digits = this.normalizePhone(phone);
    if (!/^\d{10,15}$/.test(digits) && !this.isDirectChatId(chatId)) throw new Error("Telefone inválido");
    if (!String(text || "").trim()) throw new Error("Mensagem vazia");
    const min = Math.max(0, Math.min(3600, Number(minDelaySeconds) || 0));
    const max = Math.max(min, Math.min(3600, Number(maxDelaySeconds) || min));
    const job = { id: crypto.randomUUID(), phone: digits, text: String(text), min, max, dailyLimit: Math.max(1, Number(dailyLimit) || 200), batchSize: Math.max(0, Number(batchSize) || 0), batchPauseSeconds: Math.max(0, Number(batchPauseSeconds) || 0), batchPosition: Math.max(0, Number(batchPosition) || 0), targetId, campaignId, leadId, contactName, status: "queued", attempts: 0, createdAt: new Date().toISOString() };
    this.queue.push(job);
    job.ownerPhone = this.status.phone;
    job.chatId = this.isDirectChatId(chatId) ? chatId : null;
    this.persistQueue();
    this.publish("queue", { job, queued: this.queue.length });
    void this.processQueue();
    return job;
  }

  async processQueue() {
    if (this.processing || this.paused || !this.socket || !this.status.connected) return;
    this.processing = true;
    try {
      while (!this.paused && this.queue.length && this.socket && this.status.connected) {
        if (this.usage.day !== this.today()) this.usage = { day: this.today(), sent: 0 };
        const job = this.queue[0];
        if (job.ownerPhone && job.ownerPhone !== this.status.phone) {
          this.paused = true;
          this.publish("status", this.snapshot());
          break;
        }
        if (this.usage.sent >= job.dailyLimit) {
          this.scheduleDailyResume();
          break;
        }
        const startsNewBatch = job.batchSize > 0 && job.batchPosition > 1 && (job.batchPosition - 1) % job.batchSize === 0;
        const wait = ((startsNewBatch ? job.batchPauseSeconds : 0) + job.min + Math.random() * (job.max - job.min)) * 1000;
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        if (this.paused || !this.socket || !this.status.connected) break;
        if (!this.queue.some(item => item.id === job.id)) continue;
        try {
          job.status = "sending";
          job.attempts += 1;
          this.persistQueue();
          const jid = job.chatId || `${this.normalizePhone(job.phone)}@s.whatsapp.net`;
          const registration = jid.endsWith("@lid") ? [{ exists: true, jid }] : await this.socket.onWhatsApp(jid);
          if (!registration?.[0]?.exists) {
            const error = new Error("Este telefone não possui WhatsApp");
            error.permanent = true;
            throw error;
          }
          job.phone = this.normalizePhone(job.phone);
          const result = await this.socket.sendMessage(registration[0].jid || jid, { text: job.text });
          this.queue.shift();
          this.usage.sent += 1;
          this.persistUsage();
          this.persistQueue();
          const item = {
            externalId: result?.key?.id || crypto.randomUUID(), chatId: registration[0].jid || jid,
            phone: job.phone, contactName: job.contactName || this.contactFor(registration[0].jid || jid).name || null,
            body: job.text, fromMe: true, timestamp: Date.now(), status: "sent",
          };
          fs.appendFileSync(this.historyFile, `${JSON.stringify(item)}\n`);
          this.publish("message.sent", { jobId: job.id, ...item, targetId: job.targetId, campaignId: job.campaignId, leadId: job.leadId });
        } catch (error) {
          job.status = error.permanent || job.attempts >= 5 ? "failed" : "queued";
          job.error = String(error?.message || error);
          if (job.status === "failed") {
            this.queue.shift();
            this.failed.push({ ...job, failedAt: new Date().toISOString() });
            this.persistFailed();
          }
          this.persistQueue();
          this.publish("message.failed", { job });
          if (job.status !== "failed") await new Promise((resolve) => setTimeout(resolve, Math.min(60000, 2000 * 2 ** job.attempts)));
        }
      }
    } finally {
      this.processing = false;
      this.publish("queue", { queued: this.queue.length });
    }
  }

  cancel(jobId) {
    const before = this.queue.length;
    this.queue = this.queue.filter((job) => job.id !== jobId || job.status === "sending");
    this.persistQueue();
    const cancelled = before !== this.queue.length;
    this.publish("queue", this.snapshot());
    return { cancelled };
  }

  pause() {
    this.paused = true;
    this.publish("status", this.snapshot());
    return this.snapshot();
  }
  resume() {
    if (!this.status.connected) throw new Error("Conecte o WhatsApp para retomar a fila.");
    if (this.queue.some(job => job.ownerPhone && job.ownerPhone !== this.status.phone)) throw new Error("A fila pertence a outra conta WhatsApp. Reconecte a conta original ou cancele os itens.");
    this.paused = false;
    this.publish("status", this.snapshot());
    void this.processQueue();
    return this.snapshot();
  }

  history(limit = 500) {
    try {
      const rows = fs.readFileSync(this.historyFile, "utf8").trim().split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
      const unique = new Map(rows.map((row) => [row.externalId, row]));
      return Array.from(unique.values()).sort((a, b) => a.timestamp - b.timestamp).slice(-Math.max(1, Math.min(5000, limit)));
    } catch { return []; }
  }

  async conversations(limit = 300) {
    const rows = this.history(5000);
    const chats = new Map();
    for (const message of rows) {
      if (!this.isDirectChatId(message.chatId)) continue;
      message.chatId = this.resolveChatId(message.chatId);
      const current = chats.get(message.chatId);
      if (!current || message.timestamp >= current.lastMessageAt) {
        const contact = this.contactFor(message.chatId);
        chats.set(message.chatId, {
          id: message.chatId, phone: message.phone, contactName: contact.name || message.contactName || null,
          avatarUrl: contact.avatarUrl || null, lastMessage: message.body,
          lastMessageAt: message.timestamp, fromMe: message.fromMe,
        });
      }
    }
    const result = Array.from(chats.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt).slice(0, Math.max(1, Math.min(500, limit)));
    // Photos are optional data from WhatsApp. Fetch them lazily for visible chats,
    // never blocking the conversation list if a contact has no photo or hides it.
    void Promise.all(result.slice(0, 40).filter((chat) => !chat.avatarUrl).map(async (chat) => {
      chat.avatarUrl = await this.refreshAvatar(chat.id);
    })).catch(() => {});
    return result;
  }

  messages(chatId, limit = 1000) {
    if (!this.isDirectChatId(chatId)) return [];
    return this.history(5000).filter((message) => this.resolveChatId(message.chatId) === this.resolveChatId(chatId)).slice(-Math.max(1, Math.min(2000, limit)));
  }

  async disconnect({ erase = false } = {}) {
    this.manualDisconnect = true;
    fs.writeFileSync(this.connectionFile, JSON.stringify({ autoConnect: false }));
    if (this.dailyResumeTimer) clearTimeout(this.dailyResumeTimer);
    this.dailyResumeTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try {
      if (erase) await this.socket?.logout();
      else this.socket?.end(undefined);
    } catch (error) { this.log("whatsapp-disconnect-warning", { error: String(error) }); }
    this.socket = null;
    this.status = { connected: false, connecting: false, qr: null, pairingCode: null, pairingPhone: null, phone: null, name: null };
    if (erase) await fsp.rm(this.authDir, { recursive: true, force: true });
    this.publish("status", this.snapshot());
    return this.snapshot();
  }
}

module.exports = { WhatsAppService };
