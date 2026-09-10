import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Save, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { SectionTitle, Skeleton, StatusDot } from "@/components/Brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDashboard, useInvalidate, useMe } from "@/hooks/useApp";
import { apiGet, apiPut } from "@/lib/api";
import type { AgentConfig, Company } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "empresa", label: "Minha empresa" },
  { key: "personalidade", label: "Personalidade" },
  { key: "produtos", label: "Produtos e serviços" },
  { key: "conhecimento", label: "Conhecimento" },
  { key: "atendimento", label: "Atendimento" },
  { key: "vendas", label: "Vendas" },
  { key: "recuperacao", label: "Recuperação" },
  { key: "agendamento", label: "Agendamento" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "integracoes", label: "Integrações" },
  { key: "teste", label: "Teste" },
];

const PERSONALITIES = { consultiva: "Consultiva — orienta e explica", objetiva: "Objetiva — direto ao ponto", acolhedora: "Acolhedora — cuidado no atendimento", entusiasmada: "Entusiasmada — energia e simpatia" };
const TONES = { amigavel: "Amigável e acolhedor", profissional: "Profissional e direto", descontraido: "Descontraído e leve", empatico: "Empático e paciente" };
const FORMALITY = { informal: "Informal (você)", formal: "Formal (senhor/senhora)" };
const LENGTHS = { curto: "Curtas e diretas", medio: "Tamanho médio", longo: "Mais detalhadas" };
const GOALS = { atender_e_vender: "Atender dúvidas e vender", atender: "Somente atender e informar", agendar: "Agendar atendimentos", recuperar: "Recuperar clientes inativos" };

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3.5 transition-colors duration-150 hover:bg-muted/40">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-emerald-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export default function Config() {
  const invalidate = useInvalidate();
  const { data: me } = useMe();
  const { data: dashboard } = useDashboard();
  const [tab, setTab] = useState("empresa");

  const canEdit = me?.user.role === "OWNER" || me?.user.role === "ADMIN";

  const { data: company, isLoading: loadingCompany } = useQuery<Company>({
    queryKey: ["company"],
    queryFn: () => apiGet<Company>("/company"),
    retry: false,
  });
  const { data: config, isLoading: loadingConfig } = useQuery<AgentConfig>({
    queryKey: ["agent-config"],
    queryFn: () => apiGet<AgentConfig>("/agent-config"),
    retry: false,
  });

  const [companyForm, setCompanyForm] = useState<Partial<Company>>({});
  const [configForm, setConfigForm] = useState<Partial<AgentConfig>>({});

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name,
        segment: company.segment,
        description: company.description,
        phone: company.phone,
        address: company.address,
        business_hours: company.business_hours,
        payment_methods: company.payment_methods,
      });
    }
  }, [company]);

  useEffect(() => {
    if (config) setConfigForm(config);
  }, [config]);

  const saveCompany = useMutation({
    mutationFn: () => apiPut<Company>("/company", companyForm),
    onSuccess: () => {
      toast.success("Informações da empresa salvas");
      invalidate("company", "dashboard", "me");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const saveConfig = useMutation({
    mutationFn: (patch: Partial<AgentConfig>) => apiPut<AgentConfig>("/agent-config", patch),
    onSuccess: () => {
      toast.success("Configuração da IA salva");
      invalidate("agent-config", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const checklist = dashboard?.checklist ?? {};
  const busy = saveCompany.isPending || saveConfig.isPending;

  function setC<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setConfigForm((prev) => ({ ...prev, [key]: value }));
  }

  function saveAgentFields(keys: (keyof AgentConfig)[]) {
    const patch: Record<string, unknown> = {};
    keys.forEach((k) => {
      if (configForm[k] !== undefined) patch[k] = configForm[k];
    });
    saveConfig.mutate(patch as Partial<AgentConfig>);
  }

  if (loadingCompany || loadingConfig) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <SectionTitle
        overline="Configuração"
        title="Configurar minha IA"
        description="Tudo aqui vale somente para a sua empresa. Outras empresas na plataforma têm as suas próprias configurações."
      />

      {!canEdit && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="config-readonly-warning">
          Seu perfil ({me?.user.role}) permite visualizar as configurações, mas não alterá-las. Fale
          com o proprietário da conta.
        </p>
      )}

      {/* tabs */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {TABS.map((t) => {
          const state = checklist[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
                tab === t.key ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
              data-testid={`config-tab-${t.key}`}
            >
              {state === true && <Check className="size-3.5 text-emerald-500" />}
              {state === false && <span className="size-1.5 rounded-full bg-amber-500" />}
              {t.label}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-5 p-6 sm:p-7">
          {tab === "empresa" && (
            <>
              <div className="space-y-1.5">
                <h3 className="font-heading text-lg font-semibold">Minha empresa</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Esses dados são a base de tudo que a IA responde sobre endereço, horários e
                  pagamento.
                </p>
              </div>
              <FieldRow>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-name">Nome da empresa</Label>
                  <Input id="cf-name" disabled={!canEdit} value={companyForm.name ?? ""} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} data-testid="config-company-name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-segment">Segmento</Label>
                  <Input id="cf-segment" disabled={!canEdit} value={companyForm.segment ?? ""} onChange={(e) => setCompanyForm({ ...companyForm, segment: e.target.value })} data-testid="config-company-segment" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cf-desc">O que seu negócio faz?</Label>
                  <Textarea id="cf-desc" rows={3} disabled={!canEdit} value={companyForm.description ?? ""} onChange={(e) => setCompanyForm({ ...companyForm, description: e.target.value })} data-testid="config-company-description" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-phone">Telefone / WhatsApp</Label>
                  <Input id="cf-phone" disabled={!canEdit} value={companyForm.phone ?? ""} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} data-testid="config-company-phone" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-hours">Horário de funcionamento</Label>
                  <Input id="cf-hours" disabled={!canEdit} value={companyForm.business_hours ?? ""} onChange={(e) => setCompanyForm({ ...companyForm, business_hours: e.target.value })} data-testid="config-company-hours" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-address">Endereço</Label>
                  <Input id="cf-address" disabled={!canEdit} value={companyForm.address ?? ""} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} data-testid="config-company-address" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-pay">Formas de pagamento</Label>
                  <Input id="cf-pay" disabled={!canEdit} value={companyForm.payment_methods ?? ""} onChange={(e) => setCompanyForm({ ...companyForm, payment_methods: e.target.value })} data-testid="config-company-payment" />
                </div>
              </FieldRow>
              <Button onClick={() => saveCompany.mutate()} disabled={!canEdit || busy} className="gap-2" data-testid="config-save-company">
                {saveCompany.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar informações
              </Button>
            </>
          )}

          {tab === "personalidade" && (
            <>
              <div className="space-y-1.5">
                <h3 className="font-heading text-lg font-semibold">Personalidade da IA</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Como sua IA se apresenta e conversa com os clientes.
                </p>
              </div>
              <FieldRow>
                <div className="space-y-1.5">
                  <Label htmlFor="cf-ainame">Nome da IA</Label>
                  <Input id="cf-ainame" disabled={!canEdit} value={configForm.ai_name ?? ""} onChange={(e) => setC("ai_name", e.target.value)} data-testid="config-ai-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Personalidade</Label>
                  <Select value={configForm.personality ?? "consultiva"} onValueChange={(v: string) => setC("personality", v)} disabled={!canEdit}>
                    <SelectTrigger data-testid="config-personality"><SelectValue>{(v) => PERSONALITIES[v as keyof typeof PERSONALITIES] ?? String(v)}</SelectValue></SelectTrigger>
                    <SelectContent>{Object.entries(PERSONALITIES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tom de voz</Label>
                  <Select value={configForm.tone ?? "amigavel"} onValueChange={(v: string) => setC("tone", v)} disabled={!canEdit}>
                    <SelectTrigger data-testid="config-tone"><SelectValue>{(v) => TONES[v as keyof typeof TONES] ?? String(v)}</SelectValue></SelectTrigger>
                    <SelectContent>{Object.entries(TONES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nível de formalidade</Label>
                  <Select value={configForm.formality ?? "informal"} onValueChange={(v: string) => setC("formality", v)} disabled={!canEdit}>
                    <SelectTrigger data-testid="config-formality"><SelectValue>{(v) => FORMALITY[v as keyof typeof FORMALITY] ?? String(v)}</SelectValue></SelectTrigger>
                    <SelectContent>{Object.entries(FORMALITY).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tamanho das respostas</Label>
                  <Select value={configForm.response_length ?? "medio"} onValueChange={(v: string) => setC("response_length", v)} disabled={!canEdit}>
                    <SelectTrigger data-testid="config-length"><SelectValue>{(v) => LENGTHS[v as keyof typeof LENGTHS] ?? String(v)}</SelectValue></SelectTrigger>
                    <SelectContent>{Object.entries(LENGTHS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cf-greeting">Saudação</Label>
                  <Input id="cf-greeting" disabled={!canEdit} value={configForm.greeting ?? ""} onChange={(e) => setC("greeting", e.target.value)} data-testid="config-greeting" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cf-closing">Encerramento</Label>
                  <Input id="cf-closing" disabled={!canEdit} value={configForm.closing ?? ""} onChange={(e) => setC("closing", e.target.value)} data-testid="config-closing" />
                </div>
              </FieldRow>
              <Toggle
                label="Usar emojis nas respostas"
                description="Deixa a conversa mais leve. Em segmentos formais, desligue."
                checked={configForm.use_emojis ?? true}
                onChange={(v) => setC("use_emojis", v)}
                testId="config-use-emojis"
              />
              <Button onClick={() => saveAgentFields(["ai_name", "personality", "tone", "formality", "response_length", "greeting", "closing", "use_emojis"])} disabled={!canEdit || busy} className="gap-2" data-testid="config-save-personality">
                {saveConfig.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar personalidade
              </Button>
            </>
          )}

          {tab === "produtos" && (
            <div className="space-y-4">
              <h3 className="font-heading text-lg font-semibold">Produtos e serviços</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                O catálogo é o único lugar de onde a IA tira nomes, descrições e preços. Sem ele, ela
                responde que precisa confirmar com a equipe.
              </p>
              <div className="flex items-center gap-3">
                <StatusDot status={checklist.produtos ? "ok" : "not_configured"} label={checklist.produtos ? "Catálogo cadastrado" : "Nenhum item ativo"} />
              </div>
              <Link to="/app/catalogo" className={buttonVariants({ variant: "outline" })} data-testid="config-goto-catalog">
                Abrir catálogo
              </Link>
            </div>
          )}

          {tab === "conhecimento" && (
            <div className="space-y-4">
              <h3 className="font-heading text-lg font-semibold">Conhecimento</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Políticas, horários, perguntas frequentes e qualquer informação que você queira que a
                IA saiba responder.
              </p>
              <StatusDot status={checklist.conhecimento ? "ok" : "not_configured"} label={checklist.conhecimento ? "Informações cadastradas" : "Nada ensinado ainda"} />
              <Link to="/app/conhecimento" className={buttonVariants({ variant: "outline" })} data-testid="config-goto-knowledge">
                Abrir "Ensine sua IA"
              </Link>
            </div>
          )}

          {tab === "atendimento" && (
            <>
              <div className="space-y-1.5">
                <h3 className="font-heading text-lg font-semibold">Regras de atendimento</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Escreva em português normal o que a IA deve e não deve fazer. É o campo mais
                  importante da configuração.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-custom">Como a IA deve atender seus clientes?</Label>
                <Textarea id="cf-custom" rows={5} disabled={!canEdit} value={configForm.custom_instructions ?? ""} onChange={(e) => setC("custom_instructions", e.target.value)} placeholder="Ex.: Sempre perguntar o nome do cliente. Nunca dar orientação médica. Se pedirem urgência, avisar que retornamos em até 1 hora." data-testid="config-custom-instructions" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-service">Regras específicas de atendimento</Label>
                <Textarea id="cf-service" rows={4} disabled={!canEdit} value={configForm.service_rules ?? ""} onChange={(e) => setC("service_rules", e.target.value)} data-testid="config-service-rules" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-handoff">Quando transferir para um atendente humano?</Label>
                <Textarea id="cf-handoff" rows={3} disabled={!canEdit} value={configForm.handoff_rules ?? ""} onChange={(e) => setC("handoff_rules", e.target.value)} data-testid="config-handoff-rules" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-outhours">Mensagem fora do horário</Label>
                <Textarea id="cf-outhours" rows={2} disabled={!canEdit} value={configForm.out_of_hours_message ?? ""} onChange={(e) => setC("out_of_hours_message", e.target.value)} data-testid="config-out-of-hours" />
              </div>
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-900">
                A IA já é instruída a nunca inventar preços, estoque, horários, políticas ou condições
                comerciais. Quando não souber, ela avisa que vai confirmar.
              </p>
              <Button onClick={() => saveAgentFields(["custom_instructions", "service_rules", "handoff_rules", "out_of_hours_message"])} disabled={!canEdit || busy} className="gap-2" data-testid="config-save-service">
                {saveConfig.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar regras de atendimento
              </Button>
            </>
          )}

          {tab === "vendas" && (
            <>
              <div className="space-y-1.5">
                <h3 className="font-heading text-lg font-semibold">Vendas</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Como a IA deve conduzir uma conversa comercial — sem pressionar o cliente.
                </p>
              </div>
              <Toggle
                label="Deixar a IA apresentar produtos e conduzir vendas"
                description="Ela identifica a necessidade, recomenda itens do catálogo, responde objeções e conduz para a compra."
                checked={configForm.enable_sales ?? true}
                onChange={(v) => setC("enable_sales", v)}
                testId="config-enable-sales"
              />
              <div className="space-y-1.5">
                <Label htmlFor="cf-sales">Regras de vendas</Label>
                <Textarea id="cf-sales" rows={4} disabled={!canEdit} value={configForm.sales_rules ?? ""} onChange={(e) => setC("sales_rules", e.target.value)} placeholder="Ex.: Apresentar no máximo 2 opções por vez. Sempre explicar o que está incluso." data-testid="config-sales-rules" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-discount">Política de preços e descontos</Label>
                <Textarea id="cf-discount" rows={3} disabled={!canEdit} value={configForm.discount_policy ?? ""} onChange={(e) => setC("discount_policy", e.target.value)} placeholder="Ex.: Descontos somente nos itens marcados como promocionais no catálogo." data-testid="config-discount-policy" />
              </div>
              <div className="space-y-1.5">
                <Label>Objetivo principal da IA</Label>
                <Select value={configForm.goal ?? "atender_e_vender"} onValueChange={(v: string) => setC("goal", v)} disabled={!canEdit}>
                  <SelectTrigger data-testid="config-goal"><SelectValue>{(v) => GOALS[v as keyof typeof GOALS] ?? String(v)}</SelectValue></SelectTrigger>
                  <SelectContent>{Object.entries(GOALS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={() => saveAgentFields(["enable_sales", "sales_rules", "discount_policy", "goal"])} disabled={!canEdit || busy} className="gap-2" data-testid="config-save-sales">
                {saveConfig.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar configuração de vendas
              </Button>
            </>
          )}

          {tab === "recuperacao" && (
            <div className="space-y-4">
              <h3 className="font-heading text-lg font-semibold">Recuperação de clientes</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Identifique quem parou de interagir, gere uma mensagem personalizada e aprove antes
                de enviar.
              </p>
              <Toggle
                label="Ativar recuperação de clientes"
                description="Habilita a tela de clientes inativos e a geração de mensagens de reativação."
                checked={configForm.enable_recovery ?? true}
                onChange={(v) => setC("enable_recovery", v)}
                testId="config-enable-recovery"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveAgentFields(["enable_recovery"])} disabled={!canEdit || busy} className="gap-2" data-testid="config-save-recovery">
                  {saveConfig.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Salvar
                </Button>
                <Link to="/app/recuperacao" className={buttonVariants({ variant: "outline" })} data-testid="config-goto-recovery">
                  Abrir recuperação e regras de envio
                </Link>
              </div>
            </div>
          )}

          {tab === "agendamento" && (
            <div className="space-y-4">
              <h3 className="font-heading text-lg font-semibold">Agendamento</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Com isso ativo, a IA coleta serviço, dia e horário de preferência e registra para a
                equipe confirmar.
              </p>
              <Toggle
                label="Deixar a IA ajudar a agendar"
                description="A IA não confirma horário sozinha: ela registra a preferência do cliente."
                checked={configForm.enable_scheduling ?? false}
                onChange={(v) => setC("enable_scheduling", v)}
                testId="config-enable-scheduling"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveAgentFields(["enable_scheduling"])} disabled={!canEdit || busy} className="gap-2" data-testid="config-save-scheduling">
                  {saveConfig.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Salvar
                </Button>
                <Link to="/app/agenda" className={buttonVariants({ variant: "outline" })} data-testid="config-goto-schedule">
                  Abrir agenda
                </Link>
              </div>
              <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                A integração com Google Calendar está prevista na arquitetura, mas não está
                disponível nesta versão.
              </p>
            </div>
          )}

          {tab === "whatsapp" && (
            <div className="space-y-4">
              <h3 className="font-heading text-lg font-semibold">WhatsApp</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Conecte o número que atende seus clientes usando a API oficial do WhatsApp Business.
              </p>
              <StatusDot status={checklist.whatsapp ? "ok" : "not_configured"} label={checklist.whatsapp ? "WhatsApp conectado" : "Não conectado"} />
              <Link to="/app/whatsapp" className={buttonVariants({ variant: "outline" })} data-testid="config-goto-whatsapp">
                Abrir "Conectar WhatsApp"
              </Link>
            </div>
          )}

          {tab === "integracoes" && (
            <div className="space-y-4">
              <h3 className="font-heading text-lg font-semibold">Integrações</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Serviços que a plataforma pode usar. As chaves ficam sempre no servidor, nunca no seu
                navegador.
              </p>
              <div className="space-y-2.5">
                {[
                  { label: "Serviço de IA", status: "Configurado pelo administrador da plataforma" },
                  { label: "WhatsApp Business (API oficial)", status: checklist.whatsapp ? "Conectado nesta empresa" : "Disponível para conectar" },
                  { label: "Conexão automática (recebimento de mensagens)", status: "Ativa quando o WhatsApp oficial está conectado" },
                  { label: "Envio de e-mails", status: "Depende de configuração do administrador" },
                  { label: "Login com Google", status: "Previsto, ainda não disponível" },
                  { label: "Pagamentos", status: "Previsto, ainda não disponível" },
                  { label: "Google Calendar", status: "Previsto, ainda não disponível" },
                ].map((i) => (
                  <div key={i.label} className="flex flex-col gap-1 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-medium">{i.label}</span>
                    <span className="text-xs text-muted-foreground">{i.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "teste" && (
            <div className="space-y-4">
              <h3 className="font-heading text-lg font-semibold">Teste</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sempre que mudar alguma configuração, teste antes de deixar a IA atender clientes de
                verdade.
              </p>
              <StatusDot status={checklist.teste ? "ok" : "not_configured"} label={checklist.teste ? "IA já testada" : "Nunca testada"} />
              <Link to="/app/testar" className={buttonVariants({ className: "gap-2" })} data-testid="config-goto-sandbox">
                <Sparkles className="size-4" />
                Testar minha IA agora
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
