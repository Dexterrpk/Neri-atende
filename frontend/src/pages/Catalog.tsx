import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
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
import type { Ok, Product } from "@/lib/types";

const KINDS = { produto: "Produto", servico: "Serviço" };
const AVAILABILITY = { disponivel: "Disponível", sob_encomenda: "Sob encomenda", esgotado: "Esgotado" };

const EMPTY = {
  name: "",
  description: "",
  price: "",
  promo_price: "",
  category: "",
  image_url: "",
  availability: "disponivel",
  extra_info: "",
  kind: "servico",
  active: true,
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Catalog() {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: products, isLoading, isError } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => apiGet<Product[]>("/products"),
    retry: false,
  });

  function payload() {
    return {
      name: form.name,
      description: form.description,
      price: Number(form.price.replace(",", ".")) || 0,
      promo_price: form.promo_price.trim() ? Number(form.promo_price.replace(",", ".")) : null,
      category: form.category,
      image_url: form.image_url,
      availability: form.availability,
      extra_info: form.extra_info,
      kind: form.kind,
      active: form.active,
    };
  }

  const save = useMutation({
    mutationFn: () =>
      editing ? apiPut<Product>(`/products/${editing.id}`, payload()) : apiPost<Product>("/products", payload()),
    onSuccess: () => {
      toast.success(editing ? "Item atualizado" : "Item adicionado ao catálogo");
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      invalidate("products", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const toggle = useMutation({
    mutationFn: (item: Product) =>
      apiPut<Product>(`/products/${item.id}`, {
        name: item.name,
        description: item.description,
        price: item.price,
        promo_price: item.promo_price,
        category: item.category,
        image_url: item.image_url,
        availability: item.availability,
        extra_info: item.extra_info,
        kind: item.kind,
        active: !item.active,
      }),
    onSuccess: () => {
      invalidate("products", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/products/${id}`),
    onSuccess: () => {
      toast.success("Item removido");
      invalidate("products", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  }

  function openEdit(item: Product) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description,
      price: String(item.price ?? ""),
      promo_price: item.promo_price != null ? String(item.promo_price) : "",
      category: item.category,
      image_url: item.image_url,
      availability: item.availability || "disponivel",
      extra_info: item.extra_info,
      kind: item.kind || "servico",
      active: item.active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle
          overline="Catálogo"
          title="Produtos e serviços"
          description="Sua IA só pode falar de itens e preços que estejam cadastrados aqui. Isso é o que garante que ela nunca invente um valor."
        />
        <Button onClick={openNew} className="w-fit gap-2" data-testid="catalog-new-button">
          <Plus className="size-4" />
          Adicionar item
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Package}
          title="Não foi possível carregar o catálogo"
          description="Verifique sua conexão e tente novamente em instantes."
          testId="catalog-error-state"
        />
      ) : !products || products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Seu catálogo está vazio"
          description="Cadastre seu primeiro produto ou serviço com nome, preço e o que está incluso. A partir daí sua IA já consegue apresentá-lo aos clientes."
          action={
            <Button onClick={openNew} className="gap-2" data-testid="catalog-empty-cta">
              <Plus className="size-4" />
              Adicionar meu primeiro item
            </Button>
          }
          testId="catalog-empty-state"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((item) => (
            <Card key={item.id} className={item.active ? "" : "opacity-60"} data-testid={`catalog-card-${item.id}`}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <h3 className="truncate font-heading font-semibold" data-testid={`catalog-name-${item.id}`}>
                      {item.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{KINDS[item.kind as keyof typeof KINDS] ?? item.kind}</Badge>
                      {item.category && <Badge variant="outline">{item.category}</Badge>}
                      <Badge variant={item.active ? "default" : "secondary"}>{item.active ? "Ativo" : "Inativo"}</Badge>
                    </div>
                  </div>
                </div>

                {item.description && (
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                )}

                <div className="flex items-baseline gap-2">
                  {item.promo_price != null ? (
                    <>
                      <span className="font-heading text-xl font-bold text-primary" data-testid={`catalog-price-${item.id}`}>
                        {money(item.promo_price)}
                      </span>
                      <span className="text-sm text-muted-foreground line-through">{money(item.price)}</span>
                    </>
                  ) : (
                    <span className="font-heading text-xl font-bold" data-testid={`catalog-price-${item.id}`}>
                      {money(item.price)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {AVAILABILITY[item.availability as keyof typeof AVAILABILITY] ?? item.availability}
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)} className="gap-1.5" data-testid={`catalog-edit-${item.id}`}>
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggle.mutate(item)} data-testid={`catalog-toggle-${item.id}`}>
                    {item.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(item.id)}
                    className="gap-1.5 text-destructive hover:text-destructive"
                    data-testid={`catalog-delete-${item.id}`}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar item" : "Adicionar produto ou serviço"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-name">Nome</Label>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="catalog-form-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v: string) => setForm({ ...form, kind: v })}>
                <SelectTrigger data-testid="catalog-form-kind">
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
              <Label htmlFor="p-cat">Categoria</Label>
              <Input id="p-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex.: Facial" data-testid="catalog-form-category" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Preço (R$)</Label>
              <Input id="p-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="180,00" data-testid="catalog-form-price" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-promo">Preço promocional (opcional)</Label>
              <Input id="p-promo" inputMode="decimal" value={form.promo_price} onChange={(e) => setForm({ ...form, promo_price: e.target.value })} data-testid="catalog-form-promo" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-desc">Descrição — o que está incluso?</Label>
              <Textarea id="p-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="catalog-form-description" />
            </div>
            <div className="space-y-1.5">
              <Label>Disponibilidade</Label>
              <Select value={form.availability} onValueChange={(v: string) => setForm({ ...form, availability: v })}>
                <SelectTrigger data-testid="catalog-form-availability">
                  <SelectValue>{(v) => AVAILABILITY[v as keyof typeof AVAILABILITY]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AVAILABILITY).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-img">Link da imagem (opcional)</Label>
              <Input id="p-img" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" data-testid="catalog-form-image" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-extra">Informações adicionais (opcional)</Label>
              <Textarea id="p-extra" rows={2} value={form.extra_info} onChange={(e) => setForm({ ...form, extra_info: e.target.value })} placeholder="Ex.: Requer avaliação prévia." data-testid="catalog-form-extra" />
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="size-4 accent-emerald-600"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                data-testid="catalog-form-active"
              />
              Item ativo — a IA pode apresentá-lo aos clientes
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="catalog-form-cancel">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("Informe o nome do item.");
                  return;
                }
                save.mutate();
              }}
              disabled={save.isPending}
              className="gap-2"
              data-testid="catalog-form-save"
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Salvar alterações" : "Adicionar ao catálogo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
