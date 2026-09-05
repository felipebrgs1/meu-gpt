import { CaretDown, Check, Database, Globe, Link } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { BRANDING } from "../../branding.gen.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DocRecord } from "../../lib/api";
import { SLOTS, type Slot } from "../../lib/slots";

interface Props {
  slot: Slot;
  onSlot: (s: Slot) => void;
  docs: DocRecord[];
  sourceIds: string[];
  onSourceIds: (ids: string[]) => void;
  busy: boolean;
  // Deep link da conversa aberta (null = ainda sem id): mostra copiar-link.
  shareable: boolean;
  linkCopied: boolean;
  onCopyLink: () => void;
}

// Header estilo ChatGPT: hamburger (expande/colapsa a sidebar) + nome + slot.
// À direita: link da conversa + seletor de fontes RAG + status de stream.
export function ChatHeader({ slot, onSlot, docs, sourceIds, onSourceIds, busy, shareable, linkCopied, onCopyLink }: Props) {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" title="Alternar barra lateral" />
        <span className="hidden min-[420px]:inline text-sm font-semibold tracking-tight text-foreground/90 select-none">
          {BRANDING.name}
        </span>
        <ToggleGroup
          value={[slot]}
          onValueChange={(v) => {
            const last = v[v.length - 1];
            if (last) onSlot(last as Slot);
          }}
          variant="outline"
          size="sm"
          className="bg-muted/40 p-0.5 rounded-lg border-border/50"
        >
          {SLOTS.map((s) => (
            <ToggleGroupItem key={s.id} value={s.id} aria-label={s.hint} className="gap-1.5 text-xs px-2.5 py-1">
              <s.icon className="size-3.5" />
              <span className="font-medium">{s.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-3">
        {shareable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onCopyLink}
            title="copiar link da conversa"
          >
            {linkCopied ? <Check className="size-3.5 text-emerald-400" /> : <Link className="size-3.5" />}
            {linkCopied ? "copiado" : "link"}
          </Button>
        )}
        {/* Seletor de fontes RAG — sempre ativo */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 gap-1.5 rounded-full border px-3 text-xs ${
                  sourceIds.length ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-medium" : "border-border/60 bg-muted/30 text-muted-foreground"
                }`}
              />
            }
          >
            <Database className="size-3.5" />
            <span>{sourceIds.length ? `${sourceIds.length} fonte${sourceIds.length > 1 ? "s" : ""}` : `RAG · ${docs.length} doc${docs.length === 1 ? "" : "s"}`}</span>
            <CaretDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Fontes do RAG (sempre ativo)
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => onSourceIds([])}
                className={sourceIds.length === 0 ? "bg-accent" : ""}
              >
                <Globe className="size-3.5" /> Todos os documentos
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {docs.map((d) => (
              <DropdownMenuCheckboxItem
                key={d.id}
                checked={sourceIds.includes(d.id)}
                onCheckedChange={(checked) => {
                  onSourceIds(checked ? [...sourceIds, d.id] : sourceIds.filter((i) => i !== d.id));
                }}
                onSelect={(e) => e.preventDefault()}
                className="max-w-full"
              >
                <span className="truncate">{d.title}</span>
              </DropdownMenuCheckboxItem>
            ))}
            {docs.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum documento indexado.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {busy && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
            <Spinner className="size-3.5" />
            <span>respondendo…</span>
          </div>
        )}
      </div>
    </header>
  );
}
