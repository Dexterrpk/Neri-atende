import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, SectionTitle, Skeleton } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useInvalidate } from "@/hooks/useApp";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { KnowledgeItem, Ok } from "@/lib/types";

const KINDS = {
  informacao: "Informação geral",
  faq: "Pergunta frequente",
  politica: "Política / regra",
  horario: "Horários",
  endereco: "Endereço e localização",
  pagamento: "Formas de pagamento",
};

const SUGGESTIONS = [
  { kind: "horario", title: "Horário de funcionamento", content: "Segunda a sexta das 9h às 18h. Sábado das 9h às 13h." },
  { kind: "pagamento", title: "Formas de pagamento", content: "Aceitamos Pix, dinheiro, débito e crédito." },
  { kind: "politica", title: "Política de cancelamento", content: "Cancelamentos com até 24h de antecedência não têm custo." },
  { kind: "endereco", title: "Como chegar", content: "Estamos na Rua …, nº …. Há estacionamento na rua." },
];

const EMPTY = { kind: "informacao", title: "", content: "", active: true };

export default function Knowledge() {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: items, isLoading, isError } = useQuery<KnowledgeItem[]>({
    queryKey: ["knowledge"],
    queryFn: () => apiGet<KnowledgeItem[]>("/knowledge"),
    retry: false,
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? apiPut<KnowledgeItem>(`/knowledge/${editing.id}`, form)
        : apiPost<KnowledgeItem>("/knowledge", form),
    onSuccess: () => {
      toast.success(editing ? "Informação atualizada" : "Pronto! Sua IA já sabe disso.");
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      invalidate("knowledge", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/knowledge/${id}`),
    onSuccess: () => {
      toast.success("Informação removida");
      invalidate("knowledge", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  function openNew(preset?: typeof EMPTY | (typeof SUGGESTIONS)[number]) {
    setEditing(null);
    setForm(preset ? { ...EMPTY, ...preset } : { ...EMPTY });
    setOpen(true);
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle
          overline="Base de conhecimento"
          title="Ensine sua IA"
          description="Tudo que você escreve aqui a sua IA passa a usar nas respostas. O que não estiver aqui ela não responde: ela diz que vai confirmar."
        />
        <Button onClick={() => openNew()} className="w-fit gap-2" data-testid="knowledge-new-button">
          <Plus className="size-4" />
          Ensinar algo novo
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={BookOpen}
          title="Não foi possível carregar as informações"
          description="Verifique sua conexão e tente novamente em instantes."
          testId="knowledge-error-state"
        />
      ) : !items || items.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon={BookOpen}
            title="Sua IA ainda não sabe nada sobre o negócio"
            description="Comece por uma informação que seus clientes sempre perguntam. Quanto mais você ensinar, melhor ela atende — e menos chance ela tem de dizer que não sabe."
            action={
              <Button onClick={() => openNew()} className="gap-2" data-testid="knowledge-empty-cta">
                <Plus className="size-4" />
                Ensinar a primeira informação
              </Button>
            }
            testId="knowledge-empty-state"
          />
          <div className="space-y-3">
            <h3 className="font-heading text-sm font-semibold text-muted-foreground">
              Sugestões para começar rápido
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => openNew(s)}
                  className="rounded-2xl border border-dashed border-border bg-card p-4 text-left transition-colors duration-150 hover:border-primary hover:bg-secondary/40"
                  data-testid={`knowledge-suggestion-${s.kind}`}
                >
                  <p className="font-heading text-sm font-semibold">{s.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.content}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} data-testid={`knowledge-card-${item.id}`}>
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-semibold" data-testid={`knowledge-title-${item.id}`}>
                      {item.title}
                    </h3>
                    <Badge variant="secondary">{KINDS[item.kind as keyof typeof KINDS] ?? item.kind}</Badge>
                    {!item.active && <Badge variant="outline">Desativada</Badge>}
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{item.content}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(item);
                      setForm({ kind: item.kind, title: item.title, content: item.content, active: item.active });
                      setOpen(true);
                    }}
                    className="gap-1.5"
                    data-testid={`knowledge-edit-${item.id}`}
                  >
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(item.id)}
                    className="gap-1.5 text-destructive hover:text-destructive"
                    data-testid={`knowledge-delete-${item.id}`}
                  >
                    <Trash2 className="size-3.5" />
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Envio de documentos (PDF, planilhas) e leitura de páginas da web já estão previstos na
        arquitetura, mas ainda não estão disponíveis nesta versão. Por enquanto, cole o conteúdo
        como texto.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar informação" : "Ensinar sua IA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo de informação</Label>
              <Select value={form.kind} onValueChange={(v: string) => setForm({ ...form, kind: v })}>
                <SelectTrigger data-testid="knowledge-form-kind">
                  <SelectValue>{(v) => KINDS[v as keyof typeof KINDS]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KINDS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-title">Sobre o que é?</Label>
              <Input id="k-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Política de cancelamento" data-testid="knowledge-form-title" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-content">O que a IA deve saber?</Label>
              <Textarea id="k-content" rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} data-testid="knowledge-form-content" />
              <p className="text-xs text-muted-foreground">Escreva como você explicaria a um cliente.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-emerald-600"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                data-testid="knowledge-form-active"
              />
              Ativa — a IA pode usar esta informação
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="knowledge-form-cancel">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!form.title.trim() || !form.content.trim()) {
                  toast.error("Preencha o título e o conteúdo.");
                  return;
                }
                save.mutate();
              }}
              disabled={save.isPending}
              className="gap-2"
              data-testid="knowledge-form-save"
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Salvar alterações" : "Ensinar minha IA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
