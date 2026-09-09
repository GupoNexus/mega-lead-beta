const { app, BrowserWindow, crashReporter, shell, ipcMain, net, safeStorage } = require("electron");
const { WhatsAppService } = require("./whatsapp-service.cjs");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

if (process.env.MEGA_LEAD_USER_DATA) app.setPath("userData", path.resolve(process.env.MEGA_LEAD_USER_DATA));
if (typeof app.setName === "function") app.setName("Mega Lead");


let server;
let localOrigin;
let quitting = false;
let backendApiUrl = "";
let whatsapp;

function registerWhatsAppIpc() {
  whatsapp = new WhatsAppService(app.getPath("userData"), log);
  whatsapp.on("event", (payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("wa:event", payload);
    }
  });
  ipcMain.handle("wa:status", () => whatsapp.snapshot());
  ipcMain.handle("wa:connect", (_event, options) => whatsapp.connect(options || {}));
  ipcMain.handle("wa:pair", (_event, phone) => whatsapp.pair(phone));
  ipcMain.handle("wa:disconnect", (_event, options) => whatsapp.disconnect(options || {}));
  ipcMain.handle("wa:send", (_event, input) => whatsapp.enqueue(input || {}));
  ipcMain.handle("wa:cancel", (_event, jobId) => whatsapp.cancel(jobId));
  ipcMain.handle("wa:pause", () => whatsapp.pause());
  ipcMain.handle("wa:resume", () => whatsapp.resume());
  ipcMain.handle("wa:history", (_event, limit) => whatsapp.history(limit));
  ipcMain.handle("wa:conversations", (_event, limit) => whatsapp.conversations(limit));
  ipcMain.handle("wa:messages", (_event, chatId, limit) => whatsapp.messages(chatId, limit));
}

function log(message, details) {
  const line = `${new Date().toISOString()} ${message}${details ? ` ${JSON.stringify(details)}` : ""}\n`;
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "mega-lead.log"), line, "utf8");
  } catch {}
}

log("main-loaded", { packaged: app.isPackaged });


function outputRoot() {
  if (!app.isPackaged) return path.join(__dirname, "..", ".output");
  return path.join(process.resourcesPath, "app.asar.unpacked", ".output");
}

function loadBackendConfig() {
  const candidates = [
    path.join(app.getPath("userData"), "backend.json"),
    path.join(__dirname, "config.json"),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const value = String(parsed.backendApiUrl || "").trim().replace(/\/$/, "");
      if (value) return value;
    } catch {}
  }
  return String(process.env.MEGA_LEAD_BACKEND_API_URL || "").trim().replace(/\/$/, "");
}

function loadRuntimeEnvironment() {
  const candidates = [
    path.join(app.getPath("userData"), "config.env"),
    !app.isPackaged && path.join(__dirname, "..", ".env"),
    app.isPackaged && path.join(process.resourcesPath, "app.asar.unpacked", ".env"),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) continue;
        const [, key, rawValue] = match;
        const value = rawValue.trim().replace(/^(["'])(.*)\1$/, "$2");
        if (!process.env[key] && value) process.env[key] = value;
      }
      break;
    } catch {}
  }
  // The browser build uses VITE_ names; server functions need the same values
  // without that prefix when running inside Electron's local server.
  for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]) {
    if (!process.env[key] && process.env[`VITE_${key}`]) process.env[key] = process.env[`VITE_${key}`];
  }
  try {
    const bundled = JSON.parse(fs.readFileSync(path.join(__dirname, "public-config.json"), "utf8"));
    process.env.SUPABASE_URL ||= bundled.supabaseUrl;
    process.env.SUPABASE_PUBLISHABLE_KEY ||= bundled.supabasePublishableKey;
  } catch {}
  log("runtime-env", { supabaseUrl: Boolean(process.env.SUPABASE_URL), supabaseKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY) });
}

function installWebSocketPolyfill() {
  if (typeof global.WebSocket !== "undefined") return;
  try {
    // ws is already a transitive dependency of the local Baileys integration.
    // Resolve it from that package instead of relying on a globally installed
    // module or changing the system Node version.
    const baileysRoot = path.dirname(require.resolve("@whiskeysockets/baileys/package.json"));
    global.WebSocket = require(require.resolve("ws", { paths: [baileysRoot] }));
    log("websocket-polyfill", { installed: true });
  } catch (error) {
    log("websocket-polyfill", { installed: false, error: String(error?.message || error) });
  }
}

