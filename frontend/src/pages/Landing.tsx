import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  MessageSquare,
  Package,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingDown,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Logo, NeriCredit } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PROBLEMS = [
  { icon: Clock, title: "Mensagem sem resposta", text: "O cliente pergunta às 22h e a resposta só sai no dia seguinte. Aí ele já comprou em outro lugar." },
  { icon: TrendingDown, title: "Cliente que desaparece", text: "Pediu orçamento, disse que ia pensar e nunca mais voltou. Ninguém acompanhou." },
  { icon: Users, title: "Tempo do dono no WhatsApp", text: "Você atende, vende, agenda e ainda administra. O WhatsApp consome o dia inteiro." },
];

const FEATURES = [
  { icon: MessageSquare, title: "Atendimento a qualquer hora", text: "A IA responde dúvidas usando somente as informações que você cadastrou. Sem inventar nada." },
  { icon: Package, title: "Apresenta e vende seu catálogo", text: "Recomenda produtos e serviços, explica o que está incluso e conduz a conversa até a compra." },
  { icon: CalendarClock, title: "Ajuda a agendar", text: "Coleta serviço, dia e horário de preferência e registra para a equipe confirmar." },
  { icon: RotateCcw, title: "Recupera clientes inativos", text: "Identifica quem parou de interagir e sugere uma mensagem personalizada para você aprovar." },
  { icon: BookOpen, title: "Ensine sua IA em minutos", text: "Escreva horários, políticas, endereço e perguntas frequentes. A IA passa a usar só isso." },
  { icon: ShieldCheck, title: "Você no controle", text: "Assuma qualquer conversa quando quiser: a IA para de responder na hora." },
];

const STEPS = [
  { n: "1", title: "Crie sua conta", text: "Leva menos de um minuto. Sem cartão, sem instalação." },
  { n: "2", title: "Ensine sua IA", text: "Um passo a passo guiado pergunta sobre seu negócio, produtos e como atender." },
  { n: "3", title: "Teste antes de tudo", text: "Converse com sua IA dentro da plataforma, sem enviar nada para clientes reais." },
  { n: "4", title: "Conecte o WhatsApp", text: "Use a API oficial do WhatsApp Business e comece a atender." },
];

const AUDIENCE = [
  { icon: Store, title: "Comércio e varejo", text: "Tira dúvidas de produto, informa preço cadastrado e encaminha a venda." },
  { icon: Sparkles, title: "Estética e saúde", text: "Explica procedimentos, coleta preferência de horário e organiza a agenda." },
  { icon: Building2, title: "Serviços e assistências", text: "Qualifica o pedido, registra o interesse e passa para um humano quando precisa." },
];

const PLANS = [
  { name: "Free", price: "R$ 0", note: "para testar de verdade", features: ["1 número de WhatsApp", "2 usuários", "100 clientes", "200 respostas de IA por mês"], cta: "Começar agora", highlight: false },
  { name: "Basic", price: "R$ 97", note: "por mês", features: ["5 usuários", "1.000 clientes", "2.000 respostas de IA", "Recuperação de clientes"], cta: "Começar agora", highlight: false },
  { name: "Pro", price: "R$ 197", note: "por mês", features: ["15 usuários", "10.000 clientes", "20.000 respostas de IA", "Agenda e relatórios"], cta: "Começar agora", highlight: true },
  { name: "Premium", price: "Sob consulta", note: "para operações maiores", features: ["Usuários ilimitados", "Volume dedicado", "Suporte prioritário", "Integrações personalizadas"], cta: "Falar com a Neri", highlight: false },
];

