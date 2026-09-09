import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Inbox as InboxIcon, Loader2, Search, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { getBridgeStatus, getLocalConversations, getLocalMessages, onIncomingMessage, sendViaExtension, type WaConversation, type WaIncomingMessage } from "@/lib/wa-bridge";
import { useWaBridge } from "@/hooks/useWaBridge";
import { WaConnectionCard } from "@/components/WaConnectionCard";
import { LocalDispatcher } from "@/components/LocalDispatcher";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Conversas WhatsApp | MEGA LEAD" }] }),
  component: InboxPage,
});

function friendlyPhone(phone: string) {
  if (!phone) return "Número não compartilhado";
  const digits = phone.replace(/\D/g, "");
  return digits.length === 13 ? `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}` : `+${digits}`;
}

function Avatar({ conversation, large = false }: { conversation: WaConversation; large?: boolean }) {
  const size = large ? "size-10" : "size-11";
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [conversation.avatarUrl]);
  if (conversation.avatarUrl && !failed) return <img src={conversation.avatarUrl} alt="" className={`${size} shrink-0 rounded-full object-cover bg-slate-100`} onError={() => setFailed(true)} />;
  const initial = (conversation.contactName || conversation.phone).trim().slice(0, 1).toUpperCase();
  return <span className={`${size} shrink-0 grid place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700`}>{initial || <UserRound className="size-4" />}</span>;
}

