import { useState } from "react";
import { OracleIcon } from "./OracleIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { changePassword } from "../lib/api";
import { BRANDING } from "../branding.gen.js";

// Tela obrigatória da 1ª sessão: troca a senha default (user/123456).
// Bloqueia o app até concluir — a API também barra tudo com 403
// password_change_required enquanto a troca não acontece.
export function ChangePasswordCard({ currentHint, onDone }: { currentHint: string; onDone: () => void }) {
  const [current, setCurrent] = useState(currentHint);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (!current || !next || !confirm) {
      setErr("preencha os três campos.");
      return;
    }
    if (next.length < 8) {
      setErr("a nova senha precisa de ao menos 8 caracteres.");
      return;
    }
    if (next !== confirm) {
      setErr("a confirmação não confere.");
      return;
    }
    if (next === current) {
      setErr("a nova senha precisa ser diferente da atual.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await changePassword(current, next);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "não foi possível trocar a senha.");
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
          <CardDescription>
            Por segurança, troque a senha inicial antes de usar o app. A senha padrão não pode ser mantida.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cur">senha atual</Label>
            <Input
              id="cur"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="senha atual"
              className="mt-1"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">nova senha (mín. 8 caracteres)</Label>
            <Input
              id="next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="nova senha"
              className="mt-1"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">confirmar nova senha</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="repita a nova senha"
              className="mt-1"
              autoComplete="new-password"
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </CardContent>
        <CardFooter>
          <Button onClick={submit} disabled={busy} className="w-full gap-2">
            {busy ? (
              <>
                <Spinner /> Salvando…
              </>
            ) : (
              <>Trocar senha e entrar</>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
