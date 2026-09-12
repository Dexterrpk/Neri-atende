import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import Admin from "@/pages/Admin";
import { AccountToken, ForgotPassword, Login, Register } from "@/pages/Auth";
import Catalog from "@/pages/Catalog";
import Config from "@/pages/Config";
import Conversations from "@/pages/Conversations";
import Customers from "@/pages/Customers";
import Dashboard from "@/pages/Dashboard";
import Knowledge from "@/pages/Knowledge";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/NotFound";
import Onboarding from "@/pages/Onboarding";
import Recovery from "@/pages/Recovery";
import Sandbox from "@/pages/Sandbox";
import Schedule from "@/pages/Schedule";
import UsageAndTeam from "@/pages/UsageAndTeam";
import WhatsApp from "@/pages/WhatsApp";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<AccountToken />} />
        <Route path="/verificar-email" element={<AccountToken verify />} />
        <Route path="/onboarding" element={<Onboarding />} />

        <Route path="/app" element={<AppShell><Dashboard /></AppShell>} />
        <Route path="/app/conversas" element={<AppShell><Conversations /></AppShell>} />
        <Route path="/app/clientes" element={<AppShell><Customers /></AppShell>} />
        <Route path="/app/catalogo" element={<AppShell><Catalog /></AppShell>} />
        <Route path="/app/conhecimento" element={<AppShell><Knowledge /></AppShell>} />
        <Route path="/app/recuperacao" element={<AppShell><Recovery /></AppShell>} />
        <Route path="/app/agenda" element={<AppShell><Schedule /></AppShell>} />
        <Route path="/app/testar" element={<AppShell><Sandbox /></AppShell>} />
        <Route path="/app/configuracao" element={<AppShell><Config /></AppShell>} />
        <Route path="/app/whatsapp" element={<AppShell><WhatsApp /></AppShell>} />
        <Route path="/app/uso" element={<AppShell><UsageAndTeam /></AppShell>} />

        <Route path="/configurações" element={<Navigate to="/app/configuracao" replace />} />
        <Route path="/configuracoes" element={<Navigate to="/app/configuracao" replace />} />
        <Route path="/app/configuracoes" element={<Navigate to="/app/configuracao" replace />} />
        <Route path="/admin" element={<Admin />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </>
  );
}
