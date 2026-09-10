import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { Logo, NeriCredit } from "@/components/Brand";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-8 text-center">
          <Logo className="justify-center" />
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Compass className="size-6" />
          </span>
          <div className="space-y-1.5">
            <h1 className="font-heading text-2xl font-bold">Página não encontrada</h1>
            <p className="text-sm leading-relaxed text-muted-foreground" data-testid="notfound-message">
              O endereço que você tentou abrir não existe. Talvez o link esteja incompleto.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/" className={buttonVariants({ variant: "outline" })} data-testid="notfound-home-link">
              Ir para o site
            </Link>
            <Link to="/app" className={buttonVariants()} data-testid="notfound-app-link">
              Abrir meu painel
            </Link>
          </div>
          <NeriCredit />
        </CardContent>
      </Card>
    </div>
  );
}