function InboxPage() {
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [messages, setMessages] = useState<WaIncomingMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<"conversations" | "dispatcher" | "connection">("conversations");
  const dispatcherBridge = useWaBridge();
  const requestedPhone = useRef(new URLSearchParams(window.location.search).get("phone")?.replace(/\D/g, "") || "");
  const requestedText = useRef(new URLSearchParams(window.location.search).get("text") || "");

  const refreshConversations = async () => {
    try {
      const [status, chats] = await Promise.all([getBridgeStatus(), getLocalConversations()]);
      if (status.connected && /^\d{10,15}$/.test(requestedPhone.current)) {
        const phone = requestedPhone.current;
        let chat = chats.find(c => c.phone.replace(/\D/g, "") === phone);
        if (!chat) { chat = { id: phone + "@s.whatsapp.net", phone, contactName: null, avatarUrl: null, lastMessage: "", lastMessageAt: Date.now(), fromMe: false }; chats.unshift(chat); }
        setActiveId(chat.id);
        setDraft(requestedText.current);
        requestedPhone.current = "";
      }
      setConnected(status.connected);
      setConversations(current => status.connected ? [...chats, ...current.filter(c => !chats.some(n => n.id === c.id) && !c.lastMessage)] : []);
      setActiveId((current) => status.connected ? current : null);
    } catch (error) { toast.error("Não foi possível carregar as conversas", { description: (error as Error).message }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void refreshConversations();
    const unsubscribe = onIncomingMessage(() => void refreshConversations());
    const timer = window.setInterval(() => void refreshConversations(), 10_000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!dispatcherBridge.status.connected) {
      setConnected(false); setConversations([]); setMessages([]); setActiveId(null);
    } else { void refreshConversations(); }
  }, [dispatcherBridge.status.connected]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    void getLocalMessages(activeId).then(rows => { if (!cancelled) setMessages(rows); }).catch((error) => toast.error("Não foi possível abrir a conversa", { description: error.message }));
    return () => { cancelled = true; };
  }, [activeId, conversations]);

  const active = conversations.find((chat) => chat.id === activeId) || null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((chat) => `${chat.contactName || ""} ${chat.phone} ${chat.lastMessage}`.toLowerCase().includes(term));
  }, [conversations, search]);

  const handleSend = async () => {
    if (!active || !draft.trim() || sending || !connected) return;
    setSending(true);
    try {
      await sendViaExtension(active.phone, draft.trim(), { chatId: active.id, contactName: active.contactName });
      setDraft("");
      toast.success("Mensagem adicionada à fila de envio");
    } catch (error) { toast.error("Não foi possível enviar", { description: (error as Error).message }); }
    finally { setSending(false); }
  };

  return <div className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-100 bg-white px-5 py-5 md:px-8">
      <h1 className="flex items-center gap-3 font-sora text-xl font-bold text-slate-900 md:text-2xl"><span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><InboxIcon className="size-5" /></span>Central WhatsApp</h1>
      <p className="mt-1 text-sm text-slate-500">Mensagens diretas, recebidas e enviadas neste computador. Status, grupos e canais não aparecem aqui.</p>
      <nav className="mt-4 flex w-fit rounded-xl bg-slate-100 p-1 text-sm font-bold"><button onClick={() => setView("conversations")} className={`rounded-lg px-4 py-2 ${view === "conversations" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>Conversas</button><button onClick={() => setView("dispatcher")} className={`rounded-lg px-4 py-2 ${view === "dispatcher" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>Disparador</button><button onClick={() => setView("connection")} className="rounded-lg px-4 py-2 text-slate-600">{dispatcherBridge.status.connected ? "Conta conectada" : "Conectar conta"}</button></nav>
    </header>
    {view === "connection" ? <div className="p-6"><WaConnectionCard status={dispatcherBridge.status} checking={dispatcherBridge.checking} onRefresh={dispatcherBridge.refresh} onConnect={dispatcherBridge.connect} onPair={dispatcherBridge.pair} onDisconnect={dispatcherBridge.disconnect}/></div> : <div className={view === "dispatcher" ? "wa-workbench grid xl:grid-cols-[minmax(0,1fr)_400px]" : ""}><div className="min-w-0 p-5 md:p-8">
      {!connected && !loading && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Conecte o WhatsApp em <button className="font-bold underline" onClick={() => setView("connection")}>Conectar conta</button> para carregar e responder conversas.</div>}
      <section className="grid min-h-[600px] overflow-hidden rounded-2xl border border-slate-100 bg-white md:grid-cols-[360px_1fr]">
        <aside className={`flex flex-col border-r border-slate-100 ${active ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-slate-100 p-4"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" className="w-full rounded-xl border border-slate-100 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500" /></div></div>
          <div className="max-h-[68vh] flex-1 divide-y divide-slate-100 overflow-y-auto">
            {loading ? <div className="grid place-items-center p-10 text-slate-400"><Loader2 className="size-5 animate-spin" /></div> : filtered.length === 0 ? <p className="p-8 text-center text-sm text-slate-400">Nenhuma conversa direta ainda.</p> : filtered.map((chat) => <button key={chat.id} onClick={() => setActiveId(chat.id)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${chat.id === activeId ? "bg-emerald-50" : ""}`}><Avatar conversation={chat} /><span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><b className="truncate text-sm text-slate-800">{chat.contactName || friendlyPhone(chat.phone)}</b><time className="shrink-0 text-[10px] text-slate-400">{new Date(chat.lastMessageAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></span><span className="mt-0.5 block truncate text-xs text-slate-500">{chat.fromMe ? "Você: " : ""}{chat.lastMessage}</span></span></button>)}
          </div>
        </aside>
        <main className={`flex min-h-[600px] flex-col ${active ? "flex" : "hidden md:flex"}`}>
          {!active ? <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-400">Selecione uma conversa direta.</div> : <><div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3"><button onClick={() => setActiveId(null)} className="rounded-lg p-1.5 text-slate-500 md:hidden" aria-label="Voltar"><ArrowLeft className="size-5" /></button><Avatar conversation={active} large /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{active.contactName || friendlyPhone(active.phone)}</p><p className="text-xs text-slate-400">{friendlyPhone(active.phone)}</p></div></div><MessageList messages={messages} /><div className="flex items-end gap-2 border-t border-slate-100 p-3"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} rows={2} placeholder="Escreva uma mensagem…" className="flex-1 resize-none rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" /><button onClick={() => void handleSend()} disabled={sending || !draft.trim() || !connected} className="rounded-xl bg-emerald-500 p-3 text-white hover:bg-emerald-600 disabled:opacity-40" aria-label="Enviar">{sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}</button></div></>}
        </main>
      </section>
    </div>{view === "dispatcher" && <aside className="wa-dispatch-panel min-w-0 border-l"><LocalDispatcher bridge={dispatcherBridge} onConversations={() => setView("conversations")} onConnect={() => setView("connection")} /></aside>}</div>}
  </div>;
}

function MessageList({ messages }: { messages: WaIncomingMessage[] }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  return <div className="max-h-[530px] flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">{messages.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Nenhuma mensagem registrada.</p> : messages.map((message) => <div key={message.externalId} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${message.fromMe ? "ml-auto rounded-br-md bg-emerald-500 text-white" : "rounded-bl-md border border-slate-100 bg-white text-slate-700"}`}><p className="whitespace-pre-wrap break-words">{message.body}</p><time className={`mt-1 block text-[10px] ${message.fromMe ? "text-emerald-50/80" : "text-slate-400"}`}>{new Date(message.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div>)}<div ref={bottom} /></div>;
}
