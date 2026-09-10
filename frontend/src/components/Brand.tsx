import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} data-testid="brand-logo">
      <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-sm shadow-emerald-600/25">
        <Sparkles className="size-4.5 text-white" strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-heading text-[1.05rem] font-bold tracking-tight">Atende IA</span>
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Neri Infotech
          </span>
        </span>
      )}
    </span>
  );
}

export function NeriCredit({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)} data-testid="neri-credit">
      Criado com excelência por{" "}
      <a
        href="https://neriinfotech.netlify.app"
        target="_blank"
        rel="noreferrer noopener"
        className="font-semibold text-primary underline-offset-4 transition-colors duration-150 hover:underline"
        data-testid="neri-credit-link"
      >
        Neri Infotech
      </a>
    </p>
  );
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  ok: { dot: "bg-emerald-500", label: "Funcionando", text: "text-emerald-700" },
  warn: { dot: "bg-amber-500", label: "Atenção", text: "text-amber-700" },
  error: { dot: "bg-red-500", label: "Erro", text: "text-red-700" },
  not_configured: { dot: "bg-slate-300", label: "Não configurado", text: "text-slate-500" },
};

export function StatusDot({
  status,
  label,
  testId,
}: {
  status: keyof typeof STATUS_STYLES | string;
  label?: string;
  testId?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.not_configured;
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-semibold", style.text)} data-testid={testId}>
      <span className="relative flex size-2.5">
        {status === "ok" && (
          <span className={cn("absolute inline-flex size-full rounded-full opacity-70", style.dot, "animate-ai-pulse")} />
        )}
        <span className={cn("relative inline-flex size-2.5 rounded-full", style.dot)} />
      </span>
      {label ?? style.label}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center"
      data-testid={testId ?? "empty-state"}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <Icon className="size-6" />
      </span>
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-line rounded-lg", className)} aria-hidden />;
}

export function SectionTitle({
  overline,
  title,
  description,
}: {
  overline?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      {overline && (
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{overline}</p>
      )}
      <h2 className="font-heading text-2xl font-bold sm:text-[1.75rem]">{title}</h2>
      {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}
