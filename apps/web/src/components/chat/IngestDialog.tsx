import { useEffect, useState } from "react";
import { Database, DownloadSimple, FileDoc, FilePdf, FileText, Trash, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  deleteDocument,
  documentRawUrl,
  ingestDocument,
  listDocuments,
  uploadDocument,
  type DocRecord,
} from "../../lib/api";

const DOC_ACCEPT = ".pdf,.docx,.txt,.md,.csv,.json";
const MAX_MB = 10;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function docIcon(mime: string, filename: string) {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf") || mime.includes("pdf")) return <FilePdf className="size-4 text-red-400" />;
  if (f.endsWith(".docx") || mime.includes("wordprocessingml")) return <FileDoc className="size-4 text-sky-400" />;
  return <FileText className="size-4 text-zinc-400" />;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

// Base de conhecimento (RAG): upload de arquivo ou colar texto + lista de docs.
export function IngestDialog({ open, onOpenChange, onChanged }: Props) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [docs, setDocs] = useState<DocRecord[]>([]);

  async function refreshDocs() {
    setDocs(await listDocuments().catch(() => []));
  }

  useEffect(() => {
    if (open) void refreshDocs();
  }, [open]);

  async function submitFile() {
    if (!file || busy) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setResult(`Erro: arquivo muito grande (${fmtBytes(file.size)}). Máximo ${MAX_MB}MB.`);
      return;
    }
    setBusy(true);
    setResult("");
    try {
      const r = await uploadDocument(file, title);
      setResult(`OK: "${r.title}" indexado (${r.chunkCount} chunks${r.pageCount ? `, ${r.pageCount} páginas` : ""}). Original preservado no R2.`);
      setFile(null);
      setTitle("");
      (document.getElementById("doc-file") as HTMLInputElement | null) && ((document.getElementById("doc-file") as HTMLInputElement).value = "");
      void refreshDocs();
      onChanged?.();
    } catch (e) {
      setResult(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitText() {
    if (!title.trim() || !text.trim() || busy) return;
    setBusy(true);
    setResult("");
    try {
      const r = await ingestDocument(title.trim(), text);
      setResult(`OK: ${r.chunkCount} chunks indexados. Original preservado no R2.`);
      setTitle("");
      setText("");
      void refreshDocs();
      onChanged?.();
    } catch (e) {
      setResult(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(id: string) {
    setBusy(true);
    try {
      await deleteDocument(id);
      void refreshDocs();
      onChanged?.();
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
              <Database className="size-4" />
            </div>
            <DialogTitle>Base de conhecimento (RAG)</DialogTitle>
          </div>
          <DialogDescription>
            Suba PDF, DOCX ou TXT/MD. O arquivo original é preservado no R2 e o texto vai para o Vectorize (1024d cosine).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file">
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1 gap-1.5">
              <UploadSimple className="size-3.5" /> Arquivo
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-1 gap-1.5">
              <FileText className="size-3.5" /> Colar texto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3 pt-2">
            <label
              htmlFor="doc-file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
            >
              <UploadSimple className="size-6 text-muted-foreground" />
              {file ? (
                <span className="flex items-center gap-2 text-sm">
                  {docIcon(file.type || "", file.name)}
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({fmtBytes(file.size)})</span>
                </span>
              ) : (
                <>
                  <span className="text-sm font-medium">Arraste um arquivo ou clique para escolher</span>
                  <span className="text-[11px] text-muted-foreground">PDF, DOCX, TXT, MD, CSV, JSON · até {MAX_MB}MB</span>
                </>
              )}
              <input
                id="doc-file"
                type="file"
                accept={DOC_ACCEPT}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title-file" className="text-xs font-medium">Título (opcional — usa o nome do arquivo)</Label>
              <Input id="doc-title-file" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Manual interno, Aula 3..." />
            </div>
            <Button onClick={submitFile} disabled={busy || !file} className="w-full gap-2">
              {busy ? (
                <>
                  <Spinner /> Extraindo texto e indexando…
                </>
              ) : (
                <>
                  <UploadSimple className="size-4" /> Indexar arquivo
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="text" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title" className="text-xs font-medium">Título do documento</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Resumo do Projeto, Artigo sobre RAG..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-text" className="text-xs font-medium">Conteúdo do texto</Label>
              <Textarea id="doc-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Cole o texto aqui…" className="resize-none" />
            </div>
            <Button onClick={submitText} disabled={busy || !title.trim() || !text.trim()} className="w-full gap-2">
              {busy ? (
                <>
                  <Spinner /> Indexando…
                </>
              ) : (
                <>
                  <UploadSimple className="size-4" /> Indexar texto
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {result && (
          <div className={`p-2.5 rounded-lg text-xs ${result.startsWith("OK") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-destructive/10 text-destructive"}`}>
            {result}
          </div>
        )}

        {/* Documentos indexados */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Documentos indexados ({docs.length})
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {docs.map((d) => (
              <div key={d.id} className="group flex items-center gap-2 rounded-lg border border-border/40 bg-card/50 px-2.5 py-2">
                {docIcon(d.mimeType, d.originalFilename)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.chunkCount} chunks{d.pageCount ? ` · ${d.pageCount} pág` : ""} · {fmtBytes(d.fileSize)}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger render={
                    <a
                      href={documentRawUrl(d.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <DownloadSimple className="size-3.5" />
                    </a>
                  } />
                  <TooltipContent>Baixar original (R2)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={() => removeDoc(d.id)}
                      disabled={busy}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash className="size-3.5" />
                    </button>
                  } />
                  <TooltipContent>Excluir do RAG + R2</TooltipContent>
                </Tooltip>
              </div>
            ))}
            {docs.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground/60">Nenhum documento indexado ainda.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
