const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("megaLeadDesktop", Object.freeze({
  platform: process.platform,
  desktop: true,
  settings: Object.freeze({
    googleStatus: () => ipcRenderer.invoke("settings:google-status"),
    saveGoogleKey: (key) => ipcRenderer.invoke("settings:google-save", key),
  }),
  version: "1.4.0-rc.4",
  backendApiUrl: process.env.MEGA_LEAD_BACKEND_API_URL || null,
  whatsapp: Object.freeze({
    status: () => ipcRenderer.invoke("wa:status"),
    connect: (options = {}) => ipcRenderer.invoke("wa:connect", options),
    pair: (phone) => ipcRenderer.invoke("wa:pair", phone),
    disconnect: (options = {}) => ipcRenderer.invoke("wa:disconnect", options),
    send: (input) => ipcRenderer.invoke("wa:send", input),
    cancel: (jobId) => ipcRenderer.invoke("wa:cancel", jobId),
    pause: () => ipcRenderer.invoke("wa:pause"),
    resume: () => ipcRenderer.invoke("wa:resume"),
    history: (limit = 500) => ipcRenderer.invoke("wa:history", limit),
    conversations: (limit = 300) => ipcRenderer.invoke("wa:conversations", limit),
    messages: (chatId, limit = 1000) => ipcRenderer.invoke("wa:messages", chatId, limit),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("wa:event", listener);
      return () => ipcRenderer.removeListener("wa:event", listener);
    },
  }),
}));
