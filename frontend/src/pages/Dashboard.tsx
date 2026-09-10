import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { NeriCredit, SectionTitle, Skeleton, StatusDot } from "@/components/Brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiErrorMessage, useDashboard, useInvalidate, useMe } from "@/hooks/useApp";
import { apiPost } from "@/lib/api";
import type { Ok } from "@/lib/types";

const METRICS = [
  { key: "conversations_today" as const, label: "Conversas hoje", icon: MessageSquare, testId: "metric-conversations-today" },
  { key: "customers_served" as const, label: "Clientes atendidos", icon: Users, testId: "metric-customers-served" },
  { key: "opportunities" as const, label: "Oportunidades", icon: Target, testId: "metric-opportunities" },
  { key: "recovered_sales" as const, label: "Vendas recuperadas", icon: TrendingUp, testId: "metric-recovered-sales" },
  { key: "appointments" as const, label: "Agendamentos", icon: CalendarClock, testId: "metric-appointments" },
];

const QUICK_ACTIONS = [
  { to: "/app/testar", label: "Testar minha IA", description: "Converse sem enviar nada", icon: Sparkles, testId: "quick-action-test" },
  { to: "/app/configuracao", label: "Configurar IA", description: "Personalidade e regras", icon: Settings, testId: "quick-action-config" },
  { to: "/app/whatsapp", label: "Conectar WhatsApp", description: "Status da conexão", icon: MessageSquare, testId: "quick-action-whatsapp" },
  { to: "/app/catalogo", label: "Adicionar produtos", description: "Catálogo da IA", icon: Package, testId: "quick-action-catalog" },
  { to: "/app/conversas", label: "Ver conversas", description: "Central de atendimento", icon: BookOpen, testId: "quick-action-conversations" },
  { to: "/app/recuperacao", label: "Recuperar clientes", description: "Quem parou de comprar", icon: RotateCcw, testId: "quick-action-recovery" },
];

const CHECKLIST_LABELS: Record<string, string> = {
  empresa: "Informações da empresa",
  personalidade: "Personalidade da IA",
  produtos: "Produtos e serviços",
  conhecimento: "Ensine sua IA",
  atendimento: "Regras de atendimento",
  vendas: "Regras de vendas",
  whatsapp: "WhatsApp conectado",
  teste: "IA testada",
};

export default function Dashboard() {
  const { data: me } = useMe();
  const { data, isLoading, isError } = useDashboard();
  const invalidate = useInvalidate();

  const demo = useMutation({
    mutationFn: () => apiPost<Ok>("/workspace/demo-data"),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate("dashboard", "customers", "conversations");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const firstName = me?.user.name.split(" ")[0] ?? "";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle
          overline="Painel"
          title={`Olá, ${firstName}`}
          description={`Este é o resumo do atendimento da ${me?.company.name ?? "sua empresa"}.`}
        />
        <Link to="/app/testar" className={buttonVariants({ size: "sm" }) + " w-fit gap-2"} data-testid="dashboard-test-cta">
          <Sparkles className="size-4" />
          Testar minha IA
        </Link>
      </div>

      {/* AI status banner */}
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-heading font-semibold text-amber-900">Não conseguimos carregar os números agora</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                Isso costuma ser uma instabilidade temporária de conexão. As demais telas continuam
                disponíveis pelo menu.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : data.ai_status === "ok" ? (
        <Card className="border-emerald-200 bg-emerald-50" data-testid="ai-status-banner">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <StatusDot status="ok" label="Sua IA está funcionando normalmente" testId="ai-status-badge" />
              <p className="text-sm text-emerald-800">
                Configuração completa. Ela atende usando somente as informações da sua empresa.
              </p>
            </div>
            <Link to="/app/conversas" className={buttonVariants({ variant: "outline", size: "sm" }) + " w-fit gap-2 bg-white"} data-testid="ai-status-conversations-button">
              Ver conversas
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50" data-testid="ai-status-banner">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-heading font-semibold text-amber-900" data-testid="ai-status-badge">
                <AlertTriangle className="size-4.5" />
                Sua IA ainda precisa de configuração
              </p>
              <ul className="space-y-1 text-sm text-amber-800">
                {data.pending_items.slice(0, 4).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <Link to="/app/configuracao" className={buttonVariants({ size: "sm" }) + " w-fit shrink-0 gap-2"} data-testid="ai-status-fix-button">
              Corrigir agora
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {METRICS.map((m) => (
          <Card key={m.key} className="transition-shadow duration-200 hover:shadow-md">
            <CardContent className="space-y-2.5 p-5">
              <span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <m.icon className="size-4.5" />
              </span>
              {isLoading ? (
                <Skeleton className="h-8 w-14" />
              ) : (
                <p className="font-heading text-3xl font-extrabold leading-none" data-testid={m.testId}>
                  {data ? data[m.key] : 0}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* quick actions */}
      <div className="space-y-4">
        <h3 className="font-heading text-lg font-semibold">Ações rápidas</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              data-testid={a.testId}
              className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
                <a.icon className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-heading text-sm font-semibold">{a.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
              </span>
              <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>

      {/* setup checklist */}
      {data && (
        <div className="space-y-4">
          <h3 className="font-heading text-lg font-semibold">O que já está configurado</h3>
          <Card>
            <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
              {Object.entries(data.checklist).map(([key, done]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3.5 py-2.5" data-testid={`checklist-${key}`}>
                  <span className="truncate text-sm">{CHECKLIST_LABELS[key] ?? key}</span>
                  <StatusDot status={done ? "ok" : "not_configured"} label={done ? "Concluído" : "Pendente"} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* explore with sample data */}
      {data && data.customers_served === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-heading font-semibold">
                <Wand2 className="size-4.5 text-primary" />
                Quer ver o painel com dados?
              </p>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                Adicionamos três clientes de exemplo com conversas na <strong>sua</strong> conta para
                você explorar as telas. Eles podem ser removidos depois em Clientes.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => demo.mutate()}
              disabled={demo.isPending}
              className="w-fit shrink-0"
              data-testid="dashboard-demo-data-button"
            >
              Adicionar clientes de exemplo
            </Button>
          </CardContent>
        </Card>
      )}

      <NeriCredit className="pt-2" />
    </div>
  );
}
