export type WaJob = { id: string; phone: string; text: string; status: string; attempts: number; createdAt: string };
export type WaBridgeStatus = { paused?: boolean; installed: boolean; connected: boolean; connecting: boolean; qr: string | null; pairingCode?: string | null; pairingPhone?: string | null; phone: string | null; name: string | null; queued: number; jobs: WaJob[]; failed: number };
export type WaIncomingMessage = { externalId: string; chatId: string; phone: string; contactName: string | null; body: string; fromMe: boolean; timestamp: number; status?: string | null };
export type WaConversation = { id: string; phone: string; contactName: string | null; avatarUrl: string | null; lastMessage: string; lastMessageAt: number; fromMe: boolean };

type NativeWhatsApp = {
  status: () => Promise<WaBridgeStatus>;
  connect: (options?: { fresh?: boolean }) => Promise<WaBridgeStatus>;
  pair: (phone: string) => Promise<WaBridgeStatus>;
  disconnect: (options?: { erase?: boolean }) => Promise<WaBridgeStatus>;
  send: (input: Record<string, unknown>) => Promise<unknown>;
  cancel: (jobId: string) => Promise<unknown>;
  pause: () => Promise<WaBridgeStatus>;
  resume: () => Promise<WaBridgeStatus>;
  history: (limit?: number) => Promise<WaIncomingMessage[]>;
  conversations: (limit?: number) => Promise<WaConversation[]>;
  messages: (chatId: string, limit?: number) => Promise<WaIncomingMessage[]>;
  onEvent: (callback: (payload: { event: string; data: unknown }) => void) => () => void;
};

declare global { interface Window { megaLeadDesktop?: { whatsapp?: NativeWhatsApp; settings?: { googleStatus: () => Promise<{ configured: boolean }>; saveGoogleKey: (key: string) => Promise<{ configured: boolean }> } } } }

export const DISCONNECTED: WaBridgeStatus = { installed: false, connected: false, connecting: false, qr: null, phone: null, name: null, queued: 0, jobs: [], failed: 0 };

function native() { return typeof window === "undefined" ? undefined : window.megaLeadDesktop?.whatsapp; }
export async function getBridgeStatus() { const bridge = native(); return bridge ? { ...DISCONNECTED, ...(await bridge.status()), installed: true } : DISCONNECTED; }
export async function startLocalConnection(fresh = false) { const bridge = native(); if (!bridge) throw new Error("Abra o Mega Lead instalado para conectar o WhatsApp"); return bridge.connect({ fresh }); }
export async function requestLocalPairingCode(phone: string) { const bridge = native(); if (!bridge) throw new Error("Abra o Mega Lead instalado para conectar o WhatsApp"); return bridge.pair(phone); }
export async function disconnectLocalWhatsApp(erase = false) { const bridge = native(); if (!bridge) throw new Error("WhatsApp local indisponível"); return bridge.disconnect({ erase }); }
export async function sendViaExtension(phone: string, message: string, options: Record<string, unknown> = {}) { const bridge = native(); if (!bridge) throw new Error("Abra o Mega Lead instalado para enviar dentro do app"); return bridge.send({ phone, text: message, ...options }); }
export async function cancelLocalJob(jobId: string) { const bridge = native(); if (!bridge) throw new Error("WhatsApp local indisponível"); return bridge.cancel(jobId); }
export async function pullRecentChats() { const bridge = native(); return bridge ? { messages: await bridge.history(1000) } : { messages: [] }; }
export async function getLocalConversations(limit = 300): Promise<WaConversation[]> { const bridge = native(); return bridge ? bridge.conversations(limit) : []; }
export async function getLocalMessages(chatId: string, limit = 1000): Promise<WaIncomingMessage[]> { const bridge = native(); return bridge ? bridge.messages(chatId, limit) : []; }
export function onStatusChange(callback: (status: WaBridgeStatus) => void) { const bridge = native(); return bridge ? bridge.onEvent(({ event, data }) => { if (event === "status") callback({ ...DISCONNECTED, ...(data as WaBridgeStatus), installed: true }); }) : () => {}; }
export function onIncomingMessage(callback: (message: WaIncomingMessage) => void) { const bridge = native(); return bridge ? bridge.onEvent(({ event, data }) => { if (event === "message.in" || event === "message.ack" || event === "message.sent") callback(data as WaIncomingMessage); }) : () => {}; }
export async function pauseLocalQueue() { const b = native(); if (!b) throw new Error('WhatsApp indisponível'); return b.pause(); }
export async function resumeLocalQueue() { const b = native(); if (!b) throw new Error('WhatsApp indisponível'); return b.resume(); }
