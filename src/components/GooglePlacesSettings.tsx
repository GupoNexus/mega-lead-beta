import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
export function GooglePlacesSettings() {
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const settings = window.megaLeadDesktop?.settings;
  useEffect(() => { void settings?.googleStatus().then(s => setConfigured(s.configured)).catch(() => {}); }, [settings]);
  async function save() {
    if (!settings || busy) return;
    setBusy(true);
    try {
      await settings.saveGoogleKey(key);
      setKey(''); setConfigured(true);
      await qc.invalidateQueries({ queryKey: ['backend-health'] });
      toast.success('Chave salva com proteção do Windows. Não é necessário reiniciar.');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-2xl border bg-white p-6">
    <h2 className="text-lg font-bold">Extração Google Maps</h2>
    <p className="mt-1 text-sm text-slate-500">{configured ? 'Chave local configurada. A validade é verificada ao realizar uma busca.' : 'Configure a chave Google Places para realizar buscas reais.'}</p>
    {settings && <div className="mt-4 rounded-xl bg-emerald-50 p-4">
      <a href="https://console.cloud.google.com/google/maps-hosted/tos?hl=pt-br" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
        Obter chave gratuita de teste <ExternalLink aria-hidden="true" className="size-4" />
      </a>
      <p className="mt-3 text-sm text-slate-700">Entre na sua conta Google, aceite os termos da Maps Demo Key e copie a chave para o campo abaixo. Não exige dados de faturamento.</p>
      <p className="mt-2 text-xs text-slate-500">Para testes e protótipos, com cotas do Google e recursos limitados. Fotos e avaliações de usuários não estão disponíveis. Para uso em produção, utilize uma chave de produção.</p>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold">Preciso de uma chave de produção</summary>
        <p className="mt-2">O Google pode solicitar login, criação de projeto e faturamento. Ative a Places API (New) no mesmo projeto da chave.</p>
        <div className="mt-2 flex flex-wrap gap-4">
          <a href="https://console.cloud.google.com/project/_/google/maps-apis/credentials?hl=pt-br" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">Criar chave de produção</a>
          <a href="https://console.cloud.google.com/google/maps-apis/start?hl=pt-br" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">Configurar minha conta</a>
          <a href="https://console.cloud.google.com/apis/library/places.googleapis.com?hl=pt-br" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">Ativar Places API (New)</a>
        </div>
      </details>
    </div>}
    {settings ? <div className="mt-4 flex gap-3"><input aria-label="Chave Google Places" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={configured ? 'Nova chave (para substituir)' : 'Chave da API Google Places'} className="min-w-0 flex-1 rounded-xl border px-3 py-2"/><button disabled={busy || !key.trim()} onClick={() => void save()} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40">{busy ? 'Salvando…' : 'Salvar chave'}</button></div> : <p className="mt-3 text-sm">No navegador, configure GOOGLE_PLACES_API_KEY no servidor.</p>}
  </section>;
}
