import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

interface HealthOut {
  status: string;
  database: string;
}

// Backend probe used to know whether the API is reachable — never blocks render.
const fetchHealth = () => apiGet<HealthOut>("/health");

export default function Home() {
  const { data } = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });
  const ok = data?.status === "ok";

  return (
    <div
      data-testid="home-splash"
      className="flex min-h-svh flex-col items-center justify-center bg-[#0f0f10] text-white"
    >
      <div className="text-2xl font-semibold tracking-tight">Atende IA</div>
      <p className="mt-3 text-sm opacity-70">
        {ok ? "API online" : "Aguardando conexão com a API…"}
      </p>
      <a
        href="/"
        className="mt-6 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
        data-testid="home-open-landing"
      >
        Abrir landing
      </a>
    </div>
  );
}
