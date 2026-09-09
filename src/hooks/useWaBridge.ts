import { useCallback, useEffect, useState } from "react";
import { DISCONNECTED, cancelLocalJob, disconnectLocalWhatsApp, getBridgeStatus, onStatusChange, pullRecentChats, requestLocalPairingCode, sendViaExtension, startLocalConnection, type WaBridgeStatus } from "@/lib/wa-bridge";

export function useWaBridge() {
  const [status, setStatus] = useState<WaBridgeStatus>(DISCONNECTED);
  const [checking, setChecking] = useState(true);
  const refresh = useCallback(async () => { const next = await getBridgeStatus(); setStatus(next); setChecking(false); return next; }, []);
  useEffect(() => { void refresh(); const off = onStatusChange((next) => setStatus(next)); const id = window.setInterval(() => void refresh(), 10_000); return () => { off(); clearInterval(id); }; }, [refresh]);
  const connect = useCallback(async (fresh = false) => { const next = await startLocalConnection(fresh); setStatus({ ...DISCONNECTED, ...next, installed: true }); return next; }, []);
  const pair = useCallback(async (phone: string) => { const next = await requestLocalPairingCode(phone); setStatus({ ...DISCONNECTED, ...next, installed: true }); return next; }, []);
  const disconnect = useCallback(async (erase = false) => { const next = await disconnectLocalWhatsApp(erase); setStatus({ ...DISCONNECTED, ...next, installed: true }); return next; }, []);
  const send = useCallback(async (args: { phone: string; message: string; name?: string | null; leadId?: string | null; minDelaySeconds?: number; maxDelaySeconds?: number; dailyLimit?: number; batchSize?: number; batchPauseSeconds?: number; batchPosition?: number }) => {
    if (!status.connected) throw new Error("Conecte o WhatsApp antes de enviar");
    return sendViaExtension(args.phone, args.message, {
      contactName: args.name, leadId: args.leadId,
      minDelaySeconds: args.minDelaySeconds, maxDelaySeconds: args.maxDelaySeconds,
      dailyLimit: args.dailyLimit, batchSize: args.batchSize,
      batchPauseSeconds: args.batchPauseSeconds, batchPosition: args.batchPosition,
    });
  }, [status.connected]);
  const syncNow = useCallback(async () => (await pullRecentChats()).messages.length, []);
  return { status, checking, refresh, connect, pair, disconnect, send, cancelJob: cancelLocalJob, syncNow, openWhatsAppTab: connect };
}
