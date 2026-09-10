import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2, LogOut, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SectionTitle, Skeleton } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage, useInvalidate, useMe } from "@/hooks/useApp";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { CompanyAuditEntry, Ok, Role, SessionInfo, Usage, User } from "@/lib/types";

const ROLES: Record<Role, string> = {
  OWNER: "Proprietário — acesso total",
  ADMIN: "Administrador — gestão e configurações",
  MANAGER: "Gerente — equipe, conversas e métricas",
  AGENT: "Atendente — atendimento",
  VIEWER: "Visualizador — somente leitura",
};

const METRIC_ROWS: { key: keyof Usage; limitKey: string; label: string }[] = [
  { key: "ai_calls_month", limitKey: "ai_calls", label: "Respostas de IA este mês" },
  { key: "messages_month", limitKey: "conversations", label: "Mensagens este mês" },
  { key: "customers", limitKey: "customers", label: "Clientes cadastrados" },
  { key: "conversations", limitKey: "conversations", label: "Conversas totais" },
];

export default function UsageAndTeam() {
  const invalidate = useInvalidate();
  const { data: me } = useMe();
  const canManage = me?.user.role === "OWNER" || me?.user.role === "ADMIN";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "AGENT" as Role });

  const { data: usage, isLoading } = useQuery<Usage>({ queryKey: ["usage"], queryFn: () => apiGet<Usage>("/usage"), retry: false });
  const { data: team } = useQuery<User[]>({ queryKey: ["team"], queryFn: () => apiGet<User[]>("/auth/team"), retry: false });
  const { data: sessions } = useQuery<SessionInfo[]>({ queryKey: ["sessions"], queryFn: () => apiGet<SessionInfo[]>("/auth/sessions"), retry: false });
  const { data: logs } = useQuery<CompanyAuditEntry[]>({
    queryKey: ["company-audit"],
    queryFn: () => apiGet<CompanyAuditEntry[]>("/audit-logs"),
    retry: false,
    enabled: canManage,
  });

  const invite = useMutation({
    mutationFn: () => apiPost<User>("/auth/team", form),
    onSuccess: () => {
      toast.success("Usuário criado. Ele já pode entrar com essa senha.");
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "AGENT" });
      invalidate("team");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => apiPatch<User>(`/auth/team/${id}/role`, { role }),
    onSuccess: () => {
      toast.success("Permissão atualizada");
      invalidate("team");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/auth/team/${id}`),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate("team");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const logoutAll = useMutation({
    mutationFn: () => apiPost<Ok>("/auth/logout-all"),
    onSuccess: () => {
      toast.success("Todas as sessões foram encerradas");
      window.location.href = "/login";
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success("Sessão revogada");
      invalidate("sessions");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-8">
      <SectionTitle
        overline="Conta"
        title="Uso, plano e equipe"
        description="Acompanhe seu consumo, gerencie quem tem acesso e controle as sessões abertas."
      />

      {/* usage */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-heading text-lg font-semibold">
              <BarChart3 className="size-4.5 text-primary" />
              Consumo do mês
            </h3>
            {usage && <Badge data-testid="usage-plan-badge">Plano {usage.plan}</Badge>}
          </div>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !usage ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar o consumo agora.</p>
          ) : (
            <div className="space-y-3">
              {METRIC_ROWS.map((row) => {
                const value = usage[row.key] as number;
                const limit = usage.limits[row.limitKey] ?? 0;
                const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
                return (
                  <div key={row.key} className="space-y-1.5" data-testid={`usage-row-${row.key}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="font-medium">
                        {value} {limit ? `de ${limit}` : ""}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-[width] duration-500 ${pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-muted-foreground">
                Números reais da sua conta. Nenhuma métrica é estimada ou fictícia.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* team */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="font-heading text-lg font-semibold">Equipe</h3>
              <p className="text-sm text-muted-foreground">As permissões são verificadas no servidor, não apenas na tela.</p>
            </div>
            {canManage && (
              <Button onClick={() => setOpen(true)} size="sm" className="w-fit gap-2" data-testid="team-invite-button">
                <Plus className="size-4" />
                Adicionar usuário
              </Button>
            )}
          </div>
          <div className="space-y-2.5">
            {(team ?? []).map((u) => (
              <div key={u.id} className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`team-row-${u.id}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManage && u.id !== me?.user.id && u.role !== "OWNER" ? (
                    <Select value={u.role} onValueChange={(v: string) => changeRole.mutate({ id: u.id, role: v as Role })}>
                      <SelectTrigger size="sm" className="w-[190px]" data-testid={`team-role-select-${u.id}`}>
                        <SelectValue>{(v) => String(v)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLES) as Role[]).filter((r) => r !== "OWNER" || me?.user.role === "OWNER").map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{u.role}</Badge>
                  )}
                  {canManage && u.id !== me?.user.id && u.role !== "OWNER" && (
                    <Button variant="ghost" size="icon-sm" onClick={() => deactivate.mutate(u.id)} className="text-destructive" aria-label="Desativar acesso" data-testid={`team-deactivate-${u.id}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1 rounded-xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            {(Object.entries(ROLES) as [Role, string][]).map(([r, d]) => (
              <p key={r}>
                <strong className="text-foreground">{r}</strong> — {d.split("— ")[1]}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* sessions */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 font-heading text-lg font-semibold">
                <ShieldCheck className="size-4.5 text-primary" />
                Sessões abertas
              </h3>
              <p className="text-sm text-muted-foreground">Dispositivos com acesso à sua conta agora.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logoutAll.mutate()} disabled={logoutAll.isPending} className="w-fit gap-2" data-testid="logout-all-button">
              {logoutAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              Sair de todos os dispositivos
            </Button>
          </div>
          <div className="space-y-2.5">
            {(sessions ?? []).map((s) => (
              <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`session-row-${s.id}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {s.user_agent || "Dispositivo desconhecido"}
                    {s.current && <Badge className="ml-2">Esta sessão</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aberta em {new Date(s.created_at).toLocaleString("pt-BR")} · Ativa em{" "}
                    {new Date(s.last_seen_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)} className="w-fit text-destructive hover:text-destructive" data-testid={`session-revoke-${s.id}`}>
                    Revogar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* audit */}
      {canManage && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h3 className="font-heading text-lg font-semibold">Registro de atividades</h3>
              <p className="text-sm text-muted-foreground">
                Ações importantes da sua empresa. Nenhuma senha ou chave é gravada aqui.
              </p>
            </div>
            {!logs || logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {logs.slice(0, 25).map((l) => (
                  <div key={l.id} className="flex flex-col gap-1 rounded-xl bg-muted/40 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-testid={`audit-row-${l.id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.action}</p>
                      {l.detail && <p className="truncate text-xs text-muted-foreground">{l.detail}</p>}
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {l.user_email} · {new Date(l.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar usuário à equipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nome</Label>
              <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="team-form-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">E-mail</Label>
              <Input id="t-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="team-form-email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-pass">Senha inicial</Label>
              <Input id="t-pass" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="team-form-password" />
              <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres. Ele poderá alterá-la depois.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Permissão</Label>
              <Select value={form.role} onValueChange={(v: string) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger data-testid="team-form-role"><SelectValue>{(v) => ROLES[v as Role]}</SelectValue></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLES) as Role[]).filter((r) => r !== "OWNER" || me?.user.role === "OWNER").map((r) => (
                    <SelectItem key={r} value={r}>{ROLES[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="team-form-cancel">Cancelar</Button>
            <Button
              onClick={() => {
                if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
                  toast.error("Preencha nome, e-mail e uma senha de 8+ caracteres.");
                  return;
                }
                invite.mutate();
              }}
              disabled={invite.isPending}
              className="gap-2"
              data-testid="team-form-save"
            >
              {invite.isPending && <Loader2 className="size-4 animate-spin" />}
              Adicionar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