const FAQ = [
  { q: "A IA pode inventar um preço ou uma promoção?", a: "Não. Ela é instruída a usar apenas o catálogo e as informações que você cadastrou. Quando não sabe algo, diz que vai confirmar e, se você configurar assim, encaminha para um atendente humano." },
  { q: "Preciso entender de tecnologia para configurar?", a: "Não. O passo a passo pergunta em português simples sobre sua empresa, seus produtos e como você quer atender. Nada de termos técnicos." },
  { q: "Como funciona a conexão com o WhatsApp?", a: "Usamos a API oficial do WhatsApp Business (Meta). Não usamos automações de WhatsApp Web, que colocam seu número em risco de bloqueio." },
  { q: "Consigo assumir uma conversa no meio do atendimento?", a: "Sim. Na central de conversas você clica em assumir e a IA para de responder imediatamente naquela conversa. Depois você pode devolvê-la para a IA." },
  { q: "Meus dados ficam separados de outras empresas?", a: "Sim. Cada empresa tem seu próprio espaço isolado. A verificação é feita no servidor em toda operação, não apenas na tela." },
  { q: "Posso testar sem enviar mensagens para clientes?", a: "Sim. A ferramenta 'Testar minha IA' permite conversar com sua IA dentro da plataforma, sem nenhum envio real." },
];

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        data-testid={`faq-toggle-${index}`}
      >
        <span className="font-heading text-[0.98rem] font-semibold">{q}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground" data-testid={`faq-answer-${index}`}>
          {a}
        </p>
      )}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-dvh bg-background">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#recursos" className="transition-colors hover:text-foreground">Recursos</a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">Como funciona</a>
            <a href="#planos" className="transition-colors hover:text-foreground">Planos</a>
            <a href="#duvidas" className="transition-colors hover:text-foreground">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="nav-login-button">
              Entrar
            </Link>
            <Link to="/cadastro" className={buttonVariants({ size: "sm" })} data-testid="nav-register-button">
              Começar agora
            </Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="space-y-7">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1" data-testid="hero-badge">
              <Sparkles className="size-3.5" />
              Atendimento, vendas e recuperação com IA
            </Badge>
            <h1 className="font-heading text-[2.5rem] font-extrabold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Seu atendente e vendedor{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent">
                inteligente no WhatsApp
              </span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              O Atende IA responde dúvidas, apresenta seus produtos e serviços, ajuda a agendar,
              recupera clientes que pararam de comprar e passa a conversa para você quando é
              preciso — usando somente as informações que a sua empresa cadastrou.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/cadastro" className={buttonVariants({ size: "lg" }) + " gap-2 transition-transform duration-150 hover:-translate-y-0.5"} data-testid="hero-cta-button">
                Começar agora
                <ArrowRight className="size-4" />
              </Link>
              <Link to="/login" className={buttonVariants({ variant: "outline", size: "lg" })} data-testid="hero-login-button">
                Já tenho conta
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["Configuração sem código", "API oficial do WhatsApp", "Dados isolados por empresa"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* WhatsApp simulation */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-emerald-500/12 via-transparent to-slate-900/5 blur-2xl" />
            <div className="grid-texture overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-[#064E3B] to-[#0F172A] p-4 shadow-2xl shadow-emerald-950/20 sm:p-6">
              <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
                <span className="grid size-10 place-items-center rounded-full bg-emerald-500/20 font-heading font-bold text-emerald-300">
                  B
                </span>
                <div className="min-w-0">
                  <p className="truncate font-heading text-sm font-semibold text-white">Bella · Atendimento</p>
                  <p className="flex items-center gap-1.5 text-xs text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-ai-pulse" />
                    respondendo agora
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { me: false, text: "Oi! Vocês fazem limpeza de pele? Quanto fica?" },
                  { me: true, text: "Oi! Fazemos sim 😊 A Limpeza de Pele Profunda é de 60 minutos e custa R$ 180. Inclui extração, hidratação e máscara calmante." },
                  { me: false, text: "Tem horário na quinta de manhã?" },
                  { me: true, text: "Atendemos de segunda a sexta das 9h às 19h. Posso registrar sua preferência para quinta pela manhã e a equipe confirma o horário exato, pode ser?" },
                ].map((m, i) => (
                  <div key={i} className={`flex ${m.me ? "justify-end" : "justify-start"}`}>
                    <p
                      className={`max-w-[86%] animate-bubble-in rounded-2xl px-3.5 py-2.5 text-[0.84rem] leading-relaxed ${
                        m.me ? "bg-[#DCF8C6] text-[#064E3B]" : "bg-white text-slate-900"
                      }`}
                      style={{ animationDelay: `${i * 140}ms` }}
                    >
                      {m.text}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[0.72rem] leading-relaxed text-emerald-200">
                Exemplo ilustrativo. Todos os preços e horários vêm do que a empresa cadastrou.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* problem */}
      <section className="border-y border-border bg-card/50 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">O problema</p>
          <h2 className="mt-2 max-w-2xl font-heading text-3xl font-bold">
            Todo dia escapa uma venda no WhatsApp
          </h2>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border bg-card p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-600">
                  <p.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section id="recursos" className="py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">A solução</p>
          <h2 className="mt-2 max-w-2xl font-heading text-3xl font-bold">
            Um atendente que conhece o seu negócio
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Você ensina uma vez. A IA atende com as suas informações, no seu tom de voz, seguindo as
            suas regras.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="transition-shadow duration-200 hover:shadow-md">
                <CardContent className="space-y-3 p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="font-heading text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="como-funciona" className="border-y border-border bg-card/50 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Como funciona</p>
          <h2 className="mt-2 font-heading text-3xl font-bold">Quatro passos, nenhuma linha de código</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-border bg-card p-6">
                <span className="font-heading text-4xl font-extrabold text-emerald-500/25">{s.n}</span>
                <h3 className="mt-2 font-heading text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* audience */}
      <section className="py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Para quem é</p>
          <h2 className="mt-2 font-heading text-3xl font-bold">Feito para negócios que vendem conversando</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {AUDIENCE.map((a) => (
              <div key={a.title} className="rounded-2xl border border-border bg-card p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <a.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="planos" className="border-y border-border bg-card/50 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Planos</p>
          <h2 className="mt-2 font-heading text-3xl font-bold">Comece de graça e cresça quando fizer sentido</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`flex flex-col rounded-2xl border p-6 ${
                  p.highlight ? "border-primary bg-card shadow-lg shadow-emerald-600/10" : "border-border bg-card"
                }`}
                data-testid={`plan-card-${p.name.toLowerCase()}`}
              >
                {p.highlight && <Badge className="mb-3 w-fit">Mais escolhido</Badge>}
                <h3 className="font-heading text-lg font-bold">{p.name}</h3>
                <p className="mt-2 font-heading text-3xl font-extrabold">{p.price}</p>
                <p className="text-xs text-muted-foreground">{p.note}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/cadastro"
                  className={buttonVariants({ variant: p.highlight ? "default" : "outline", size: "sm" }) + " mt-6 w-full"}
                  data-testid={`plan-cta-${p.name.toLowerCase()}`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            A cobrança automática ainda não está ativa nesta versão. Os limites de cada plano já são
            aplicados pela plataforma.
          </p>
        </div>
      </section>

      {/* faq */}
      <section id="duvidas" className="py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Dúvidas frequentes</p>
          <h2 className="mt-2 font-heading text-3xl font-bold">Perguntas que todo mundo faz</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f, i) => (
              <FaqItem key={f.q} q={f.q} a={f.a} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* final cta */}
      <section className="px-5 pb-16">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-[#064E3B] to-[#0F172A] px-6 py-14 text-center sm:px-12">
          <h2 className="font-heading text-3xl font-extrabold text-white sm:text-4xl">
            Deixe de perder venda por falta de resposta
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-emerald-100/85">
            Crie sua conta, ensine sua IA em poucos minutos e teste antes de conectar o WhatsApp.
          </p>
          <Link to="/cadastro" className={buttonVariants({ size: "lg" }) + " mt-8 gap-2"} data-testid="footer-cta-button">
            Começar agora
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-9">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="space-y-2">
            <Logo />
            <p className="text-xs text-muted-foreground">
              Seu atendente e vendedor inteligente no WhatsApp.
            </p>
          </div>
          <div className="space-y-1.5">
            <NeriCredit />
            <p className="text-[0.68rem] text-muted-foreground">
              © {new Date().getFullYear()} Atende IA · Todos os direitos reservados
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