function enableWindowsTlsCompatibility() {
  // Chromium validates TLS using the operating system trust store.
  // Keep Node's local HTTP fetch for the internal application health check.
  const nodeFetch = globalThis.fetch;
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url || String(input);
    return url.startsWith("https:") ? net.fetch(input, init) : nodeFetch(input, init);
  };
  log("tls-transport", { certificateVerification: true, transport: "chromium" });
}

function loadLocalGooglePlacesKey() {
  try {
    const file = path.join(app.getPath("userData"), "secrets.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const value = data.googlePlacesEncrypted
      ? safeStorage.decryptString(Buffer.from(data.googlePlacesEncrypted, "base64"))
      : String(data.googlePlacesApiKey || "").trim();
    return value || "";
  } catch { return ""; }
}

async function proxyRemote(req, res, body) {
  const response = await fetch(`${backendApiUrl}${req.url || "/"}`, {
    method: req.method,
    headers: { ...req.headers, host: new URL(backendApiUrl).host, "x-mega-lead-desktop": app.getVersion() },
    body: body?.length ? body : undefined,
    duplex: body?.length ? "half" : undefined,
    redirect: "manual",
  });
  const headers = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json" })[ext] || "application/octet-stream";
}

function servePublic(urlPath, res) {
  const relative = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  if (!relative || relative.includes("..")) return false;
  const root = path.join(outputRoot(), "public");
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { "content-type": mime(file), "cache-control": relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
  fs.createReadStream(file).pipe(res);
  return true;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function startInternalServer() {
  const entry = path.join(outputRoot(), "server", "index.mjs");
  if (!fs.existsSync(entry)) throw new Error(`Build interno ausente: ${entry}`);
  const workerModule = await import(pathToFileURL(entry).href);
  const worker = workerModule.default;
  if (!worker || typeof worker.fetch !== "function") throw new Error("O servidor interno não exporta fetch().");
  server = http.createServer(async (req, res) => {
    try {
      if (servePublic(req.url || "/", res)) return;
      const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await readBody(req);
      if (backendApiUrl && ((req.url || "").startsWith("/_serverFn") || (req.url || "").startsWith("/api/"))) {
        await proxyRemote(req, res, body);
        return;
      }
      const request = new Request(`${localOrigin}${req.url || "/"}`, {
        method: req.method, headers: req.headers, body: body?.length ? body : undefined,
        duplex: body?.length ? "half" : undefined,
      });
      const response = await worker.fetch(request, process.env, { waitUntil: () => {} });
      const headers = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      res.writeHead(response.status, headers);
      if (!response.body) return res.end();
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      log("internal-request-failed", { url: req.url, error: String(error?.stack || error) });
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Mega Lead: falha no servidor interno.");
    }
  });
  const portFile = path.join(app.getPath("userData"), "local-port.json");
  let savedPort = 0;
  try { savedPort = JSON.parse(fs.readFileSync(portFile, "utf8")).port; } catch {}
  if (!savedPort) {
    // Reuse the previous desktop origin when upgrading an older installation,
    // preserving localStorage (scripts, filters and login) without copying it.
    try {
      const prior = [...fs.readFileSync(path.join(app.getPath("userData"), "mega-lead.log"), "utf8").matchAll(/"origin":"http:\/\/127\.0\.0\.1:(\d+)"/g)];
      savedPort = Number(prior.at(-1)?.[1]) || 0;
    } catch {}
  }
  if (!Number.isInteger(savedPort) || savedPort < 1024 || savedPort > 65535) savedPort = 0;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(savedPort, "127.0.0.1", resolve);
  });
  const address = server.address();
  fs.writeFileSync(portFile, JSON.stringify({ port: address.port }));
  localOrigin = `http://127.0.0.1:${address.port}`;
  log("internal-server-started", { origin: localOrigin, outputRoot: outputRoot() });
  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(localOrigin, { redirect: "follow" });
      const html = await response.text();
      if (response.ok && /Mega Lead|MEGA LEAD/i.test(html)) {
        log("healthcheck-passed", { status: response.status, bytes: html.length });
        return;
      }
      lastError = new Error(`Healthcheck ${response.status}, conteúdo inesperado`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error("Servidor interno não respondeu.");
}

function errorPage(title, message) {
  const logPath = path.join(app.getPath("userData"), "mega-lead.log");
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{font:16px system-ui;background:#f4f1eb;color:#20241f;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:620px;background:white;border:1px solid #d8d2c7;border-radius:24px;padding:32px;box-shadow:0 20px 60px #0001}h1{font-size:24px}code{display:block;background:#f0ede6;padding:12px;border-radius:12px;word-break:break-all}</style><div class="box"><h1>${title}</h1><p>${message}</p><p>Feche e abra o aplicativo novamente. Se continuar, envie este arquivo para o suporte:</p><code>${logPath}</code></div></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1460, height: 920, minWidth: 1080, minHeight: 700, show: false,
    backgroundColor: "#f4f1eb", title: "Mega Lead", autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "public", "favicon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const fail = async (title, message, details) => {
    log("renderer-failed", details);
    await win.loadURL(errorPage(title, message));
    win.show();
  };
  win.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith("data:")) return;
    void fail("Não foi possível abrir o Mega Lead", `${description} (${code})`, { code, description, url });
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    log("render-process-gone", details);
    if (!quitting && !win.isDestroyed()) void fail("A interface foi reiniciada", "O processo gráfico foi encerrado inesperadamente.", details);
  });
  win.webContents.on("unresponsive", () => log("renderer-unresponsive"));
  win.webContents.on("responsive", () => log("renderer-responsive"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(localOrigin)) return { action: "allow" };
    void shell.openExternal(url); return { action: "deny" };
  });
  win.webContents.once("did-finish-load", async () => {
    try {
      const state = await win.webContents.executeJavaScript("(async () => { for(let i=0;i<80;i++){ const text=document.body?.innerText?.trim(); if(text) return {title:document.title,text:text.slice(0,100),nodes:document.body.children.length}; await new Promise(r=>setTimeout(r,250)); } return {text:'',nodes:0}; })()");
      if (!state.text || state.nodes < 1) throw new Error("Renderer carregou sem conteúdo visível.");
      log("renderer-content-confirmed", state);
      win.show();
    } catch (error) {
      void fail("A interface não carregou", String(error?.message || error), { error: String(error?.stack || error) });
    }
  });
  await win.loadURL(localOrigin + "/leads");
}

