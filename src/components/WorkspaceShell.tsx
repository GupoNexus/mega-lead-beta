import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Search, Columns3, MessageCircle, Settings2, LogOut, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { listNotifications } from '@/lib/operations.functions';
import { listConversations } from '@/lib/inbox.functions';

const areas = [
  { to: '/leads', label: 'Prospecção', icon: Search, paths: ['/leads', '/mapa'] },
  { to: '/crm', label: 'CRM / Leads', icon: Columns3, paths: ['/crm', '/dashboard'] },
  { to: '/inbox', label: 'WhatsApp', icon: MessageCircle, paths: ['/inbox', '/whatsapp'] },
  { to: '/conexoes', label: 'Configurações', icon: Settings2, paths: ['/conexoes', '/privacidade'] },
] as const;
const secondary = [
  [{ to: '/leads', label: 'Extrator e contatos' }, { to: '/mapa', label: 'Mapa de leads' }],
  [{ to: '/crm', label: 'Funil de vendas' }, { to: '/dashboard', label: 'Métricas e relatórios' }],
  [{ to: '/inbox', label: 'Central WhatsApp' }, { to: '/whatsapp', label: 'Jornadas avançadas' }],
  [{ to: '/conexoes', label: 'Integrações' }, { to: '/privacidade', label: 'Privacidade e dados' }],
] as const;
export function WorkspaceShell() {
  const location = useLocation();
  const qc = useQueryClient();
  const notificationsFn = useServerFn(listNotifications);
  const conversationsFn = useServerFn(listConversations);
  const notificationsQ = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsFn(), refetchInterval: 60000, retry: false });
  const convQ = useQuery({ queryKey: ['wa-conversations'], queryFn: () => conversationsFn(), refetchInterval: 60000, retry: false });
  const unread = (convQ.data?.conversations ?? []).reduce((sum: number, c: { unread_count: number }) => sum + (c.unread_count || 0), 0);
  const notifications: Array<{ title: string }> = notificationsQ.data?.notifications ?? [];
  const index = Math.max(0, areas.findIndex(area => (area.paths as readonly string[]).includes(location.pathname)));
  async function logout() {
    await qc.cancelQueries();
    await supabase.auth.signOut({ scope: 'local' });
    qc.clear();
    window.location.assign('/auth');
  }
  return <div className="workspace-shell">
    <header className="workspace-top">
      <Link to="/leads" className="workspace-logo"><span>m<span className="text-emerald-400">.</span></span><b>mega lead<small>PROSPECÇÃO & CONVERSAS</small></b></Link>
      <nav aria-label="Navegação principal">{areas.map((area, i) => <Link key={area.to} to={area.to} className={i === index ? 'selected' : ''}><area.icon size={17}/>{area.label}</Link>)}</nav>
      <button onClick={() => void logout()} title="Sair da conta" aria-label="Sair da conta"><LogOut size={18}/></button>
    </header>
    <div className="workspace-context"><span>SEU ESPAÇO DE TRABALHO <ArrowUpRight size={13}/></span><nav aria-label="Opções da área">{secondary[index].map(item => <Link key={item.to} to={item.to} className={location.pathname === item.to ? 'selected' : ''}>{item.label}</Link>)}</nav></div>
    <main className="workspace-content">
      {(notifications.length > 0 || unread > 0) && <details className="border-b bg-amber-50 px-6 py-2 text-xs text-amber-900"><summary>Atividade: {unread} não lidas · {notifications.length} alertas</summary>{notifications.map((n, i) => <p key={i}>{n.title}</p>)}</details>}
      <Outlet/>
    </main>
  </div>;
}
