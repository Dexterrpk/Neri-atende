import {
  BarChart3,
  BookOpen,
  CalendarClock,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, NavLink, useLocation } from "react-router-dom";

import { Logo, NeriCredit } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useApp";
import { endSession } from "@/lib/session";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Painel", icon: LayoutDashboard, testId: "nav-dashboard" },
  { to: "/app/conversas", label: "Conversas", icon: MessageSquare, testId: "nav-conversations" },
  { to: "/app/clientes", label: "Clientes", icon: Users, testId: "nav-customers" },
  { to: "/app/catalogo", label: "Produtos e serviços", icon: Package, testId: "nav-catalog" },
  { to: "/app/conhecimento", label: "Ensine sua IA", icon: BookOpen, testId: "nav-knowledge" },
  { to: "/app/recuperacao", label: "Recuperar clientes", icon: RotateCcw, testId: "nav-recovery" },
  { to: "/app/agenda", label: "Agenda", icon: CalendarClock, testId: "nav-schedule" },
  { to: "/app/testar", label: "Testar minha IA", icon: Sparkles, testId: "nav-sandbox" },
  { to: "/app/configuracao", label: "Configurar minha IA", icon: Settings, testId: "nav-config" },
  { to: "/app/whatsapp", label: "Conectar WhatsApp", icon: LifeBuoy, testId: "nav-whatsapp" },
  { to: "/app/uso", label: "Uso e plano", icon: BarChart3, testId: "nav-usage" },
];

function SidebarContent({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-5 py-5">
        <Link to="/app" onClick={onNavigate} className="text-sidebar-foreground">
          <Logo />
        </Link>
        {onNavigate && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNavigate}
            className="text-sidebar-foreground lg:hidden"
            data-testid="sidebar-close-button"
            aria-label="Fechar menu"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            onClick={onNavigate}
            data-testid={item.testId}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-slate-300 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )
            }
          >
            <item.icon className="size-4.5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}

        {me.user.is_platform_admin && (
          <NavLink
            to="/admin"
            onClick={onNavigate}
            data-testid="nav-admin"
            className={({ isActive }) =>
              cn(
                "mt-3 flex items-center gap-3 rounded-xl border border-emerald-500/25 px-3 py-2.5 text-sm font-semibold transition-colors duration-150",
                isActive ? "bg-emerald-500/15 text-emerald-300" : "text-emerald-300/90 hover:bg-emerald-500/10",
              )
            }
          >
            <Shield className="size-4.5 shrink-0" />
            Painel da plataforma
          </NavLink>
        )}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border px-4 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" data-testid="sidebar-user-name">
            {me.user.name}
          </p>
          <p className="truncate text-xs text-slate-400" data-testid="sidebar-company-name">
            {me.company.name} · {me.user.role}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void endSession()}
          className="w-full justify-start gap-2 text-slate-300 hover:text-white"
          data-testid="logout-button"
        >
          <LogOut className="size-4" />
          Sair da conta
        </Button>
        <NeriCredit className="text-[0.68rem] text-slate-500" />
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background" data-testid="app-loading">
        <div className="flex flex-col items-center gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">Carregando seu painel…</p>
        </div>
      </div>
    );
  }

  // A failed /auth/me (no backend, expired cookie) degrades to the login screen,
  // never a blank page or a raw error.
  if (isError || !me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!me.company.onboarding_done && !location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-[262px] shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-[262px]">
          <SidebarContent me={me} />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" data-testid="mobile-sidebar">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          />
          <div className="absolute inset-y-0 left-0 w-[278px] animate-rise-in">
            <SidebarContent me={me} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setMobileOpen(true)}
            data-testid="sidebar-open-button"
            aria-label="Abrir menu"
          >
            <LayoutDashboard className="size-4" />
          </Button>
          <Logo compact />
          <span className="font-heading text-sm font-bold">Atende IA</span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mx-auto w-full max-w-6xl animate-rise-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
