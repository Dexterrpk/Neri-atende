import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Cpu,
  HeartPulse,
  Loader2,
  Save,
  ScrollText,
  ShieldAlert,
  Trash2,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import { Logo, NeriCredit, SectionTitle, Skeleton, StatusDot } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage, useInvalidate, useMe } from "@/hooks/useApp";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type {
  AdminCompany,
  AdminOverview,
  AdminUser,
  AiProviderConfig,
  AuditEntry,
  ConnectionTest,
  HealthReport,
  Ok,
  Plan,
  PlatformSetting,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "visao", label: "Visão geral", icon: Zap },
  { key: "empresas", label: "Empresas", icon: Building2 },
  { key: "usuarios", label: "Usuários", icon: Users },
  { key: "ia", label: "Provedores de IA", icon: Cpu },
  { key: "chaves", label: "Configurações da plataforma", icon: ShieldAlert },
  { key: "saude", label: "Saúde da plataforma", icon: HeartPulse },
  { key: "logs", label: "Logs e auditoria", icon: ScrollText },
];

const PLANS: Plan[] = ["FREE", "BASIC", "PRO", "PREMIUM"];
const PROVIDERS = {
  groq: "Groq (Llama, Mixtral)",
  gemini: "Google (Gemini)",
  openai: "OpenAI (GPT)",
  anthropic: "Anthropic (Claude)",
  openrouter: "OpenRouter",
};

const PROVIDER_ORDER = ["groq", "gemini", "openai", "anthropic"] as const;

const PROVIDER_HELP: Record<string, { url: string; label: string }> = {
  groq: { url: "https://console.groq.com/keys", label: "Console Groq" },
  gemini: { url: "https://aistudio.google.com/app/apikey", label: "Google AI Studio" },
  openai: { url: "https://platform.openai.com/api-keys", label: "OpenAI Platform" },
  anthropic: { url: "https://console.anthropic.com/settings/keys", label: "Anthropic Console" },
  openrouter: { url: "https://openrouter.ai/keys", label: "OpenRouter" },
};

interface AiCredential {
  id: string;
  provider: string;
  name: string;
  active: boolean;
  priority: number;
  model: string;
  key_hint: string;
  last_ok_at: string | null;
  last_error: string;
  created_at: string;
}
interface AiTestResult { ok: boolean; message: string; model: string }

