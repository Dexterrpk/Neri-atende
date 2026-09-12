import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Logo, NeriCredit } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage, useMe } from "@/hooks/useApp";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { Me, Ok } from "@/lib/types";

const PROMISES = [
  "Responde clientes a qualquer hora com as suas informações",
  "Apresenta produtos e serviços e conduz a venda",
  "Recupera clientes que pararam de comprar",
  "Você assume a conversa quando quiser",
];

function AuthLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[0.95fr_1.05fr]">
      <div className="grid-texture relative hidden flex-col justify-between bg-gradient-to-br from-[#064E3B] to-[#0F172A] p-10 lg:flex">
        <Link to="/" className="text-white">
          <Logo />
        </Link>
        <div className="space-y-7">
          <h2 className="max-w-sm font-heading text-[2.1rem] font-extrabold leading-tight text-white">
            Seu atendente e vendedor inteligente no WhatsApp.
          </h2>
          <ul className="space-y-3">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-emerald-100/90">
                <BadgeCheck className="mt-0.5 size-4.5 shrink-0 text-emerald-400" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <NeriCredit className="text-emerald-200/70" />
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-7">
          <div className="space-y-4">
            <Link to="/" className="inline-flex lg:hidden">
              <Logo />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              data-testid="auth-back-link"
            >
              <ArrowLeft className="size-4" />
              Voltar ao site
            </Link>
            <div className="space-y-1.5">
              <h1 className="font-heading text-3xl font-bold">{title}</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {children}
          <NeriCredit className="lg:hidden" />
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });

  const login = useMutation({
    mutationFn: () => apiPost<Me>("/auth/login", form),
    onSuccess: (data) => {
      beginSession();
      toast.success(`Bem-vindo de volta, ${data.user.name.split(" ")[0]}!`);
      navigate(data.company.onboarding_done ? "/app" : "/onboarding", { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Não foi possível entrar.")),
  });

  if (!isLoading && me) return <Navigate to="/app" replace />;

  return (
    <AuthLayout title="Entrar na sua conta" subtitle="Acesse o painel do seu atendente inteligente.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
        data-testid="login-form"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="voce@suaempresa.com"
            data-testid="login-email-input"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to="/esqueci-senha" className="text-xs font-semibold text-primary hover:underline" data-testid="login-forgot-link">
              Esqueci minha senha
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            data-testid="login-password-input"
          />
        </div>
        <Button type="submit" className="w-full gap-2" disabled={login.isPending} data-testid="login-submit-button">
          {login.isPending && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link to="/cadastro" className="font-semibold text-primary hover:underline" data-testid="login-register-link">
          Criar conta gratuita
        </Link>
      </p>
    </AuthLayout>
  );
}

export function Register() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: "", name: "", email: "", password: "" });

  const register = useMutation({
    mutationFn: () => apiPost<Me>("/auth/register", form),
    onSuccess: () => {
      beginSession();
      toast.success("Conta criada! Vamos configurar sua IA.");
      navigate("/onboarding", { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Não foi possível criar a conta.")),
  });

  if (!isLoading && me) return <Navigate to="/app" replace />;

  return (
    <AuthLayout
      title="Criar sua conta"
      subtitle="Em seguida um passo a passo guiado configura sua IA. Leva poucos minutos."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate();
        }}
        data-testid="register-form"
      >
        <div className="space-y-1.5">
          <Label htmlFor="company_name">Nome da sua empresa</Label>
          <Input
            id="company_name"
            required
            minLength={2}
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            placeholder="Ex.: Bella Estética"
            data-testid="register-company-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Seu nome</Label>
          <Input
            id="name"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex.: Camila Ribeiro"
            data-testid="register-name-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-email">E-mail</Label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="voce@suaempresa.com"
            data-testid="register-email-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-password">Senha</Label>
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Mínimo de 8 caracteres"
            data-testid="register-password-input"
          />
          <p className="text-xs text-muted-foreground">Use ao menos 8 caracteres.</p>
        </div>
        <Button type="submit" className="w-full gap-2" disabled={register.isPending} data-testid="register-submit-button">
          {register.isPending && <Loader2 className="size-4 animate-spin" />}
          Criar conta gratuita
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/login" className="font-semibold text-primary hover:underline" data-testid="register-login-link">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const request = useMutation({
    mutationFn: () => apiPost<Ok>("/auth/forgot-password", { email }),
    onSuccess: (data) => {
      setSent(true);
      toast.success(data.message);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <AuthLayout
      title="Recuperar acesso"
      subtitle="Informe seu e-mail e enviaremos as instruções para criar uma nova senha."
    >
      {sent ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6" data-testid="forgot-sent-panel">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Se este e-mail estiver cadastrado, as instruções de redefinição serão enviadas.
          </p>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
            <strong>Atenção do administrador:</strong> o envio de e-mails depende de um servidor SMTP
            configurado no painel da plataforma. Enquanto isso não estiver configurado, o e-mail não é
            entregue e a redefinição precisa ser feita por um administrador.
          </p>
          <Link to="/login" className="text-sm font-semibold text-primary hover:underline" data-testid="forgot-back-login">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
          data-testid="forgot-form"
        >
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">E-mail cadastrado</Label>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@suaempresa.com"
              data-testid="forgot-email-input"
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={request.isPending} data-testid="forgot-submit-button">
            {request.isPending && <Loader2 className="size-4 animate-spin" />}
            Enviar instruções
          </Button>
          <Link to="/login" className="block text-sm text-muted-foreground hover:text-foreground" data-testid="forgot-login-link">
            Voltar para o login
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}


export function AccountToken({ verify = false }: { verify?: boolean }) {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const token = params.get("token") || "";
  const action = useMutation({
    mutationFn: () => apiPost<Ok>(verify ? "/auth/verify-email/confirm" : "/auth/reset-password",
      verify ? { token } : { token, password }),
    onSuccess: result => { setDone(true); toast.success(result.message); },
    onError: err => toast.error(apiErrorMessage(err)),
  });
  return <AuthLayout title={verify ? "Confirmar e-mail" : "Criar nova senha"} subtitle="Conclua a solicitação da sua conta.">
    {done ? <Link to="/login" className="text-primary">Continuar para o login</Link> :
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); action.mutate(); }}>
        {!verify && <div className="space-y-2"><Label htmlFor="new-password">Nova senha</Label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required
            value={password} onChange={e => setPassword(e.target.value)} /></div>}
        <Button type="submit" disabled={!token || action.isPending}>{verify ? "Confirmar e-mail" : "Salvar nova senha"}</Button>
        {!token && <p>Link inválido. Solicite um novo e-mail.</p>}
      </form>}
  </AuthLayout>;
}
