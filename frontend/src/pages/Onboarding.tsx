import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, PartyPopper, Sparkles } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Logo, NeriCredit } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useInvalidate, useMe } from "@/hooks/useApp";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { AgentConfig, Company, KnowledgeItem, Product, SandboxReply, WhatsAppStatus } from "@/lib/types";

const SEGMENTS = [
  "Estética e beleza",
  "Saúde e bem-estar",
  "Comércio e varejo",
  "Alimentação",
  "Serviços e assistências",
  "Educação e cursos",
  "Imobiliário",
  "Outro",
];
const SEGMENT_LABELS: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s, s]));

const TONES = { amigavel: "Amigável e acolhedor", profissional: "Profissional e direto", descontraido: "Descontraído e leve", empatico: "Empático e paciente" };
const FORMALITY = { informal: "Informal (você)", formal: "Formal (senhor/senhora)" };
const LENGTHS = { curto: "Curtas e diretas", medio: "Tamanho médio", longo: "Mais detalhadas" };
const GOALS = {
  atender_e_vender: "Atender dúvidas e vender",
  atender: "Somente atender e informar",
  agendar: "Agendar atendimentos",
  recuperar: "Recuperar clientes inativos",
};

const STEP_TITLES = [
  "Informações da empresa",
  "Segmento do negócio",
  "Produtos e serviços",
  "Como a IA deve falar",
  "O que a IA deve fazer",
  "Ensine sua IA",
  "Conectar WhatsApp",
  "Teste da IA",
];

