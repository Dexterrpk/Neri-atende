import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare, Plus, Search, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Conversation, Customer, Ok } from "@/lib/types";

const EMPTY = { name: "", phone: "", email: "", notes: "", last_purchase_value: "" };

function formatDate(value: string | null) {
  if (!value) return "Sem interação";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Customers() {
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const canDelete = me?.user.role === "OWNER" || me?.user.role === "ADMIN";

  const { data: customers, isLoading, isError } = useQuery<Customer[]>({
    queryKey: ["customers", search],
    queryFn: () => apiGet<Customer[]>(`/customers?search=${encodeURIComponent(search)}`),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<Customer>("/customers", {
        name: form.name,
        phone: form.phone,
        email: form.email,
        notes: form.notes,
        tags: [],
        last_purchase_value: Number(form.last_purchase_value.replace(",", ".")) || 0,
      }),
    onSuccess: () => {
      toast.success("Cliente cadastrado");
      setOpen(false);
      setForm({ ...EMPTY });
      invalidate("customers", "dashboard", "recovery-targets");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/customers/${id}`),
    onSuccess: () => {
      toast.success("Cliente removido");
      invalidate("customers", "dashboard", "recovery-targets");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const startChat = useMutation({
    mutationFn: (id: string) => apiPost<Conversation>(`/conversations/start/${id}`),
    onSuccess: (conv) => {
      invalidate("conversations");
      navigate(`/app/conversas?id=${conv.id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle
          overline="Clientes"
          title="Sua base de clientes"
          description="Cada cliente guarda histórico, última interação e valor da última compra — é o que alimenta a recuperação."
        />
        <Button onClick={() => setOpen(true)} className="w-fit gap-2" data-testid="customers-new-button">
          <Plus className="size-4" />
          Novo cliente
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="pl-9"
          data-testid="customers-search-input"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Users}
          title="Não foi possível carregar seus clientes"
          description="Verifique sua conexão e tente novamente em instantes."
          testId="customers-error-state"
        />
      ) : !customers || customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "Nenhum cliente encontrado" : "Você ainda não tem clientes cadastrados"}
          description={
            search
              ? "Tente buscar por outro nome ou telefone."
              : "Cadastre um cliente manualmente ou conecte o WhatsApp: quem mandar mensagem entra aqui automaticamente."
          }
          action={
            !search ? (
              <Button onClick={() => setOpen(true)} className="gap-2" data-testid="customers-empty-cta">
                <Plus className="size-4" />
                Cadastrar primeiro cliente
              </Button>
            ) : undefined
          }
          testId="customers-empty-state"
        />
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <Card key={c.id} data-testid={`customer-card-${c.id}`}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-heading font-bold text-secondary-foreground">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-heading font-semibold" data-testid={`customer-name-${c.id}`}>
                      {c.name}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{c.phone}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Badge variant="outline">{c.origin === "whatsapp" ? "Via WhatsApp" : c.origin === "exemplo" ? "Exemplo" : "Cadastro manual"}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Última interação: {formatDate(c.last_interaction_at)}
                      </span>
                      {c.last_purchase_value > 0 && (
                        <span className="text-xs text-muted-foreground">
                          · Última compra:{" "}
                          {c.last_purchase_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startChat.mutate(c.id)}
                    disabled={startChat.isPending}
                    className="gap-1.5"
                    data-testid={`customer-chat-${c.id}`}
                  >
                    <MessageSquare className="size-3.5" />
                    Abrir conversa
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(c.id)}
                      className="gap-1.5 text-destructive hover:text-destructive"
                      data-testid={`customer-delete-${c.id}`}
                    >
                      <Trash2 className="size-3.5" />
                      Remover
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nome</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="customer-form-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Telefone / WhatsApp</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999990000" data-testid="customer-form-phone" />
              <p className="text-xs text-muted-foreground">Use o formato com código do país, sem espaços.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">E-mail (opcional)</Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="customer-form-email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-value">Valor da última compra (opcional)</Label>
              <Input id="c-value" inputMode="decimal" value={form.last_purchase_value} onChange={(e) => setForm({ ...form, last_purchase_value: e.target.value })} placeholder="180,00" data-testid="customer-form-value" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Observações (opcional)</Label>
              <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="customer-form-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="customer-form-cancel">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!form.name.trim() || form.phone.trim().length < 8) {
                  toast.error("Informe o nome e um telefone válido.");
                  return;
                }
                create.mutate();
              }}
              disabled={create.isPending}
              className="gap-2"
              data-testid="customer-form-save"
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Cadastrar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
