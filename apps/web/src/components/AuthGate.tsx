import { useState } from "react";
import { OracleIcon } from "./OracleIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { login } from "../lib/api";
import { BRANDING } from "../branding.gen.js";

// Gate single-user: usuário + senha (hardcoded na API) trocados por token de sessão.
export function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [user, setUser] = useState("user"); // default = LOGIN_USER da API
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function enter() {
    if (!user.trim() || !pass || busy) return;
    setBusy(true);
    setErr("");
    try {
      await login(user.trim(), pass);
      onAuth();
    } catch {
      setErr("usuário ou senha inválidos.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border/60 shadow-xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              <OracleIcon className="size-5" />
            </div>
            <CardTitle className="text-xl">{BRANDING.name}</CardTitle>
          </div>
          <CardDescription>Entre com seu usuário e senha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="user">usuário</Label>
            <Input
              id="user"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enter()}
              placeholder="usuário"
              className="mt-1"
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pass">senha</Label>
            <Input
              id="pass"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enter()}
              placeholder="senha"
              className="mt-1"
              autoComplete="current-password"
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </CardContent>
        <CardFooter>
          <Button onClick={enter} disabled={busy} className="w-full gap-2">
            {busy ? (
              <>
                <Spinner /> Entrando…
              </>
            ) : (
              <>Entrar no {BRANDING.name}</>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