export default function Onboarding() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [step, setStep] = useState(0);

  const [company, setCompany] = useState({
    name: "",
    description: "",
    phone: "",
    address: "",
    business_hours: "",
    payment_methods: "",
    segment: "",
  });
  const [config, setConfig] = useState({
    ai_name: "Ana",
    tone: "amigavel",
    formality: "informal",
    response_length: "medio",
    use_emojis: true,
    greeting: "",
    goal: "atender_e_vender",
    enable_sales: true,
    enable_scheduling: false,
    enable_recovery: true,
    service_rules: "",
  });
  const [product, setProduct] = useState({ name: "", description: "", price: "", kind: "servico" });
  const [knowledge, setKnowledge] = useState({ title: "", content: "" });
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Olá! Vocês atendem hoje?");
  const [testReply, setTestReply] = useState<SandboxReply | null>(null);

  const { data: loadedCompany } = useQuery<Company>({
    queryKey: ["company"],
    queryFn: async () => {
      const doc = await apiGet<Company>("/company");
      setCompany((prev) => ({
        name: prev.name || doc.name,
        description: prev.description || doc.description,
        phone: prev.phone || doc.phone,
        address: prev.address || doc.address,
        business_hours: prev.business_hours || doc.business_hours,
        payment_methods: prev.payment_methods || doc.payment_methods,
        segment: prev.segment || doc.segment,
      }));
      return doc;
    },
    retry: false,
  });

  const saveCompany = useMutation({
    mutationFn: (patch: Partial<typeof company>) => apiPut<Company>("/company", patch),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const saveConfig = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiPut<AgentConfig>("/agent-config", patch),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const addProduct = useMutation({
    mutationFn: () =>
      apiPost<Product>("/products", {
        name: product.name,
        description: product.description,
        price: Number(product.price.replace(",", ".")) || 0,
        kind: product.kind,
      }),
    onSuccess: () => {
      toast.success("Item adicionado ao seu catálogo");
      setProduct({ name: "", description: "", price: "", kind: product.kind });
      invalidate("products");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const addKnowledge = useMutation({
    mutationFn: () => apiPost<KnowledgeItem>("/knowledge", { title: knowledge.title, content: knowledge.content, kind: "informacao" }),
    onSuccess: () => {
      toast.success("Informação registrada. Sua IA já sabe disso.");
      setKnowledge({ title: "", content: "" });
      invalidate("knowledge");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const connectWhatsapp = useMutation({
    mutationFn: () => apiPut<WhatsAppStatus>("/whatsapp/connect", { mode: "test", phone_number: whatsappPhone }),
    onSuccess: () => {
      toast.success("WhatsApp registrado em modo teste. Você pode ativar a API oficial depois.");
      invalidate("whatsapp-status");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const runTest = useMutation({
    mutationFn: () => apiPost<SandboxReply>("/sandbox/chat", { message: testMessage, history: [] }),
    onSuccess: (data) => setTestReply(data),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const finish = useMutation({
    mutationFn: () => apiPut<Company>("/company/onboarding", { step: 8, done: true }),
    onSuccess: () => {
      invalidate("me", "company", "dashboard");
      toast.success("Tudo pronto! Este é o seu painel.");
      navigate("/app", { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center" data-testid="onboarding-loading">
        <Logo />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (me.company.onboarding_done) return <Navigate to="/app" replace />;

  const progress = Math.round(((step + 1) / STEP_TITLES.length) * 100);

  async function next() {
    if (step === 0) {
      if (!company.name.trim() || !company.description.trim()) {
        toast.error("Preencha o nome e a descrição do seu negócio.");
        return;
      }
      await saveCompany.mutateAsync({
        name: company.name,
        description: company.description,
        phone: company.phone,
        address: company.address,
        business_hours: company.business_hours,
        payment_methods: company.payment_methods,
      });
    }
    if (step === 1) {
      if (!company.segment) {
        toast.error("Escolha o segmento do seu negócio.");
        return;
      }
      await saveCompany.mutateAsync({ segment: company.segment });
    }
    if (step === 3) {
      await saveConfig.mutateAsync({
        ai_name: config.ai_name,
        tone: config.tone,
        formality: config.formality,
        response_length: config.response_length,
        use_emojis: config.use_emojis,
        ...(config.greeting.trim() ? { greeting: config.greeting } : {}),
      });
    }
    if (step === 4) {
      await saveConfig.mutateAsync({
        goal: config.goal,
        enable_sales: config.enable_sales,
        enable_scheduling: config.enable_scheduling,
        enable_recovery: config.enable_recovery,
        ...(config.service_rules.trim() ? { service_rules: config.service_rules } : {}),
      });
    }
    if (step === STEP_TITLES.length - 1) {
      finish.mutate();
      return;
    }
    setStep((s) => s + 1);
  }

  const busy = saveCompany.isPending || saveConfig.isPending || finish.isPending;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Logo />
          <span className="text-sm font-semibold text-muted-foreground" data-testid="onboarding-step-counter">
            Passo {step + 1} de {STEP_TITLES.length}
          </span>
        </div>
        <div className="h-1.5 w-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
            data-testid="onboarding-progress-bar"
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-9">
        <div className="mb-7 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Configuração guiada</p>
          <h1 className="font-heading text-3xl font-bold" data-testid="onboarding-step-title">
            {STEP_TITLES[step]}
          </h1>
        </div>

        <Card className="animate-rise-in">
          <CardContent className="space-y-5 p-6 sm:p-8">
            {step === 0 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Sua IA só usa informações que você fornece. Comece contando o básico sobre a
                  empresa — isso evita que ela invente qualquer coisa.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ob-name">Nome da empresa</Label>
                    <Input id="ob-name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} data-testid="onboarding-company-name" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ob-desc">O que seu negócio faz?</Label>
                    <Textarea
                      id="ob-desc"
                      rows={3}
                      value={company.description}
                      onChange={(e) => setCompany({ ...company, description: e.target.value })}
                      placeholder="Ex.: Clínica de estética com tratamentos faciais, corporais e day spa."
                      data-testid="onboarding-company-description"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-phone">Telefone / WhatsApp</Label>
                    <Input id="ob-phone" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} placeholder="5511999990000" data-testid="onboarding-company-phone" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-hours">Horário de funcionamento</Label>
                    <Input id="ob-hours" value={company.business_hours} onChange={(e) => setCompany({ ...company, business_hours: e.target.value })} placeholder="Seg a sex, 9h às 18h" data-testid="onboarding-company-hours" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-address">Endereço (opcional)</Label>
                    <Input id="ob-address" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} data-testid="onboarding-company-address" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-pay">Formas de pagamento</Label>
                    <Input id="ob-pay" value={company.payment_methods} onChange={(e) => setCompany({ ...company, payment_methods: e.target.value })} placeholder="Pix, cartão, dinheiro" data-testid="onboarding-company-payment" />
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  O segmento ajuda a IA a entender o vocabulário do seu mercado e o tipo de dúvida
                  mais comum dos seus clientes.
                </p>
                <div className="space-y-1.5">
                  <Label>Segmento do negócio</Label>
                  <Select value={company.segment} onValueChange={(v: string) => setCompany({ ...company, segment: v })}>
                    <SelectTrigger data-testid="onboarding-segment-trigger">
                      <SelectValue placeholder="Escolha um segmento">{(v) => SEGMENT_LABELS[v as string]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map((s) => (
                        <SelectItem key={s} value={s} data-testid={`onboarding-segment-${s}`}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Cadastre pelo menos um item. A IA só pode falar de preços e produtos que estejam
                  aqui — é isso que impede respostas inventadas. Você pode adicionar mais depois.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-pname">Nome do item</Label>
                    <Input id="ob-pname" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Ex.: Limpeza de pele" data-testid="onboarding-product-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-pprice">Preço (R$)</Label>
                    <Input id="ob-pprice" inputMode="decimal" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} placeholder="180,00" data-testid="onboarding-product-price" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ob-pdesc">O que está incluso?</Label>
                    <Textarea id="ob-pdesc" rows={2} value={product.description} onChange={(e) => setProduct({ ...product, description: e.target.value })} data-testid="onboarding-product-description" />
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!product.name.trim()) {
                      toast.error("Informe o nome do item.");
                      return;
                    }
                    addProduct.mutate();
                  }}
                  disabled={addProduct.isPending}
                  className="gap-2"
                  data-testid="onboarding-product-add-button"
                >
                  {addProduct.isPending && <Loader2 className="size-4 animate-spin" />}
                  Adicionar ao catálogo
                </Button>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Defina o nome e o jeito de falar da sua IA. É assim que ela vai se apresentar aos
                  seus clientes.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-ainame">Nome da sua IA</Label>
                    <Input id="ob-ainame" value={config.ai_name} onChange={(e) => setConfig({ ...config, ai_name: e.target.value })} data-testid="onboarding-ai-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tom de voz</Label>
                    <Select value={config.tone} onValueChange={(v: string) => setConfig({ ...config, tone: v })}>
                      <SelectTrigger data-testid="onboarding-tone-trigger">
                        <SelectValue>{(v) => TONES[v as keyof typeof TONES]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TONES).map(([k, label]) => (
                          <SelectItem key={k} value={k}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nível de formalidade</Label>
                    <Select value={config.formality} onValueChange={(v: string) => setConfig({ ...config, formality: v })}>
                      <SelectTrigger data-testid="onboarding-formality-trigger">
                        <SelectValue>{(v) => FORMALITY[v as keyof typeof FORMALITY]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FORMALITY).map(([k, label]) => (
                          <SelectItem key={k} value={k}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tamanho das respostas</Label>
                    <Select value={config.response_length} onValueChange={(v: string) => setConfig({ ...config, response_length: v })}>
                      <SelectTrigger data-testid="onboarding-length-trigger">
                        <SelectValue>{(v) => LENGTHS[v as keyof typeof LENGTHS]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LENGTHS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ob-greet">Saudação (opcional)</Label>
                    <Input id="ob-greet" value={config.greeting} onChange={(e) => setConfig({ ...config, greeting: e.target.value })} placeholder="Oi! Como podemos te ajudar hoje?" data-testid="onboarding-greeting" />
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-emerald-600"
                    checked={config.use_emojis}
                    onChange={(e) => setConfig({ ...config, use_emojis: e.target.checked })}
                    data-testid="onboarding-emoji-checkbox"
                  />
                  Usar emojis nas respostas
                </label>
              </>
            )}

            {step === 4 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Escolha o que sua IA deve fazer nas conversas. Você pode mudar isso a qualquer
                  momento em "Configurar minha IA".
                </p>
                <div className="space-y-1.5">
                  <Label>Objetivo principal</Label>
                  <Select value={config.goal} onValueChange={(v: string) => setConfig({ ...config, goal: v })}>
                    <SelectTrigger data-testid="onboarding-goal-trigger">
                      <SelectValue>{(v) => GOALS[v as keyof typeof GOALS]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(GOALS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2.5">
                  {[
                    { key: "enable_sales" as const, label: "Apresentar produtos e conduzir vendas", testId: "onboarding-enable-sales" },
                    { key: "enable_scheduling" as const, label: "Ajudar a agendar atendimentos", testId: "onboarding-enable-scheduling" },
                    { key: "enable_recovery" as const, label: "Recuperar clientes inativos", testId: "onboarding-enable-recovery" },
                  ].map((item) => (
                    <label key={item.key} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm transition-colors duration-150 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="size-4 accent-emerald-600"
                        checked={config[item.key]}
                        onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                        data-testid={item.testId}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-rules">Alguma regra de atendimento? (opcional)</Label>
                  <Textarea
                    id="ob-rules"
                    rows={3}
                    value={config.service_rules}
                    onChange={(e) => setConfig({ ...config, service_rules: e.target.value })}
                    placeholder="Ex.: Nunca prometer resultado. Sempre confirmar o procedimento antes de sugerir horário."
                    data-testid="onboarding-service-rules"
                  />
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Aqui você ensina sua IA. Escreva uma informação que seus clientes sempre perguntam
                  — política de cancelamento, estacionamento, garantia, o que quiser.
                </p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-ktitle">Sobre o que é?</Label>
                    <Input id="ob-ktitle" value={knowledge.title} onChange={(e) => setKnowledge({ ...knowledge, title: e.target.value })} placeholder="Ex.: Política de cancelamento" data-testid="onboarding-knowledge-title" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-kcontent">O que a IA deve saber?</Label>
                    <Textarea id="ob-kcontent" rows={4} value={knowledge.content} onChange={(e) => setKnowledge({ ...knowledge, content: e.target.value })} placeholder="Ex.: Cancelamentos com 24h de antecedência não têm custo." data-testid="onboarding-knowledge-content" />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!knowledge.title.trim() || !knowledge.content.trim()) {
                        toast.error("Preencha o título e o conteúdo.");
                        return;
                      }
                      addKnowledge.mutate();
                    }}
                    disabled={addKnowledge.isPending}
                    className="gap-2"
                    data-testid="onboarding-knowledge-add-button"
                  >
                    {addKnowledge.isPending && <Loader2 className="size-4 animate-spin" />}
                    Ensinar minha IA
                  </Button>
                </div>
              </>
            )}

            {step === 6 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Registre o número que você usa para atender. Nesta etapa a conexão fica em{" "}
                  <strong>modo teste</strong>: nada é enviado a clientes reais. A ativação da API
                  oficial do WhatsApp Business é feita depois, na tela "Conectar WhatsApp".
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-wa">Número do WhatsApp</Label>
                  <Input id="ob-wa" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="5511999990000" data-testid="onboarding-whatsapp-phone" />
                  <p className="text-xs text-muted-foreground">Use o formato com código do país, sem espaços.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!whatsappPhone.trim()) {
                      toast.error("Informe o número do WhatsApp.");
                      return;
                    }
                    connectWhatsapp.mutate();
                  }}
                  disabled={connectWhatsapp.isPending}
                  className="gap-2"
                  data-testid="onboarding-whatsapp-connect-button"
                >
                  {connectWhatsapp.isPending && <Loader2 className="size-4 animate-spin" />}
                  Registrar em modo teste
                </Button>
              </>
            )}

            {step === 7 && (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Antes de atender de verdade, converse com a sua IA. Nada aqui é enviado para
                  clientes.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-test">Escreva como um cliente escreveria</Label>
                  <Input id="ob-test" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} data-testid="onboarding-test-input" />
                </div>
                <Button
                  variant="outline"
                  onClick={() => runTest.mutate()}
                  disabled={runTest.isPending || !testMessage.trim()}
                  className="gap-2"
                  data-testid="onboarding-test-button"
                >
                  {runTest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Testar minha IA
                </Button>
                {testReply && (
                  <div className="space-y-2 rounded-2xl border border-border bg-secondary/40 p-4" data-testid="onboarding-test-reply">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Resposta da sua IA</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{testReply.reply}</p>
                    <p className="text-xs text-muted-foreground">
                      Provedor: {testReply.provider} · Modelo: {testReply.model} · Itens no catálogo:{" "}
                      {testReply.config_used.products_count} · Informações ensinadas:{" "}
                      {testReply.config_used.knowledge_count}
                    </p>
                  </div>
                )}
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <PartyPopper className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  <p className="text-sm leading-relaxed text-emerald-900">
                    Está tudo configurado. Ao concluir, você vai para o painel e pode ajustar
                    qualquer detalhe quando quiser.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || busy}
            className="gap-2"
            data-testid="onboarding-back-button"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            {step > 1 && step < STEP_TITLES.length - 1 && (
              <Button variant="ghost" onClick={() => setStep((s) => s + 1)} disabled={busy} data-testid="onboarding-skip-button">
                Fazer depois
              </Button>
            )}
            <Button onClick={() => void next()} disabled={busy} className="gap-2" data-testid="onboarding-next-button">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {step === STEP_TITLES.length - 1 ? "Concluir e ir ao painel" : "Continuar"}
              {step === STEP_TITLES.length - 1 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {STEP_TITLES.map((title, i) => (
            <span
              key={title}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ${
                i < step
                  ? "bg-emerald-100 text-emerald-800"
                  : i === step
                    ? "bg-slate-900 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step && <Check className="mr-1 inline size-3" />}
              {title}
            </span>
          ))}
        </div>

        <NeriCredit className="mt-9 text-center" />
        {loadedCompany === undefined && null}
      </main>
    </div>
  );
}
