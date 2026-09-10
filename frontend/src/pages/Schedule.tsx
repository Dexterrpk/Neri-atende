import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, SectionTitle, Skeleton } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage, useInvalidate } from "@/hooks/useApp";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Appointment, Ok } from "@/lib/types";

const EMPTY = { customer_name: "", customer_phone: "", service: "", starts_at: "", duration_minutes: 60, professional: "" };

export default function Schedule() {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: appointments, isLoading, isError } = useQuery<Appointment[]>({
    queryKey: ["appointments"],
    queryFn: () => apiGet<Appointment[]>("/appointments"),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<Appointment>("/appointments", {
        ...form,
        starts_at: new Date(form.starts_at).toISOString(),
        duration_minutes: Number(form.duration_minutes) || 60,
      }),
    onSuccess: () => {
      toast.success("Agendamento criado");
      setOpen(false);
      setForm({ ...EMPTY });
      invalidate("appointments", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/appointments/${id}`),
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      invalidate("appointments", "dashboard");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle
          overline="Agenda"
          title="Agendamentos"
          description="Quando a IA identifica interesse em agendar, ela registra a preferência do cliente e sua equipe confirma aqui."
        />
        <Button onClick={() => setOpen(true)} className="w-fit gap-2" data-testid="schedule-new-button">
          <Plus className="size-4" />
          Novo agendamento
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState icon={CalendarClock} title="Não foi possível carregar a agenda" description="Verifique sua conexão e tente novamente." testId="schedule-error-state" />
      ) : !appointments || appointments.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhum agendamento ainda"
          description="Crie um agendamento manualmente ou ative o agendamento na configuração da IA para que ela colete as preferências dos clientes."
          action={
            <Button onClick={() => setOpen(true)} className="gap-2" data-testid="schedule-empty-cta">
              <Plus className="size-4" />
              Criar primeiro agendamento
            </Button>
          }
          testId="schedule-empty-state"
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <Card key={a.id} className={a.status === "cancelado" ? "opacity-60" : ""} data-testid={`appointment-card-${a.id}`}>
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading font-semibold" data-testid={`appointment-name-${a.id}`}>{a.customer_name}</p>
                    <Badge variant={a.status === "cancelado" ? "secondary" : "default"}>
                      {a.status === "cancelado" ? "Cancelado" : "Confirmado"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {a.service || "Atendimento"} · {a.duration_minutes} min
                    {a.professional ? ` · ${a.professional}` : ""}
                  </p>
                  <p className="text-sm font-medium">
                    {new Date(a.starts_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {a.status !== "cancelado" && (
                  <Button variant="ghost" size="sm" onClick={() => cancel.mutate(a.id)} className="w-fit gap-1.5 text-destructive hover:text-destructive" data-testid={`appointment-cancel-${a.id}`}>
                    <Trash2 className="size-3.5" />
                    Cancelar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo agendamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="a-name">Nome do cliente</Label>
              <Input id="a-name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} data-testid="schedule-form-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-phone">Telefone</Label>
              <Input id="a-phone" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} data-testid="schedule-form-phone" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-service">Serviço</Label>
              <Input id="a-service" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} data-testid="schedule-form-service" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-when">Data e hora</Label>
              <Input id="a-when" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} data-testid="schedule-form-datetime" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-duration">Duração (minutos)</Label>
              <Input id="a-duration" type="number" min={5} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} data-testid="schedule-form-duration" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="a-pro">Profissional (opcional)</Label>
              <Input id="a-pro" value={form.professional} onChange={(e) => setForm({ ...form, professional: e.target.value })} data-testid="schedule-form-professional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="schedule-form-cancel">Cancelar</Button>
            <Button
              onClick={() => {
                if (!form.customer_name.trim() || !form.starts_at) {
                  toast.error("Informe o nome do cliente e a data/hora.");
                  return;
                }
                create.mutate();
              }}
              disabled={create.isPending}
              className="gap-2"
              data-testid="schedule-form-save"
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Criar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
