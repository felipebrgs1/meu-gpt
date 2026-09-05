import { ArrowUp, Database, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SlotOption } from "../../lib/slots";

interface Props {
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  activeSlot: SlotOption;
  sourceCount: number;
  onResetSources: () => void;
  onOpenIngest: () => void;
}

// Composer flutuante (estilo ChatGPT): textarea + ações RAG/ingest + enviar.
export function Composer({ input, onInput, onSend, busy, activeSlot, sourceCount, onResetSources, onOpenIngest }: Props) {
  return (
    <div className="shrink-0 border-t border-border/40 p-4 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex flex-col rounded-2xl border border-border/70 bg-card p-3 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Textarea
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={2}
            placeholder={`Pergunte ao ${activeSlot.label} (${activeSlot.modelName})…`}
            className="min-h-[50px] resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground/60"
          />

          <div className="flex items-center justify-between pt-2 border-t border-border/30 mt-1">
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onOpenIngest}
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    />
                  }
                >
                  <UploadSimple className="size-3.5" />
                  <span>Adicionar doc</span>
                </TooltipTrigger>
                <TooltipContent>Indexar texto no Vectorize</TooltipContent>
              </Tooltip>

              <Button
                variant={sourceCount ? "secondary" : "ghost"}
                size="sm"
                onClick={onResetSources}
                className={`h-7 gap-1 px-2 text-xs transition-colors ${
                  sourceCount ? "bg-emerald-500/15 text-emerald-400 font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Database className="size-3.5" />
                <span>RAG · {sourceCount ? `${sourceCount} fonte(s)` : "todos"}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <Kbd>Enter</Kbd> envia · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> quebra
              </span>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      onClick={onSend}
                      disabled={busy || !input.trim()}
                      className="size-8 rounded-lg shrink-0 shadow-xs transition-all disabled:opacity-30"
                    />
                  }
                >
                  <ArrowUp className="size-4" weight="bold" />
                </TooltipTrigger>
                <TooltipContent>Enviar mensagem</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
          meu-gpt pode cometer erros. Verifique fontes e citações via RAG.
        </p>
      </div>
    </div>
  );
}
