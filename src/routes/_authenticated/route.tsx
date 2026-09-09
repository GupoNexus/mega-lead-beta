import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  MapPin,
  LogOut,
  Kanban,
  Map,
  MessageSquare,
  Inbox,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversations } from "@/lib/inbox.functions";
import { listNotifications } from "@/lib/operations.functions";
import { WorkspaceShell } from '@/components/WorkspaceShell';


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: WorkspaceShell,
});

const NAV_ITEMS = [
  { to: "/leads", label: "Leads", short: "Leads", Icon: MapPin },
  { to: "/crm", label: "CRM Pipeline", short: "CRM", Icon: Kanban },
  { to: "/inbox", label: "Inbox WhatsApp", short: "Inbox", Icon: Inbox, badge: true },
  { to: "/whatsapp", label: "Jornadas", short: "Jornadas", Icon: MessageSquare },
  { to: "/mapa", label: "Mapa de Leads", short: "Mapa", Icon: Map },
  { to: "/dashboard", label: "Dashboard", short: "Painel", Icon: LayoutDashboard },
  { to: "/conexoes", label: "Conexões", short: "Conectar", Icon: Plug },
  { to: "/privacidade", label: "Privacidade", short: "Dados", Icon: ShieldCheck },
] as const;

function AuthedLayout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const conversationsFn = useServerFn(listConversations);
  const notificationsFn = useServerFn(listNotifications);

  const convQ = useQuery({
    queryKey: ["wa-conversations"],
    queryFn: () => conversationsFn(),
    refetchInterval: 30_000,
  });
  const unread = (convQ.data?.conversations ?? []).reduce(
    (sum: number, c: { unread_count: number }) => sum + (c.unread_count || 0),
    0,
  );
  const notificationsQ = useQuery({ queryKey: ["notifications"], queryFn: () => notificationsFn(), refetchInterval: 30_000 });
  const notifications = notificationsQ.data?.notifications ?? [];

  async function signOut() {

    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-[100dvh] flex bg-slate-50 font-inter">
      {/* Sidebar - desktop only */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-100 p-6 flex-col shrink-0">
        <Link
          to="/"
          className="text-xl font-sora font-extrabold text-brand italic mb-10 block"
        >
          MEGA LEAD
        </Link>
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-slate-50 font-medium [&.active]:bg-brand/10 [&.active]:text-brand"
              activeProps={{ className: "active" }}
            >
              <item.Icon className="size-5" />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge && unread > 0 && (
                <span className="text-[10px] font-bold bg-emerald-500 text-white rounded-full px-1.5 py-0.5">
                  {unread}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 font-medium"
        >
          <LogOut className="size-5" /> Sair
        </button>
      </aside>

      {/* Mobile top header */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white/90 backdrop-blur border-b border-slate-100 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <Link
          to="/"
          className="text-lg font-sora font-extrabold text-brand italic"
        >
          MEGA LEAD
        </Link>
        <button
          onClick={signOut}
          aria-label="Sair"
          className="p-2 -mr-2 rounded-lg text-slate-500 active:bg-slate-100"
        >
          <LogOut className="size-5" />
        </button>
      </header>

      <main className="flex-1 min-w-0 overflow-auto pt-14 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
        {notifications.length > 0 && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">{notifications.length} alerta(s): {notifications[0]?.title}</div>}
        <Outlet />
      </main>


      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-100 pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegação principal"
      >
        <ul className="grid grid-cols-6">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-slate-500 [&.active]:text-brand active:bg-slate-50"
                activeProps={{ className: "active" }}
              >
                <item.Icon className="size-5" />
                {"badge" in item && item.badge && unread > 0 && (
                  <span className="absolute top-1 right-1/4 size-2 rounded-full bg-emerald-500" />
                )}
                <span className="leading-none">{item.short}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
