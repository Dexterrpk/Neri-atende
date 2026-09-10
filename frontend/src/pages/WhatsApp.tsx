import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, Link2, Loader2, Save, ShieldCheck, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionTitle, Skeleton, StatusDot } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage, useInvalidate, useMe } from "@/hooks/useApp";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { Ok, WhatsAppStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const MISSING_LABELS: Record<string, string> = {
  numero: "Informe o número do WhatsApp",
  conexao: "Registre a conexão",
  phone_number_id: "ID do número na API oficial",
  access_token: "Token de acesso da API oficial",
  verify_token: "Palavra-chave de verificação",
};

export default function WhatsApp() {
  const invalidate = useInvalidate();
  const { data: me } = useMe();
  const canEdit = me?.user.role === "OWNER" || me?.user.role === "ADMIN";

  const [mode, setMode] = useState<"test" | "official">("test");
  const [form, setForm] = useState({
    phone_number: "",
    display_name: "",
    phone_number_id: "",
    access_token: "",
    verify_token: "",
  });

  const { data: status, isLoading, isError } = useQuery<WhatsAppStatus>({
    queryKey: ["whatsapp-status"],
    queryFn: () => apiGet<WhatsAppStatus>("/whatsapp/status"),
    retry: false,
  });

  useEffect(() => {
    if (status) {
      setMode(status.mode === "official" ? "official" : "test");
      setForm((prev) => ({
        ...prev,
        phone_number: prev.phone_number || status.phone_number,
        display_name: prev.display_name || status.display_name,
      }));
    }
  }, [status]);

  const connect = useMutation({
    mutationFn: () => apiPut<WhatsAppStatus>("/whatsapp/connect", { mode, ...form }),
    onSuccess: () => {
      toast.success(mode === "official" ? "Credenciais salvas com segurança" : "Conexão em modo teste registrada");
      setForm((prev) => ({ ...prev, access_token: "", verify_token: "" }));
      invalidate("whatsapp-status", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const disconnect = useMutation({
    mutationFn: () => apiDelete<Ok>("/whatsapp/connect"),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate("whatsapp-status", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const testSend = useMutation({
    mutationFn: () => apiPost<Ok>("/whatsapp/test-send"),
    onSuccess: (res) => (res.ok ? toast.success(res.message) : toast.warning(res.message)),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-7">
      <SectionTitle
        overline="Integração"
        title="Conectar WhatsApp"
        description="Usamos a API oficial do WhatsApp Business (Meta). Não usamos automações de WhatsApp Web, que colocam seu número em risco de bloqueio."
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <h3 className="font-heading text-lg font-semibold">Status da conexão</h3>
                {isError ? (
                  <StatusDot status="error" label="Não foi possível verificar" testId="whatsapp-status-badge" />
                ) : status?.connected ? (
                  <StatusDot
                    status={status.mode === "official" ? "ok" : "warn"}
                    label={status.mode === "official" ? "Conectado pela API oficial" : "Conectado em modo teste"}
                    testId="whatsapp-status-badge"
                  />
                ) : (
                  <StatusDot status="not_configured" label="Não conectado" testId="whatsapp-status-badge" />
                )}
              </div>
              {status?.connected && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => testSend.mutate()} disabled={!canEdit || testSend.isPending} className="gap-1.5" data-testid="whatsapp-test-button">
                    {testSend.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                    Testar conexão
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => disconnect.mutate()} disabled={!canEdit || disconnect.isPending} className="gap-1.5 text-destructive hover:text-destructive" data-testid="whatsapp-disconnect-button">
                    <Unplug className="size-3.5" />
                    Desconectar
                  </Button>
                </div>
              )}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Número conectado", status?.phone_number || "—"],
                ["Nome de exibição", status?.display_name || "—"],
                ["Tipo de conexão", status?.mode === "official" ? "API oficial" : "Modo teste"],
                ["Última sincronização", status?.last_sync_at ? new Date(status.last_sync_at).toLocaleString("pt-BR") : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-muted/40 px-3.5 py-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium" data-testid={`whatsapp-info-${label}`}>{value}</dd>
                </div>
              ))}
            </dl>

            {status?.token_configured && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="whatsapp-token-note">
                <ShieldCheck className="size-3.5 text-primary" />
                Token de acesso salvo e criptografado. Por segurança, ele nunca é exibido novamente —
                para trocar, informe um novo valor abaixo.
              </p>
            )}

            {status?.last_error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800" data-testid="whatsapp-error-note">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {status.last_error}
              </p>
            )}

            {status && status.missing.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" data-testid="whatsapp-missing-panel">
                <p className="text-sm font-semibold text-amber-900">Configuração necessária</p>
                <ul className="mt-1.5 space-y-0.5 text-sm text-amber-800">
                  {status.missing.map((m) => (
                    <li key={m}>• {MISSING_LABELS[m] ?? m}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* mode selector */}
      <Card>
        <CardContent className="space-y-5 p-6">
          <h3 className="font-heading text-lg font-semibold">Como você quer conectar?</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { value: "test" as const, title: "Modo teste", text: "Nada é enviado para clientes. Ideal para experimentar a plataforma antes de ativar de verdade.", testId: "whatsapp-mode-test" },
              { value: "official" as const, title: "API oficial (produção)", text: "Envio e recebimento reais pela WhatsApp Business Cloud API da Meta. Requer credenciais.", testId: "whatsapp-mode-official" },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMode(o.value)}
                disabled={!canEdit}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors duration-150 disabled:opacity-60",
                  mode === o.value ? "border-primary bg-secondary/50" : "border-border hover:bg-muted/40",
                )}
                data-testid={o.testId}
              >
                <p className="font-heading text-sm font-semibold">{o.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{o.text}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone">Número do WhatsApp</Label>
              <Input id="wa-phone" disabled={!canEdit} value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="5511999990000" data-testid="whatsapp-phone-input" />
              <p className="text-xs text-muted-foreground">Com código do país, sem espaços ou símbolos.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-display">Nome que aparece para o cliente</Label>
              <Input id="wa-display" disabled={!canEdit} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Ex.: Bella Estética" data-testid="whatsapp-display-input" />
            </div>

            {mode === "official" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-pnid">ID do número (Phone Number ID)</Label>
                  <Input id="wa-pnid" disabled={!canEdit} value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} data-testid="whatsapp-pnid-input" />
                  <p className="text-xs text-muted-foreground">
                    Encontrado no painel Meta for Developers → WhatsApp → Configuração da API.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-token">Token de acesso permanente</Label>
                  <Input id="wa-token" type="password" disabled={!canEdit} value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} placeholder={status?.token_configured ? "Já configurado — preencha só para trocar" : "Cole o token aqui"} data-testid="whatsapp-token-input" />
                  <p className="text-xs text-muted-foreground">
                    Gerado em Meta for Developers → Usuários do sistema. É criptografado ao salvar e
                    nunca mais exibido.
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wa-verify">Palavra-chave de verificação</Label>
                  <Input id="wa-verify" type="password" disabled={!canEdit} value={form.verify_token} onChange={(e) => setForm({ ...form, verify_token: e.target.value })} placeholder="Escolha um valor aleatório e longo" data-testid="whatsapp-verify-input" />
                  <p className="text-xs text-muted-foreground">
                    Use o mesmo valor no campo "Verify token" da Meta ao configurar a conexão
                    automática.
                  </p>
                </div>
              </>
            )}
          </div>

          <Button
            onClick={() => {
              if (!form.phone_number.trim()) {
                toast.error("Informe o número do WhatsApp.");
                return;
              }
              if (mode === "official" && !form.phone_number_id.trim()) {
                toast.error("Informe o ID do número da API oficial.");
                return;
              }
              connect.mutate();
            }}
            disabled={!canEdit || connect.isPending}
            className="gap-2"
            data-testid="whatsapp-save-button"
          >
            {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {mode === "official" ? "Salvar credenciais e conectar" : "Registrar em modo teste"}
          </Button>
        </CardContent>
      </Card>

      {/* webhook */}
      {status && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <h3 className="font-heading text-lg font-semibold">Conexão automática</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                É por este endereço que a Meta entrega as mensagens dos seus clientes. Cole-o no
                campo "Callback URL" do painel da Meta, junto com a sua palavra-chave de verificação.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={status.webhook_url} className="font-mono text-xs" data-testid="whatsapp-webhook-url" />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(status.webhook_url);
                  toast.success("Endereço copiado");
                }}
                className="shrink-0 gap-1.5"
                data-testid="whatsapp-copy-webhook"
              >
                <Copy className="size-4" />
                Copiar
              </Button>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">O que a plataforma faz por você</p>
              <ul className="space-y-1">
                <li>• Cadastra automaticamente o cliente que mandar mensagem</li>
                <li>• Ignora mensagens repetidas, então um reenvio da Meta nunca duplica nada</li>
                <li>• Deixa a IA responder e para na hora que um atendente assume a conversa</li>
                <li>• Registra tudo na central de conversas</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Assinar o evento "messages" no painel da Meta</Badge>
              <Badge variant="outline">Permissões: whatsapp_business_messaging</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