app.whenReady().then(async () => {
  crashReporter.start({ uploadToServer: false, compress: true });
  app.setAppUserModelId("com.megalead.desktop");
  loadRuntimeEnvironment();
  enableWindowsTlsCompatibility();
  installWebSocketPolyfill();
  registerWhatsAppIpc();
  void whatsapp.restoreConnection().catch(error => log("whatsapp-restore-failed", { error: String(error) }));
  ipcMain.handle("settings:google-status", () => ({ configured: Boolean(loadLocalGooglePlacesKey()) }));
  ipcMain.handle("settings:google-save", (_event, key) => {
    const value = String(key || "").trim();
    if (value.length < 20 || value.length > 256) throw new Error("Informe uma chave Google Places válida.");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("A proteção de credenciais do Windows está indisponível.");
    const file = path.join(app.getPath("userData"), "secrets.json");
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    saved.googlePlacesEncrypted = safeStorage.encryptString(value).toString("base64");
    delete saved.googlePlacesApiKey;
    fs.writeFileSync(file, JSON.stringify(saved));
    process.env.GOOGLE_PLACES_API_KEY = value;
    return { configured: true };
  });
  log("app-start", { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome });
  backendApiUrl = loadBackendConfig();
  process.env.MEGA_LEAD_BACKEND_API_URL = backendApiUrl;
  // The Google key is saved by the desktop settings screen. Expose it only to
  // this local process so the internal extractor can use it without a remote backend.
  process.env.GOOGLE_PLACES_API_KEY = loadLocalGooglePlacesKey();
  log("google-places-mode", { configured: Boolean(process.env.GOOGLE_PLACES_API_KEY) });
  log("backend-mode", { mode: backendApiUrl ? "remote" : "demo-local", backendApiUrl: backendApiUrl || null });
  try {
    await startInternalServer();
    await createWindow();
    const testExitMs = Number(app.commandLine.getSwitchValue("mega-lead-test-exit") || process.env.MEGA_LEAD_TEST_EXIT_MS || 0);
    if (testExitMs > 0) setTimeout(() => { log("test-exit-requested", { testExitMs }); app.quit(); }, testExitMs);
  }
  catch (error) {
    log("startup-failed", { error: String(error?.stack || error) });
    const win = new BrowserWindow({ width: 760, height: 520, backgroundColor: "#f4f1eb" });
    await win.loadURL(errorPage("O Mega Lead não conseguiu iniciar", String(error?.message || error)));
  }
});

app.on("before-quit", () => {
  quitting = true;
  log("app-before-quit");
  if (server?.listening) {
    server.close();
    log("internal-server-stop-requested");
  }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => { if (server) server.close(() => log("internal-server-stopped")); });
process.on("uncaughtException", (error) => log("uncaught-exception", { error: String(error?.stack || error) }));
process.on("unhandledRejection", (error) => log("unhandled-rejection", { error: String(error) }));
