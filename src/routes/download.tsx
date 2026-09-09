import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { CheckCircle2, Download, LogOut, MonitorDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

export const Route = createFileRoute('/download')({
  ssr: false,
  beforeLoad: async () => { const { data } = await supabase.auth.getUser(); if (!data.user) throw redirect({ to: '/auth' }); return { user: data.user }; },
  head: () => ({ meta: [{ title: 'Baixar Mega Lead Beta' }, { name: 'robots', content: 'noindex' }] }), component: DownloadPage,
});

function DownloadPage() { const { user } = Route.useRouteContext(); const [progress, setProgress] = useState(0); const [downloading, setDownloading] = useState(false); const [downloadError, setDownloadError] = useState(''); async function logout() { await supabase.auth.signOut({ scope: 'local' }); window.location.assign('/'); }
  async function downloadInstaller() {
    const parts = Array.from({ length: 5 }, (_, index) => `/downloads/Mega-Lead-Beta-Setup.exe.part${String(index + 1).padStart(2, '0')}`);
    setDownloading(true); setDownloadError(''); setProgress(0);
    try {
      const chunks: BlobPart[] = [];
      for (let index = 0; index < parts.length; index += 1) {
        const response = await fetch(parts[index]);
        if (!response.ok) throw new Error(`Falha ao baixar a parte ${index + 1}`);
        chunks.push(await response.arrayBuffer());
        setProgress(Math.round(((index + 1) / parts.length) * 100));
      }
      const url = URL.createObjectURL(new Blob(chunks, { type: 'application/vnd.microsoft.portable-executable' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Mega-Lead-Beta-Setup.exe'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch { setDownloadError('Não foi possível concluir o download. Verifique sua internet e tente novamente.'); }
    finally { setDownloading(false); }
  }
  return <div className="download-page"><header><Link to="/" className="marketing-logo"><span>m.</span><b>mega lead</b></Link><button onClick={() => void logout()}><LogOut size={17}/> Sair</button></header><main><span className="beta-pill">Acesso beta liberado</span><div className="download-icon"><MonitorDown/></div><h1>Baixe o Mega Lead para Windows</h1><p>Olá, {user.user_metadata?.display_name || user.email}. Sua conta está pronta para testar a ferramenta.</p><button className="download-button" onClick={() => void downloadInstaller()} disabled={downloading}><Download size={20}/> {downloading ? `Preparando instalador… ${progress}%` : 'Baixar Mega Lead Beta'}</button>{downloadError && <p className="download-error">{downloadError}</p>}<small>Versão 1.4.0-rc.4 · Windows 10/11 · 64 bits</small><div className="download-steps"><h2>Depois de baixar</h2><ol><li><CheckCircle2/>Abra o instalador e conclua a instalação.</li><li><CheckCircle2/>Entre com o mesmo e-mail e senha.</li><li><CheckCircle2/>Configure sua chave do Google e conecte o WhatsApp.</li></ol></div><p className="beta-note"><strong>Esta é uma versão beta.</strong> Você pode encontrar comportamentos inesperados. Envie seu relato para <a href="mailto:grupohuback@gmail.com">grupohuback@gmail.com</a>.</p></main></div>;
}
