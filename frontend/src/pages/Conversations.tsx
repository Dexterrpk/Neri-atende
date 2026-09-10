import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, CheckCircle2, HandHelping, Loader2, MessageSquare, Send, User } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState, SectionTitle, Skeleton } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage, useInvalidate } from "@/hooks/useApp";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Conversation, ConversationStatus, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_META: Record<ConversationStatus, { label: string; className: string }> = {
  novo: { label: "Novo", className: "bg-sky-100 text-sky-800" },
  em_atendimento: { label: "Em atendimento", className: "bg-emerald-100 text-emerald-800" },
  aguardando_cliente: { label: "Aguardando cliente", className: "bg-amber-100 text-amber-900" },
  precisa_humano: { label: "Precisa de humano", className: "bg-red-100 text-red-800" },
  resolvido: { label: "Resolvido", className: "bg-slate-200 text-slate-700" },
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "precisa_humano", label: "Precisa de humano" },
  { value: "resolvido", label: "Resolvidas" },
];

function time(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function Conversations() {
  const invalidate = useInvalidate();
  const [params, setParams] = useSearchParams();
  const activeId = params.get("id") ?? "";
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [customerDraft, setCustomerDraft] = useState("");

  const { data: conversations, isLoading, isError } = useQuery<Conversation[]>({
    queryKey: ["conversations", filter],
    queryFn: () => apiGet<Conversation[]>(`/conversations${filter ? `?status=${filter}` : ""}`),
    retry: false,
  });

  const active = conversations?.find((c) => c.id === activeId) ?? null;

  const { data: messages, isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["messages", activeId],
    queryFn: () => apiGet<Message[]>(`/conversations/${activeId}/messages`),
    enabled: Boolean(activeId),
    retry: false,
  });

  const reply = useMutation({
    mutationFn: () => apiPost<Message>(`/conversations/${activeId}/reply`, { content: draft }),
    onSuccess: () => {
      setDraft("");
      invalidate("messages", "conversations");
      toast.success("Mensagem enviada. A IA parou de responder nesta conversa.");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const simulate = useMutation({
    mutationFn: () => apiPost<Message[]>(`/conversations/${activeId}/simulate-customer`, { content: customerDraft }),
    onSuccess: () => {
      setCustomerDraft("");
      invalidate("messages", "conversations", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const takeover = useMutation({
    mutationFn: (take: boolean) => apiPost<Conversation>(`/conversations/${activeId}/takeover`, { take }),
    onSuccess: (conv) => {
      invalidate("conversations", "messages");
      toast.success(conv.ai_paused ? "Você assumiu a conversa. A IA não responde mais aqui." : "Conversa devolvida para a IA.");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const setStatus = useMutation({
    mutationFn: (status: ConversationStatus) => apiPatch<Conversation>(`/conversations/${activeId}/status`, { status }),
    onSuccess: () => {
      invalidate("conversations");
      toast.success("Status atualizado");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <SectionTitle
        overline="Central de conversas"
        title="Conversas"
        description="Acompanhe todos os atendimentos. Assuma uma conversa quando quiser e a IA para de responder nela imediatamente."
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
              filter === f.value ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
            data-testid={`conversations-filter-${f.value || "all"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* list */}
        <div className={cn("space-y-2.5", activeId && "hidden lg:block")}>
          {isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : isError ? (
            <EmptyState
              icon={MessageSquare}
              title="Não foi possível carregar"
              description="Verifique sua conexão e tente novamente."
              testId="conversations-error-state"
            />
          ) : !conversations || conversations.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="Nenhuma conversa por aqui"
              description="Quando um cliente mandar mensagem no WhatsApp conectado, a conversa aparece aqui. Você também pode abrir uma conversa a partir da tela Clientes."
              testId="conversations-empty-state"
            />
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setParams({ id: c.id })}
                className={cn(
                  "w-full rounded-2xl border p-4 text-left transition-colors duration-150",
                  c.id === activeId ? "border-primary bg-secondary/50" : "border-border bg-card hover:bg-muted/40",
                )}
                data-testid={`conversation-item-${c.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-heading text-sm font-semibold">{c.customer_name}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{time(c.last_message_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.last_message || "Sem mensagens ainda"}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", STATUS_META[c.status].className)}>
                    {STATUS_META[c.status].label}
                  </span>
                  <span className="text-[0.68rem] text-muted-foreground">
                    {c.ai_paused ? `Atendente: ${c.assignee}` : "Respondido pela IA"}
                  </span>
                  {c.opportunity && <Badge variant="secondary" className="text-[0.65rem]">Oportunidade</Badge>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* thread */}
        <div className={cn("min-w-0", !activeId && "hidden lg:block")}>
          {!active ? (
            <div className="hidden h-full min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 lg:flex">
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                Selecione uma conversa à esquerda para ver o histórico completo.
              </p>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setParams({})}
                    className="lg:hidden"
                    aria-label="Voltar"
                    data-testid="conversation-back-button"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-heading font-bold text-secondary-foreground">
                    {active.customer_name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-heading text-sm font-semibold" data-testid="conversation-customer-name">
                      {active.customer_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{active.customer_phone}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_META[active.status].className)}
                    data-testid="conversation-status-badge"
                  >
                    {STATUS_META[active.status].label}
                  </span>
                  {active.ai_paused ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => takeover.mutate(false)}
                      disabled={takeover.isPending}
                      className="gap-1.5"
                      data-testid="conversation-handback-button"
                    >
                      <Bot className="size-3.5" />
                      Devolver para a IA
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => takeover.mutate(true)}
                      disabled={takeover.isPending}
                      className="gap-1.5"
                      data-testid="conversation-takeover-button"
                    >
                      <HandHelping className="size-3.5" />
                      Assumir conversa
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatus.mutate("resolvido")}
                    disabled={setStatus.isPending || active.status === "resolvido"}
                    className="gap-1.5"
                    data-testid="conversation-resolve-button"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Resolver
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/25 px-4 py-5" data-testid="conversation-thread">
                {loadingMessages ? (
                  [0, 1].map((i) => <Skeleton key={i} className="h-14 w-2/3" />)
                ) : !messages || messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Use o campo de teste abaixo para simular um cliente.
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = m.role !== "customer";
                    return (
                      <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[82%] animate-bubble-in rounded-2xl px-3.5 py-2.5",
                            mine ? "bg-[#DCF8C6] text-[#064E3B]" : "border border-border bg-card",
                          )}
                          data-testid={`message-${m.id}`}
                        >
                          <p className="mb-1 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wide opacity-70">
                            {m.role === "customer" ? <User className="size-3" /> : m.role === "ai" ? <Bot className="size-3" /> : <HandHelping className="size-3" />}
                            {m.role === "customer" ? m.author || "Cliente" : m.role === "ai" ? m.author || "IA" : m.author || "Atendente"}
                          </p>
                          <p className="whitespace-pre-line text-sm leading-relaxed">{m.content}</p>
                          <p className="mt-1 text-right text-[0.65rem] opacity-60">{time(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-3 border-t border-border px-4 py-4">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim()) reply.mutate();
                  }}
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Responder como atendente humano…"
                    data-testid="conversation-reply-input"
                  />
                  <Button type="submit" disabled={reply.isPending || !draft.trim()} className="shrink-0 gap-1.5" data-testid="conversation-send-button">
                    {reply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Enviar
                  </Button>
                </form>

                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customerDraft.trim()) simulate.mutate();
                  }}
                >
                  <Input
                    value={customerDraft}
                    onChange={(e) => setCustomerDraft(e.target.value)}
                    placeholder="Simular mensagem do cliente (modo teste, nada é enviado)…"
                    data-testid="conversation-simulate-input"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={simulate.isPending || !customerDraft.trim()}
                    className="shrink-0 gap-1.5"
                    data-testid="conversation-simulate-button"
                  >
                    {simulate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                    Simular
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  A simulação injeta uma mensagem de cliente e deixa a IA responder, sem envio real
                  pelo WhatsApp.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
