import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, Loader2, RotateCcw, Save, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, SectionTitle, Skeleton } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useInvalidate, useMe } from "@/hooks/useApp";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { Ok, RecoveryDraft, RecoveryRules, RecoveryTarget } from "@/lib/types";

const OPPORTUNITY_STYLE: Record<string, string> = {
  alta: "bg-emerald-100 text-emerald-800",
  media: "bg-amber-100 text-amber-900",
  baixa: "bg-slate-200 text-slate-700",
};

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function date(v: string | null) {
  return v ? new Date(v).toLocaleDateString("pt-BR") : "—";
}

export default function Recovery() {
  const invalidate = useInvalidate();
  const { data: me } = useMe();
  const canSend = ["OWNER", "ADMIN", "MANAGER"].includes(me?.user.role ?? "");

  const [target, setTarget] = useState<RecoveryTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [rulesForm, setRulesForm] = useState<Partial<RecoveryRules>>({});

  const { data: targets, isLoading, isError } = useQuery<RecoveryTarget[]>({
    queryKey: ["recovery-targets"],
    queryFn: () => apiGet<RecoveryTarget[]>("/recovery/targets"),
    retry: false,
  });

  const { data: rules } = useQuery<RecoveryRules>({
    queryKey: ["recovery-rules"],
    queryFn: async () => {
      const r = await apiGet<RecoveryRules>("/recovery/rules");
      setRulesForm(r);
      return r;
    },
    retry: false,
  });

  const generate = useMutation({
    mutationFn: (customerId: string) => apiPost<RecoveryDraft>(`/recovery/draft/${customerId}`),
    onSuccess: (data) => setDraft(data.message),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const send = useMutation({
    mutationFn: () => apiPost<Ok>(`/recovery/send/${target?.customer_id}`, { content: draft }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.warning(res.message);
      setTarget(null);
      setDraft("");
      invalidate("recovery-targets", "conversations", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const saveRules = useMutation({
    mutationFn: () => apiPut<RecoveryRules>("/recovery/rules", rulesForm),
    onSuccess: () => {
      toast.success("Regras de envio salvas");
      invalidate("recovery-rules", "recovery-targets");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  function openDraft(t: RecoveryTarget) {
    setTarget(t);
    setDraft("");
    generate.mutate(t.customer_id);
  }

  return (
    <div className="space-y-7">
      <SectionTitle
        overline="Recuperação"
        title="Recuperar clientes"
        description="Clientes que pararam de interagir com você. A IA escreve uma mensagem personalizada e você aprova antes de qualquer envio."
      />

      {/* rules */}
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Clock className="size-4.5 text-primary" />
              Regras de envio
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Servem para evitar spam e proteger a reputação do seu número.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-days">Dias sem interação para considerar inativo</Label>
              <Input id="r-days" type="number" min={1} value={rulesForm.inactive_days ?? 30} onChange={(e) => setRulesForm({ ...rulesForm, inactive_days: Number(e.target.value) })} data-testid="recovery-inactive-days" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-limit">Limite de envios por dia</Label>
              <Input id="r-limit" type="number" min={1} value={rulesForm.daily_limit ?? 30} onChange={(e) => setRulesForm({ ...rulesForm, daily_limit: Number(e.target.value) })} data-testid="recovery-daily-limit" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-interval">Intervalo entre mensagens (minutos)</Label>
              <Input id="r-interval" type="number" min={1} value={rulesForm.interval_minutes ?? 5} onChange={(e) => setRulesForm({ ...rulesForm, interval_minutes: Number(e.target.value) })} data-testid="recovery-interval" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-start">Enviar a partir das</Label>
              <Input id="r-start" value={rulesForm.send_window_start ?? "09:00"} onChange={(e) => setRulesForm({ ...rulesForm, send_window_start: e.target.value })} placeholder="09:00" data-testid="recovery-window-start" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-end">Enviar até as</Label>
              <Input id="r-end" value={rulesForm.send_window_end ?? "18:00"} onChange={(e) => setRulesForm({ ...rulesForm, send_window_end: e.target.value })} placeholder="18:00" data-testid="recovery-window-end" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-attempts">Máximo de tentativas por cliente</Label>
              <Input id="r-attempts" type="number" min={1} value={rulesForm.max_attempts ?? 3} onChange={(e) => setRulesForm({ ...rulesForm, max_attempts: Number(e.target.value) })} data-testid="recovery-max-attempts" />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-emerald-600"
              checked={rulesForm.require_approval ?? true}
              onChange={(e) => setRulesForm({ ...rulesForm, require_approval: e.target.checked })}
              data-testid="recovery-require-approval"
            />
            Sempre exigir minha aprovação antes de enviar
          </label>
          <Button onClick={() => saveRules.mutate()} disabled={!canSend || saveRules.isPending} className="gap-2" data-testid="recovery-save-rules">
            {saveRules.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar regras
          </Button>
          {rules && (
            <p className="text-xs text-muted-foreground">
              Nesta versão os envios são disparados por você a partir desta tela. O agendamento
              automático depende de um agendador externo (cron) — o procedimento está documentado em
              DEPLOY.md.
            </p>
          )}
        </CardContent>
      </Card>

      {/* targets */}
      <div className="space-y-4">
        <h3 className="font-heading text-lg font-semibold">Clientes inativos</h3>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={RotateCcw}
            title="Não foi possível carregar a lista"
            description="Verifique sua conexão e tente novamente em instantes."
            testId="recovery-error-state"
          />
        ) : !targets || targets.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="Nenhum cliente inativo por aqui"
            description={`Com a regra atual de ${rulesForm.inactive_days ?? 30} dias, todos os seus clientes tiveram interação recente. Diminua os dias acima para ampliar a busca.`}
            testId="recovery-empty-state"
          />
        ) : (
          <div className="space-y-3">
            {targets.map((t) => (
              <Card key={t.customer_id} data-testid={`recovery-card-${t.customer_id}`}>
                <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading font-semibold" data-testid={`recovery-name-${t.customer_id}`}>
                        {t.name}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${OPPORTUNITY_STYLE[t.opportunity]}`}>
                        Oportunidade {t.opportunity}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t.phone}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span data-testid={`recovery-days-${t.customer_id}`}>
                        <strong className="text-foreground">{t.days_inactive}</strong> dias sem interagir
                      </span>
                      <span>Última interação: {date(t.last_interaction_at)}</span>
                      <span>Última compra: {date(t.last_purchase_at)}</span>
                      <span>Valor: {money(t.last_purchase_value)}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => openDraft(t)}
                    disabled={!canSend || generate.isPending}
                    className="w-fit shrink-0 gap-2"
                    data-testid={`recovery-generate-${t.customer_id}`}
                  >
                    <Sparkles className="size-4" />
                    Gerar mensagem
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Mensagem para {target?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {generate.isPending ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                A IA está escrevendo uma mensagem personalizada…
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-draft">Revise antes de enviar</Label>
                  <Textarea id="rec-draft" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="recovery-draft-textarea" />
                </div>
                <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  Nada é enviado sem o seu clique. Se o WhatsApp estiver em modo teste, a mensagem é
                  apenas registrada na conversa, sem envio real.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{target?.days_inactive} dias inativo</Badge>
                  {target?.last_purchase_value ? <Badge variant="secondary">Última compra: {money(target.last_purchase_value)}</Badge> : null}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} data-testid="recovery-cancel-button">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!draft.trim()) {
                  toast.error("A mensagem não pode ficar vazia.");
                  return;
                }
                send.mutate();
              }}
              disabled={send.isPending || generate.isPending || !draft.trim()}
              className="gap-2"
              data-testid="recovery-approve-send-button"
            >
              {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Aprovar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