export default function Admin() {
  const { data: me, isLoading } = useMe();
  const invalidate = useInvalidate();
  const [tab, setTab] = useState("visao");
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [aiForm, setAiForm] = useState<Partial<AiProviderConfig>>({});
  const [testResult, setTestResult] = useState<ConnectionTest | null>(null);

  const isAdmin = Boolean(me?.user.is_platform_admin);

  const { data: overview } = useQuery<AdminOverview>({ queryKey: ["admin-overview"], queryFn: () => apiGet<AdminOverview>("/admin/overview"), retry: false, enabled: isAdmin });
  const { data: companies } = useQuery<AdminCompany[]>({ queryKey: ["admin-companies"], queryFn: () => apiGet<AdminCompany[]>("/admin/companies"), retry: false, enabled: isAdmin && tab === "empresas" });
  const { data: users } = useQuery<AdminUser[]>({ queryKey: ["admin-users"], queryFn: () => apiGet<AdminUser[]>("/admin/users"), retry: false, enabled: isAdmin && tab === "usuarios" });
  const { data: settings } = useQuery<PlatformSetting[]>({ queryKey: ["admin-settings"], queryFn: () => apiGet<PlatformSetting[]>("/admin/settings"), retry: false, enabled: isAdmin && tab === "chaves" });
  const { data: health } = useQuery<HealthReport>({ queryKey: ["admin-health"], queryFn: () => apiGet<HealthReport>("/admin/health"), retry: false, enabled: isAdmin && tab === "saude" });
  const { data: logs } = useQuery<AuditEntry[]>({ queryKey: ["admin-logs"], queryFn: () => apiGet<AuditEntry[]>("/admin/audit-logs"), retry: false, enabled: isAdmin && tab === "logs" });
  const { data: aiConfig } = useQuery<AiProviderConfig>({ queryKey: ["admin-ai"], queryFn: () => apiGet<AiProviderConfig>("/admin/ai-provider"), retry: false, enabled: isAdmin && tab === "ia" });

  useEffect(() => {
    if (aiConfig) setAiForm(aiConfig);
  }, [aiConfig]);

  const updateCompany = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => apiPatch<AdminCompany>(`/admin/companies/${id}`, patch),
    onSuccess: () => {
      toast.success("Empresa atualizada");
      invalidate("admin-companies", "admin-overview");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const saveSecret = useMutation({
    mutationFn: (key: string) => apiPut<PlatformSetting>("/admin/settings", { key, value: secretDrafts[key] }),
    onSuccess: (_data, key) => {
      toast.success("Chave salva com segurança. Reinicie os processos para aplicar em todos os workers.");
      setSecretDrafts((prev) => ({ ...prev, [key]: "" }));
      invalidate("admin-settings", "admin-health", "admin-ai");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const removeSecret = useMutation({
    mutationFn: (key: string) => apiDelete<Ok>(`/admin/settings/${key}`),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate("admin-settings", "admin-health", "admin-ai");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const saveAi = useMutation({
    mutationFn: () =>
      apiPut<AiProviderConfig>("/admin/ai-provider", {
        default_provider: aiForm.default_provider,
        default_model: aiForm.default_model,
        fast_model: aiForm.fast_model,
        complex_model: aiForm.complex_model,
        max_tokens: Number(aiForm.max_tokens),
        temperature: Number(aiForm.temperature),
        monthly_call_limit: Number(aiForm.monthly_call_limit),
        fallback_provider: aiForm.fallback_provider ?? "",
        fallback_model: aiForm.fallback_model ?? "",
      }),
    onSuccess: () => {
      toast.success("Configuração dos provedores salva");
      invalidate("admin-ai", "admin-health");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  void saveAi;

  const testAi = useMutation({
    mutationFn: () => apiPost<ConnectionTest>("/admin/ai-provider/test"),
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok) toast.success(data.message);
      else toast.error(data.message);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  // ---- Central de IA (simple flow: provider → paste key → test → auto model) ----
  const [pickedProvider, setPickedProvider] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [connectResult, setConnectResult] = useState<AiTestResult | null>(null);
  const { data: credentials } = useQuery<AiCredential[]>({
    queryKey: ["admin-ai-credentials"],
    queryFn: () => apiGet<AiCredential[]>("/admin/ai/credentials"),
    retry: false,
    enabled: isAdmin && tab === "ia",
  });

  const connectCredential = useMutation({
    mutationFn: async () => {
      if (!pickedProvider) throw new Error("Selecione um provedor");
      if (!apiKeyDraft || apiKeyDraft.length < 8) throw new Error("Informe uma API Key válida");
      const test = await apiPost<AiTestResult>("/admin/ai/credentials/test", {
        provider: pickedProvider, api_key: apiKeyDraft,
      });
      if (!test.ok) {
        const err = new Error(test.message || "Falha ao conectar");
        throw err;
      }
      // Persist ONLY on success. Backend auto-detects a default model.
      await apiPut("/admin/ai/credentials", {
        provider: pickedProvider,
        name: `${pickedProvider} principal`,
        api_key: apiKeyDraft,
        model: test.model,
        active: true,
        priority: 10,
      });
      return test;
    },
    onSuccess: (test) => {
      setConnectResult(test);
      setApiKeyDraft("");
      setPickedProvider(null);
      toast.success(`Conectado. Modelo: ${test.model}`);
      invalidate("admin-ai-credentials", "admin-health", "admin-ai");
    },
    onError: (err) => {
      setConnectResult({ ok: false, message: apiErrorMessage(err), model: "" });
      toast.error(apiErrorMessage(err));
    },
  });

  const removeCredential = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/admin/ai/credentials/${id}`),
    onSuccess: () => {
      toast.success("Credencial removida");
      invalidate("admin-ai-credentials", "admin-health", "admin-ai");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const retestCredential = useMutation({
    mutationFn: (id: string) => apiPost<AiTestResult>(`/admin/ai/credentials/${id}/test`),
    onSuccess: (r, id) => {
      if (r.ok) toast.success(`OK — modelo ${r.model}`);
      else toast.error(r.message);
      invalidate("admin-ai-credentials");
      void id;
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center" data-testid="admin-loading">
        <Logo />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="grid min-h-dvh place-items-center px-5">
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-7 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
              <ShieldAlert className="size-6" />
            </span>
            <h1 className="font-heading text-xl font-bold">Área restrita</h1>
            <p className="text-sm leading-relaxed text-muted-foreground" data-testid="admin-denied-message">
              Este painel é exclusivo do administrador da plataforma. Seu acesso está limitado ao
              painel da sua empresa.
            </p>
            <Link to="/app" className={buttonVariants({ variant: "outline" }) + " gap-2"} data-testid="admin-back-app">
              <ArrowLeft className="size-4" />
              Voltar ao meu painel
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const groups = Array.from(new Set((settings ?? []).map((s) => s.group)));

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-sidebar px-5 py-4 text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge variant="secondary">Painel da plataforma</Badge>
          </div>
          <Link to="/app" className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-2 bg-transparent text-sidebar-foreground"} data-testid="admin-goto-app">
            <ArrowLeft className="size-4" />
            Meu painel
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-7 px-5 py-8">
        <SectionTitle
          overline="Administração"
          title="Controle da plataforma"
          description="Empresas, usuários, provedores de IA, chaves, saúde e auditoria — tudo verificado no servidor."
        />

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
                tab === t.key ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
              data-testid={`admin-tab-${t.key}`}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "visao" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Empresas", overview?.companies, "admin-metric-companies"],
              ["Usuários", overview?.users, "admin-metric-users"],
              ["Conversas", overview?.conversations, "admin-metric-conversations"],
              ["Mensagens", overview?.messages, "admin-metric-messages"],
              ["Chamadas de IA", overview?.ai_calls, "admin-metric-ai-calls"],
            ].map(([label, value, testId]) => (
              <Card key={String(label)}>
                <CardContent className="space-y-1.5 p-5">
                  <p className="font-heading text-3xl font-extrabold" data-testid={String(testId)}>
                    {value ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">{String(label)}</p>
                </CardContent>
              </Card>
            ))}
            {overview && (
              <Card className="sm:col-span-2 lg:col-span-1">
                <CardContent className="space-y-2 p-5">
                  <p className="font-heading text-sm font-semibold">Empresas por plano</p>
                  {Object.entries(overview.plans).map(([plan, n]) => (
                    <div key={plan} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{plan}</span>
                      <span className="font-medium">{n}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === "empresas" && (
          <div className="space-y-3">
            {!companies ? (
              <Skeleton className="h-40 w-full" />
            ) : companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
            ) : (
              companies.map((c) => (
                <Card key={c.id} data-testid={`admin-company-${c.id}`}>
                  <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading font-semibold">{c.name}</p>
                        <Badge variant={c.active ? "default" : "destructive"}>{c.active ? "Ativa" : "Suspensa"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.users} usuário(s) · {c.conversations} conversa(s) · {c.ai_calls} chamada(s) de IA ·
                        criada em {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={c.plan} onValueChange={(v: string) => updateCompany.mutate({ id: c.id, patch: { plan: v } })}>
                        <SelectTrigger size="sm" className="w-[140px]" data-testid={`admin-company-plan-${c.id}`}>
                          <SelectValue>{(v) => String(v)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PLANS.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant={c.active ? "ghost" : "outline"}
                        size="sm"
                        onClick={() => updateCompany.mutate({ id: c.id, patch: { active: !c.active } })}
                        className={c.active ? "text-destructive hover:text-destructive" : ""}
                        data-testid={`admin-company-toggle-${c.id}`}
                      >
                        {c.active ? "Suspender" : "Reativar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Suspender uma empresa encerra as sessões dela imediatamente. Nenhum dado é apagado.
            </p>
          </div>
        )}

        {tab === "usuarios" && (
          <Card>
            <CardContent className="space-y-2.5 p-5">
              {!users ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                users.map((u) => (
                  <div key={u.id} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`admin-user-${u.id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {u.name}
                        {u.is_platform_admin && <Badge className="ml-2">Admin plataforma</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email} · {u.company}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{u.role}</Badge>
                      <Badge variant={u.active ? "outline" : "destructive"}>{u.active ? "Ativo" : "Inativo"}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {tab === "ia" && (
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="font-heading text-lg font-semibold">Central de IA</h3>
                  <p className="text-sm text-muted-foreground">
                    Escolha um provedor, cole a API Key e clique em <strong>Testar e conectar</strong>. O sistema seleciona um modelo padrão automaticamente.
                  </p>
                </div>
                <StatusDot
                  status={(credentials ?? []).some((c) => c.active) ? "ok" : "not_configured"}
                  label={(credentials ?? []).some((c) => c.active) ? "IA conectada" : "Nenhum provedor conectado"}
                  testId="admin-ai-key-status"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {PROVIDER_ORDER.map((prov) => {
                  const cred = (credentials ?? []).find((c) => c.provider === prov && c.active);
                  const isPicking = pickedProvider === prov;
                  return (
                    <div
                      key={prov}
                      data-testid={`admin-ai-card-${prov}`}
                      className={cn(
                        "space-y-3 rounded-2xl border p-5 transition",
                        cred ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-card",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-heading text-base font-semibold">{PROVIDERS[prov]}</p>
                          <p className="text-xs text-muted-foreground">
                            {cred ? (
                              <>Modelo: <span className="font-mono">{cred.model}</span> · Chave: <span className="font-mono">{cred.key_hint}</span></>
                            ) : (
                              <>Obtenha em <a className="underline" href={PROVIDER_HELP[prov].url} target="_blank" rel="noreferrer">{PROVIDER_HELP[prov].label}</a></>
                            )}
                          </p>
                        </div>
                        <StatusDot
                          status={cred ? "ok" : "not_configured"}
                          label={cred ? "Conectado" : "Não configurado"}
                          testId={`admin-ai-status-${prov}`}
                        />
                      </div>

                      {isPicking ? (
                        <div className="space-y-2">
                          <Label htmlFor={`ai-key-${prov}`}>API Key</Label>
                          <Input
                            id={`ai-key-${prov}`}
                            data-testid={`admin-ai-key-input-${prov}`}
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="cole a sua API Key aqui"
                            value={apiKeyDraft}
                            onChange={(e) => setApiKeyDraft(e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => connectCredential.mutate()}
                              disabled={connectCredential.isPending || apiKeyDraft.length < 8}
                              className="gap-2"
                              data-testid={`admin-ai-test-connect-${prov}`}
                            >
                              {connectCredential.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                              Testar e conectar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => { setPickedProvider(null); setApiKeyDraft(""); setConnectResult(null); }}
                              data-testid={`admin-ai-cancel-${prov}`}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {cred ? (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => retestCredential.mutate(cred.id)}
                                disabled={retestCredential.isPending}
                                className="gap-2"
                                data-testid={`admin-ai-retest-${prov}`}
                              >
                                {retestCredential.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                                Testar novamente
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => { setPickedProvider(prov); setApiKeyDraft(""); setConnectResult(null); }}
                                data-testid={`admin-ai-change-${prov}`}
                              >
                                Trocar chave
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => removeCredential.mutate(cred.id)}
                                disabled={removeCredential.isPending}
                                className="gap-2 text-red-600"
                                data-testid={`admin-ai-remove-${prov}`}
                              >
                                <Trash2 className="size-4" /> Desconectar
                              </Button>
                            </>
                          ) : (
                            <Button
                              onClick={() => { setPickedProvider(prov); setApiKeyDraft(""); setConnectResult(null); }}
                              className="gap-2"
                              data-testid={`admin-ai-connect-${prov}`}
                            >
                              <Zap className="size-4" /> Conectar
                            </Button>
                          )}
                        </div>
                      )}

                      {cred?.last_error && (
                        <p className="text-xs text-red-700" data-testid={`admin-ai-lasterror-${prov}`}>
                          Último erro: {cred.last_error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {connectResult && !connectResult.ok && (
                <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" data-testid="admin-ai-connect-error">
                  <p className="flex items-center gap-2 font-semibold">
                    <XCircle className="size-4" /> Não foi possível conectar
                  </p>
                  <p className="text-red-800">{connectResult.message}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => testAi.mutate()} disabled={testAi.isPending} className="gap-2" data-testid="admin-ai-test">
                  {testAi.isPending && <Loader2 className="size-4 animate-spin" />}
                  Testar provedor ativo
                </Button>
              </div>

              {testResult && (
                <div className={cn("space-y-2 rounded-xl border px-4 py-3.5", testResult.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")} data-testid="admin-ai-test-result">
                  {testResult.checks.map((c) => (
                    <p key={c.label} className="flex items-center gap-2 text-sm">
                      {c.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}
                      {c.label}
                    </p>
                  ))}
                  <p className={cn("pt-1 text-sm font-semibold", testResult.ok ? "text-emerald-900" : "text-red-900")}>
                    {testResult.message}
                  </p>
                </div>
              )}

              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                Todas as chaves são criptografadas com <code>APP_SECRET</code> e nunca são exibidas nem retornadas ao navegador. Você vê apenas a máscara <code>••••••••XXXX</code>.
              </p>
            </CardContent>
          </Card>
        )}

        {tab === "chaves" && (
          <div className="space-y-5">
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-relaxed text-amber-900">
              As chaves são criptografadas com a chave-mestra do ambiente e <strong>nunca</strong> são
              devolvidas ao navegador. A plataforma mostra apenas se estão configuradas. Após salvar
              ou remover uma chave, reinicie os processos do backend para que todos os workers usem o
              novo valor.
            </p>
            {!settings ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              groups.map((group) => (
                <Card key={group}>
                  <CardContent className="space-y-4 p-6">
                    <h3 className="font-heading text-lg font-semibold">{group}</h3>
                    {settings.filter((s) => s.group === group).map((s) => (
                      <div key={s.key} className="space-y-2 rounded-xl border border-border p-4" data-testid={`admin-setting-${s.key}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{s.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{s.hint}</p>
                          </div>
                          {s.configured ? (
                            <Badge className="gap-1" data-testid={`admin-setting-status-${s.key}`}>
                              <CheckCircle2 className="size-3" />
                              Configurada
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1" data-testid={`admin-setting-status-${s.key}`}>
                              Não configurada
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type="password"
                            value={secretDrafts[s.key] ?? ""}
                            onChange={(e) => setSecretDrafts({ ...secretDrafts, [s.key]: e.target.value })}
                            placeholder={s.configured ? "Informe um novo valor para substituir" : "Cole o valor aqui"}
                            data-testid={`admin-setting-input-${s.key}`}
                          />
                          <Button
                            onClick={() => {
                              if (!(secretDrafts[s.key] ?? "").trim()) {
                                toast.error("Informe um valor antes de salvar.");
                                return;
                              }
                              saveSecret.mutate(s.key);
                            }}
                            disabled={saveSecret.isPending}
                            size="sm"
                            className="shrink-0 gap-1.5"
                            data-testid={`admin-setting-save-${s.key}`}
                          >
                            <Save className="size-3.5" />
                            Salvar
                          </Button>
                          {s.configured && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeSecret.mutate(s.key)}
                              className="shrink-0 gap-1.5 text-destructive hover:text-destructive"
                              data-testid={`admin-setting-delete-${s.key}`}
                            >
                              <Trash2 className="size-3.5" />
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === "saude" && (
          <Card>
            <CardContent className="space-y-3 p-6">
              <h3 className="font-heading text-lg font-semibold">Saúde da plataforma</h3>
              {!health ? (
                <Skeleton className="h-60 w-full" />
              ) : (
                health.items.map((item) => (
                  <div key={item.key} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between" data-testid={`admin-health-${item.key}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <StatusDot status={item.status} testId={`admin-health-status-${item.key}`} />
                  </div>
                ))
              )}
              <Button variant="outline" size="sm" onClick={() => invalidate("admin-health")} className="w-fit" data-testid="admin-health-refresh">
                Verificar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {tab === "logs" && (
          <Card>
            <CardContent className="space-y-2.5 p-6">
              <h3 className="font-heading text-lg font-semibold">Logs e auditoria</h3>
              <p className="text-sm text-muted-foreground">
                Registro de todas as ações relevantes. Valores de chaves e senhas nunca são gravados.
              </p>
              {!logs ? (
                <Skeleton className="h-60 w-full" />
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((l) => (
                    <div key={l.id} className="flex flex-col gap-1 rounded-xl bg-muted/40 px-3.5 py-2.5 lg:flex-row lg:items-center lg:justify-between" data-testid={`admin-log-${l.id}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.action}</p>
                        {l.detail && <p className="truncate text-xs text-muted-foreground">{l.detail}</p>}
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {l.company_name || "—"} · {l.user_email || "—"} · {l.ip || "—"} ·{" "}
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <NeriCredit className="pt-2" />
      </main>
    </div>
  );
}
