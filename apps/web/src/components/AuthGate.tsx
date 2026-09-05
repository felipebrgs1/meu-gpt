import { useState } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { mintDevToken } from "../lib/api";

// Gate single-user: pede o setupSecret (JWT_SECRET) e troca por Bearer token.
export function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function enter() {
    if (!secret.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      await mintDevToken(secret.trim());
      onAuth();
    } catch {
      setErr("setupSecret inválido. Confira o JWT_SECRET do Worker.");
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
              <Sparkle className="size-5" />
            </div>
            <CardTitle className="text-xl">meu-gpt</CardTitle>
          </div>
          <CardDescription>Cole seu setupSecret (JWT_SECRET) para entrar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="setup">setupSecret</Label>
            <Input
              id="setup"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enter()}
              placeholder="Cole seu JWT_SECRET..."
              className="mt-1"
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
              <>Entrar no meu-gpt</>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
