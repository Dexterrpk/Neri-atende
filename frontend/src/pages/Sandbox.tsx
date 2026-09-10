import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { SectionTitle } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/hooks/useApp";
import { apiPost } from "@/lib/api";
import type { SandboxConfigUsed, SandboxReply } from "@/lib/types";
import { cn } from "@/lib/utils";

const SCENARIOS = [
  { label: "Dúvida simples", message: "Oi, vocês atendem hoje? Até que horas?" },
  { label: "Pergunta de preço", message: "Quanto custa o serviço mais procurado de vocês?" },
  { label: "Interesse de compra", message: "Quero contratar. Como faço para fechar?" },
  { label: "Reclamação", message: "Fui atendido e não gostei do resultado. Quero uma solução." },
  { label: "Pedir um humano", message: "Prefiro falar com uma pessoa, por favor." },
  { label: "Informação inexistente", message: "Vocês têm convênio com plano de saúde?" },
];

interface Turn {
  role: "customer" | "ai";
  content: string;
}

export default function Sandbox() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [configUsed, setConfigUsed] = useState<SandboxConfigUsed | null>(null);
  const [lastMeta, setLastMeta] = useState<{ provider: string; model: string; needs_human: boolean } | null>(null);

  const send = useMutation({
    mutationFn: (message: string) =>
      apiPost<SandboxReply>("/sandbox/chat", { message, history: turns.slice(-20) }),
    onSuccess: (data) => {
      setTurns((prev) => [...prev, { role: "ai", content: data.reply }]);
      setConfigUsed(data.config_used);
      setLastMeta({ provider: data.provider, model: data.model, needs_human: data.needs_human });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  function submit(message: string) {
    const text = message.trim();
    if (!text) return;
    setTurns((prev) => [...prev, { role: "customer", content: text }]);
    setDraft("");
    send.mutate(text);
  }

  return (
    <div className="space-y-7">
      <SectionTitle
        overline="Ferramenta de teste"
        title="Testar minha IA"
        description="Converse com a sua IA como se fosse um cliente. Nada aqui é enviado pelo WhatsApp — é totalmente seguro para experimentar."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="flex min-h-[540px] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <Bot className="size-4.5" />
            </span>
            <div>
              <p className="font-heading text-sm font-semibold">
                {configUsed?.ai_name || "Sua IA"}
                {configUsed?.company_name ? ` · ${configUsed.company_name}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">Ambiente de teste, sem envio real</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/25 px-4 py-5" data-testid="sandbox-thread">
            {turns.length === 0 ? (
              <div className="space-y-4 py-8 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                  <Sparkles className="size-6" />
                </span>
                <div className="space-y-1.5">
                  <p className="font-heading font-semibold">Escreva como um cliente escreveria</p>
                  <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Ou escolha um cenário pronto ao lado para testar situações difíceis: preço,
                    reclamação, pedido de atendente humano e informação que a IA não tem.
                  </p>
                </div>
              </div>
            ) : (
              turns.map((t, i) => (
                <div key={i} className={cn("flex", t.role === "customer" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] animate-bubble-in rounded-2xl px-3.5 py-2.5",
                      t.role === "customer" ? "bg-[#DCF8C6] text-[#064E3B]" : "border border-border bg-card",
                    )}
                    data-testid={`sandbox-message-${i}`}
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wide opacity-70">
                      {t.role === "customer" ? <User className="size-3" /> : <Bot className="size-3" />}
                      {t.role === "customer" ? "Você (como cliente)" : configUsed?.ai_name || "IA"}
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{t.content}</p>
                  </div>
                </div>
              ))
            )}
            {send.isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {configUsed?.ai_name || "Sua IA"} está escrevendo…
                </div>
              </div>
            )}
          </div>

          <form
            className="flex gap-2 border-t border-border px-4 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Digite a mensagem do cliente…"
              data-testid="sandbox-input"
            />
            <Button type="submit" disabled={send.isPending || !draft.trim()} className="shrink-0 gap-1.5" data-testid="sandbox-send-button">
              {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h3 className="font-heading text-sm font-semibold">Cenários para testar</h3>
              <div className="space-y-2">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => submit(s.message)}
                    disabled={send.isPending}
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-left text-sm transition-colors duration-150 hover:border-primary hover:bg-secondary/40 disabled:opacity-50"
                    data-testid={`sandbox-scenario-${s.label}`}
                  >
                    <span className="block font-medium">{s.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{s.message}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h3 className="font-heading text-sm font-semibold">Configuração em uso</h3>
              {configUsed ? (
                <dl className="space-y-2 text-sm" data-testid="sandbox-config-used">
                  {[
                    ["Nome da IA", configUsed.ai_name],
                    ["Tom de voz", configUsed.tone],
                    ["Formalidade", configUsed.formality],
                    ["Tamanho das respostas", configUsed.response_length],
                    ["Emojis", configUsed.use_emojis ? "Sim" : "Não"],
                    ["Vendas", configUsed.sales_enabled ? "Ativado" : "Desativado"],
                    ["Agendamento", configUsed.scheduling_enabled ? "Ativado" : "Desativado"],
                    ["Itens no catálogo", String(configUsed.products_count)],
                    ["Informações ensinadas", String(configUsed.knowledge_count)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Envie uma mensagem para ver exatamente qual configuração a sua IA usou nesta
                  resposta.
                </p>
              )}
              <Link to="/app/configuracao" className={buttonVariants({ variant: "outline", size: "sm" }) + " w-full"} data-testid="sandbox-config-link">
                Ajustar configuração
              </Link>
            </CardContent>
          </Card>

          {lastMeta && (
            <Card className={lastMeta.provider === "test" ? "border-amber-200 bg-amber-50" : ""}>
              <CardContent className="space-y-2 p-5">
                <h3 className="font-heading text-sm font-semibold">Detalhes da resposta</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" data-testid="sandbox-provider-badge">Provedor: {lastMeta.provider}</Badge>
                  <Badge variant="outline">Modelo: {lastMeta.model}</Badge>
                  {lastMeta.needs_human && <Badge variant="destructive">Encaminhou para humano</Badge>}
                </div>
                {lastMeta.provider === "test" && (
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-900">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    Nenhum serviço de IA está conectado, então as respostas são simuladas. O
                    administrador da plataforma precisa conectar um provedor de IA.
                  </p>
                )}
                {lastMeta.provider === "unavailable" && (
                  <p className="text-xs leading-relaxed text-red-700">
                    O serviço de IA não respondeu. Tente novamente em alguns instantes.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {turns.length > 0 && (
            <Button variant="ghost" onClick={() => { setTurns([]); setLastMeta(null); }} className="w-full" data-testid="sandbox-clear-button">
              Limpar conversa de teste
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
