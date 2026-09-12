import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Link2, Loader2, QrCode, ShieldCheck, Smartphone, Unplug } from "lucide-react";
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


type ConnectChoice = "web" | "official";
type WebMethod = "qr" | "pairing";

export default function WhatsApp() {
  const invalidate = useInvalidate();
  const { data: me } = useMe();
  const canEdit = me?.user.role === "OWNER" || me?.user.role === "ADMIN";
  const [choice, setChoice] = useState<ConnectChoice>("web");
  const [webMethod, setWebMethod] = useState<WebMethod>("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [mode] = useState<"test" | "official">("official");
  const [form, setForm] = useState({ phone_number: "", display_name: "", phone_number_id: "", access_token: "", verify_token: "" });

  const { data: status, isLoading, isError } = useQuery<WhatsAppStatus>({
    queryKey: ["whatsapp-status"], queryFn: () => apiGet<WhatsAppStatus>("/whatsapp/status"), retry: false,
    refetchInterval: (q) => q.state.data?.web_status && ["waiting_qr", "waiting_pairing", "connecting"].includes(q.state.data.web_status) ? 2000 : 5000,
  });

  const savedMode = status?.mode;
  const savedPhone = status?.phone_number || "";
  const savedName = status?.display_name || "";
  useEffect(() => {
    if (savedMode === "official" || savedMode === "web") setChoice(savedMode);
  }, [savedMode]);
  useEffect(() => {
    setForm(prev => ({ ...prev, phone_number: prev.phone_number || savedPhone, display_name: prev.display_name || savedName }));
  }, [savedPhone, savedName]);

  const webQr = useMutation({
    mutationFn: () => apiPost<WhatsAppStatus>("/whatsapp/web/qr"),
    onSuccess: () => { toast.info("Conexão iniciada. Aguarde o QR Code ou a restauração da sessão."); invalidate("whatsapp-status"); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const webPairing = useMutation({
    mutationFn: () => apiPost<WhatsAppStatus>("/whatsapp/web/pairing", { phone_number: pairingPhone }),
    onSuccess: (res) => { if (res.web_pairing_code) toast.success("Código gerado. Digite-o no WhatsApp do celular."); else toast.info("Iniciando conexão…"); invalidate("whatsapp-status"); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const webDisconnect = useMutation({
    mutationFn: () => apiDelete<Ok>("/whatsapp/web"),
    onSuccess: () => { toast.success("WhatsApp Web desconectado"); invalidate("whatsapp-status"); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const connectOfficial = useMutation({
    mutationFn: () => apiPut<WhatsAppStatus>("/whatsapp/connect", { mode, ...form }),
    onSuccess: () => { toast.success("Credenciais da Meta salvas com segurança"); setForm((p) => ({ ...p, access_token: "", verify_token: "" })); invalidate("whatsapp-status", "dashboard"); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const disconnect = useMutation({
    mutationFn: () => apiDelete<Ok>("/whatsapp/connect"),
    onSuccess: (res) => { toast.success(res.message); invalidate("whatsapp-status", "dashboard"); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
  const testSend = useMutation({
    mutationFn: () => apiPost<Ok>("/whatsapp/test-send"),
    onSuccess: (res) => res.ok ? toast.success(res.message) : toast.warning(res.message),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const busy = webQr.isPending || webPairing.isPending || webDisconnect.isPending;
  const webLabels: Record<string, string> = {
    connecting: "Conectando", reconnecting: "Reconectando", waiting_qr: "Aguardando QR Code",
    waiting_pairing: "Aguardando código", conflict: "Conflito de conexão (440)",
    error: "Erro de conexão", unavailable: "Serviço indisponível", logged_out: "Autenticação necessária",
    disconnecting: "Desconectando", disconnected: "Desconectado",
  };

  return (
    <div className="space-y-7">
      <SectionTitle overline="Integração" title="Conectar WhatsApp" description="Escolha WhatsApp Web para começar em poucos segundos ou use a API oficial da Meta para uma integração empresarial." />

      {isLoading ? <Skeleton className="h-40 w-full" /> : <Card><CardContent className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5"><h3 className="font-heading text-lg font-semibold">Status da conexão</h3>
            {isError ? <StatusDot status="error" label="Não foi possível verificar" /> : status?.connected ? <StatusDot status={status.mode === "official" ? "ok" : "ok"} label={status.mode === "official" ? "Conectado pela API oficial" : "Conectado pelo WhatsApp Web"} /> : <StatusDot status="not_configured" label={webLabels[status?.web_status || "disconnected"] || "Desconectado"} />}
          </div>
          {(status?.connected || (status?.mode === "web" && status.web_status !== "disconnected")) && <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => testSend.mutate()} disabled={!canEdit || testSend.isPending || !status?.connected} className="gap-1.5"><Link2 className="size-3.5" />Testar conexão</Button>
            <Button variant="ghost" size="sm" onClick={() => status.mode === "web" ? webDisconnect.mutate() : disconnect.mutate()} disabled={!canEdit || disconnect.isPending || webDisconnect.isPending} className="gap-1.5 text-destructive hover:text-destructive"><Unplug className="size-3.5" />Desconectar</Button>
          </div>}
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["Número conectado", status?.phone_number || "—"], ["Nome de exibição", status?.display_name || "—"], ["Tipo de conexão", status?.mode === "official" ? "API oficial" : status?.mode === "web" ? "WhatsApp Web" : "Modo teste"], ["Última sincronização", status?.last_sync_at ? new Date(status.last_sync_at).toLocaleString("pt-BR") : "—"]].map(([label, value]) => <div key={label} className="rounded-xl bg-muted/40 px-3.5 py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 truncate text-sm font-medium">{value}</dd></div>)}
        </dl>
        {status?.token_configured && <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />Token da Meta salvo e criptografado. Nunca exibimos o valor novamente.</p>}
        {status?.last_error && <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{status.last_error}</p>}
      </CardContent></Card>}

      <Card><CardContent className="space-y-5 p-6">
        <h3 className="font-heading text-lg font-semibold">Como você quer conectar?</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[{v:"web" as const,t:"WhatsApp Web",d:"Conecte seu número por QR Code ou código de pareamento. Ideal para começar rápido."},{v:"official" as const,t:"API oficial da Meta",d:"Integração oficial para empresas. Requer configuração no Meta for Developers."}].map(o => <button key={o.v} type="button" onClick={() => setChoice(o.v)} disabled={!canEdit} className={cn("rounded-2xl border p-4 text-left transition-colors disabled:opacity-60", choice === o.v ? "border-primary bg-secondary/50" : "border-border hover:bg-muted/40")}><p className="font-heading text-sm font-semibold">{o.t}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{o.d}</p></button>)}
        </div>

        {choice === "web" && <div className="space-y-5 rounded-2xl border bg-muted/20 p-5">
          <div className="flex gap-2"><Button type="button" variant={webMethod === "qr" ? "default" : "outline"} onClick={() => setWebMethod("qr")} className="gap-2"><QrCode className="size-4" />QR Code</Button><Button type="button" variant={webMethod === "pairing" ? "default" : "outline"} onClick={() => setWebMethod("pairing")} className="gap-2"><Smartphone className="size-4" />Número + código</Button></div>
          {webMethod === "qr" ? <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center"><div className="space-y-3"><h4 className="font-semibold">Conectar por QR Code</h4><ol className="space-y-1.5 text-sm text-muted-foreground"><li>1. Clique em <b>Gerar QR Code</b>.</li><li>2. No celular, abra WhatsApp → <b>Dispositivos conectados</b>.</li><li>3. Toque em <b>Conectar dispositivo</b> e escaneie o QR.</li><li>4. Mantenha o celular conectado à internet na primeira sincronização.</li></ol><Button onClick={() => webQr.mutate()} disabled={!canEdit || busy || status?.connected} className="gap-2">{webQr.isPending ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}{["conflict", "error", "logged_out"].includes(status?.web_status || "") ? "Reconectar" : "Gerar QR Code"}</Button></div>{!status?.connected && status?.web_qr ? <div className="rounded-2xl border bg-white p-3 shadow-sm"><img src={status.web_qr} alt="QR Code para conectar WhatsApp" className="size-64" /></div> : <div className="flex size-64 items-center justify-center rounded-2xl border border-dashed text-center text-xs text-muted-foreground">O QR Code aparecerá aqui</div>}</div> : <div className="space-y-4"><h4 className="font-semibold">Conectar pelo número de telefone</h4><p className="text-sm text-muted-foreground">Digite o número completo com código do país. O WhatsApp poderá gerar um código de 8 caracteres para vincular este dispositivo.</p><div className="max-w-md space-y-1.5"><Label htmlFor="pairing-phone">Número do WhatsApp</Label><Input id="pairing-phone" value={pairingPhone} onChange={e => setPairingPhone(e.target.value)} placeholder="5575999999999" disabled={!canEdit || busy} /></div><Button onClick={() => webPairing.mutate()} disabled={!canEdit || busy || status?.connected || pairingPhone.replace(/\D/g, "").length < 10} className="gap-2">{webPairing.isPending ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}Gerar código</Button>{!status?.connected && status?.web_pairing_code && <div className="max-w-md rounded-2xl border bg-background p-5 text-center"><p className="text-xs text-muted-foreground">No WhatsApp: Dispositivos conectados → Conectar dispositivo → Conectar com número de telefone</p><p className="my-3 font-mono text-3xl font-bold tracking-[0.3em]">{status.web_pairing_code}</p><Button variant="outline" size="sm" className="gap-2" onClick={() => { void navigator.clipboard.writeText(status.web_pairing_code); toast.success("Código copiado"); }}><Copy className="size-4" />Copiar código</Button></div>}</div>}
          {status?.web_last_error && <p className="text-sm text-red-700">{status.web_last_error}</p>}
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">WhatsApp Web</Badge><span>Esta opção não usa a API oficial da Meta. Para operação empresarial de longo prazo, prefira a API oficial.</span></div>
        </div>}

        {choice === "official" && <div className="space-y-5">
          <div className="rounded-2xl border bg-muted/20 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2"><CheckCircle2 className="size-5 text-primary" /></div><div><h4 className="font-semibold">Configuração oficial da Meta</h4><p className="mt-1 text-sm text-muted-foreground">Cada empresa conecta o próprio WhatsApp Business. O Atende IA guarda os dados da empresa de forma isolada e criptografada.</p><Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => window.open("https://developers.facebook.com/apps/", "_blank", "noopener,noreferrer")}>Abrir Meta for Developers <ExternalLink className="size-3.5" /></Button></div></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Número do WhatsApp</Label><Input disabled={!canEdit} value={form.phone_number} onChange={e => setForm({...form,phone_number:e.target.value})} placeholder="5575999999999" /></div><div className="space-y-1.5"><Label>Nome de exibição</Label><Input disabled={!canEdit} value={form.display_name} onChange={e => setForm({...form,display_name:e.target.value})} placeholder="Ex.: Bella Estética" /></div><div className="space-y-1.5"><Label>Phone Number ID</Label><Input disabled={!canEdit} value={form.phone_number_id} onChange={e => setForm({...form,phone_number_id:e.target.value})} /><p className="text-xs text-muted-foreground">Meta for Developers → WhatsApp → Configuração da API.</p></div><div className="space-y-1.5"><Label>Token de acesso</Label><Input type="password" disabled={!canEdit} value={form.access_token} onChange={e => setForm({...form,access_token:e.target.value})} placeholder={status?.token_configured ? "Já configurado — preencha para trocar" : "Cole o token"} /></div><div className="space-y-1.5 sm:col-span-2"><Label>Verify Token</Label><Input type="password" disabled={!canEdit} value={form.verify_token} onChange={e => setForm({...form,verify_token:e.target.value})} placeholder="Crie uma palavra-chave forte" /></div></div>
          <Button onClick={() => { if (!form.phone_number_id.trim()) return toast.error("Informe o Phone Number ID."); connectOfficial.mutate(); }} disabled={!canEdit || connectOfficial.isPending} className="gap-2">{connectOfficial.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Validar e conectar API oficial</Button>
          {status?.webhook_url && <div className="rounded-2xl border p-4"><p className="text-sm font-semibold">Webhook da Meta</p><p className="mt-1 text-xs text-muted-foreground">Use este endereço no Callback URL da Meta.</p><div className="mt-2 flex gap-2"><Input readOnly value={status.webhook_url} className="font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => { void navigator.clipboard.writeText(status.webhook_url); toast.success("Webhook copiado"); }}><Copy className="size-4" /></Button></div></div>}
        </div>}
      </CardContent></Card>

      {status?.connected && <Card><CardContent className="space-y-3 p-6"><h3 className="font-heading text-lg font-semibold">Pronto para atender</h3><p className="text-sm text-muted-foreground">Mensagens recebidas podem entrar na central de conversas e, quando a IA estiver ativa, receber respostas automáticas.</p></CardContent></Card>}
    </div>
  );
}
