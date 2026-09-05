import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { changeCredentials } from "../../lib/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  username: string;
}

// Conta: troca o usuário e/ou a senha a qualquer momento (exige a senha atual).
export function AccountDialog({ open, onOpenChange, username }: Props) {
  const [name, setName] = useState(username);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(username);
      setCurrent("");
      setNext("");
      setConfirm("");
      setErr("");
      setOk("");
    }
  }, [open, username]);

  async function submit() {
    if (busy) return;
    const newName = name.trim();
    const wantsName = newName && newName !== username;
    const wantsPass = !!next || !!confirm;
    if (!current) {
      setErr("informe a senha atual.");
      return;
    }
    if (!wantsName && !wantsPass) {
      setErr("altere o usuário e/ou preencha a nova senha.");
      return;
    }
    if (wantsName && (newName.length < 2 || newName.length > 50)) {
      setErr("o usuário precisa de 2 a 50 caracteres.");
      return;
    }
    if (wantsPass) {
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
    }
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const out = await changeCredentials({
        currentPassword: current,
        ...(wantsName ? { newUsername: newName } : {}),
        ...(wantsPass ? { newPassword: next } : {}),
      });
      setOk(`salvo${out.username ? ` — usuário atual: ${out.username}` : ""}.`);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Conta</DialogTitle>
          <DialogDescription>
            Troque seu usuário e/ou senha. A senha atual é sempre exigida.
            {username ? ` Usuário atual: ${username}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="acc-user">usuário</Label>
            <Input
              id="acc-user"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="usuário"
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-cur">senha atual</Label>
            <Input
              id="acc-cur"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="senha atual"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-next">nova senha (opcional, mín. 8)</Label>
            <Input
              id="acc-next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="deixe vazio para manter"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-confirm">confirmar nova senha</Label>
            <Input
              id="acc-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="repita a nova senha"
              autoComplete="new-password"
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          {ok && <p className="text-xs text-emerald-500">{ok}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={submit} disabled={busy} className="gap-2">
            {busy ? (
              <>
                <Spinner /> Salvando…
              </>
            ) : (
              <>Salvar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
