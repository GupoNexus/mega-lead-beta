import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { CheckCircle2, Download, LogOut, MonitorDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/download')({
  ssr: false,
  beforeLoad: async () => { const { data } = await supabase.auth.getUser(); if (!data.user) throw redirect({ to: '/auth' }); return { user: data.user }; },
  head: () => ({ meta: [{ title: 'Baixar Mega Lead Beta' }, { name: 'robots', content: 'noindex' }] }), component: DownloadPage,
});

function DownloadPage() { const { user } = Route.useRouteContext(); async function logout() { await supabase.auth.signOut({ scope: 'local' }); window.location.assign('/'); }
  return <div className="download-page"><header><Link to="/" className="marketing-logo"><span>m.</span><b>mega lead</b></Link><button onClick={() => void logout()}><LogOut size={17}/> Sair</button></header><main><span className="beta-pill">Acesso beta liberado</span><div className="download-icon"><MonitorDown/></div><h1>Baixe o Mega Lead para Windows</h1><p>Olá, {user.user_metadata?.display_name || user.email}. Sua conta está pronta para testar a ferramenta.</p><a className="download-button" href="/downloads/Mega-Lead-Beta-Setup.exe" download><Download size={20}/> Baixar Mega Lead Beta</a><small>Versão 1.4.0-rc.4 · Windows 10/11 · 64 bits</small><div className="download-steps"><h2>Depois de baixar</h2><ol><li><CheckCircle2/>Abra o instalador e conclua a instalação.</li><li><CheckCircle2/>Entre com o mesmo e-mail e senha.</li><li><CheckCircle2/>Configure sua chave do Google e conecte o WhatsApp.</li></ol></div><p className="beta-note"><strong>Esta é uma versão beta.</strong> Você pode encontrar comportamentos inesperados. Envie seu relato para <a href="mailto:grupohuback@gmail.com">grupohuback@gmail.com</a>.</p></main></div>;
}
