import { useMemo, useState } from "react";
import {
  ChatTextIcon,
  DatabaseIcon,
  DotsThreeVerticalIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  SignOutIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react";
import type { Conversation } from "@meu-gpt/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  convs: Conversation[];
  activeId: string | null;
  docsCount: number;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenIngest: () => void;
  onOpenAccount: () => void;
  onLogout: () => void;
}

interface Group {
  label: string;
  items: Conversation[];
}

// Agrupa como o ChatGPT: Hoje / Ontem / Últimos 7 dias / Últimos 30 dias / Antigas.
function groupByDate(convs: Conversation[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets: Record<string, Conversation[]> = {
    Hoje: [],
    Ontem: [],
    "Últimos 7 dias": [],
    "Últimos 30 dias": [],
    Antigas: [],
  };
  for (const c of convs) {
    const t = new Date(c.updatedAt ?? c.createdAt).getTime();
    if (Number.isNaN(t) || t >= startOfToday) buckets["Hoje"].push(c);
    else if (t >= startOfToday - day) buckets["Ontem"].push(c);
    else if (t >= startOfToday - 7 * day) buckets["Últimos 7 dias"].push(c);
    else if (t >= startOfToday - 30 * day) buckets["Últimos 30 dias"].push(c);
    else buckets["Antigas"].push(c);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function ConvRow({
  c,
  active,
  onSelect,
  onRemove,
}: {
  c: Conversation;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <SidebarMenuItem className="group/menu-item relative flex items-center min-w-0">
      <SidebarMenuButton
        isActive={active}
        onClick={onSelect}
        tooltip={c.title}
        className="min-w-0 flex-1 pr-7 font-normal"
      >
        <span className="block w-full min-w-0 truncate whitespace-nowrap text-left text-[13px]">
          {c.title}
        </span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              showOnHover
              className="size-6 text-muted-foreground hover:text-foreground"
            >
              <DotsThreeVerticalIcon className="size-3.5" />
              <span className="sr-only">Opções</span>
            </SidebarMenuAction>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <TrashIcon className="size-3.5" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

// Sidebar estilo ChatGPT: clica no hamburger e ela expande/colapsa lateralmente
// (animação de width do Sidebar collapsible="icon"). Expandida mostra busca +
// histórico agrupado por data + base RAG + sair; colapsada vira um rail de ícones.
export function ChatSidebar({
  convs,
  activeId,
  docsCount,
  onNew,
  onSelect,
  onRemove,
  onOpenIngest,
  onOpenAccount,
  onLogout,
}: Props) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) => c.title.toLowerCase().includes(q));
  }, [convs, query]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50 h-full overflow-hidden">
      <SidebarHeader className="gap-1.5 p-2.5">
        {/* Rail colapsado: só ícones (novo chat / buscar ao expandir) */}
        {collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onNew}
                  className="size-8 text-muted-foreground hover:text-foreground"
                  title="Nova conversa"
                />
              }
            >
              <PencilSimpleIcon className="size-4" />
              <span className="sr-only">Nova conversa</span>
            </TooltipTrigger>
            <TooltipContent side="right">Nova conversa</TooltipContent>
          </Tooltip>
        )}

        {/* Botão "novo chat" expandido */}
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onNew}
                  className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Nova conversa"
                />
              }
            >
              <PencilSimpleIcon className="size-4" />
              <span className="sr-only">Nova conversa</span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Nova conversa</TooltipContent>
          </Tooltip>
        )}

        {/* Busca no histórico — só faz sentido expandida */}
        {!collapsed && (
          <label className="relative mt-0.5 block">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversas"
              className="h-8 w-full rounded-lg border border-border/50 bg-muted/30 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </label>
        )}
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto px-1.5">
        {/* Rail colapsado: atalho para a base de conhecimento */}
        {collapsed && (
          <div className="flex flex-col items-center gap-1 py-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onOpenIngest}
                    className="size-8 text-muted-foreground hover:text-foreground"
                    title="Base de conhecimento"
                  />
                }
              >
                <DatabaseIcon className="size-4" />
                <span className="sr-only">Base de conhecimento</span>
              </TooltipTrigger>
              <TooltipContent side="right">Base de conhecimento</TooltipContent>
            </Tooltip>
          </div>
        )}

        {!collapsed && (
          <>
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={onNew}
                      tooltip="Nova conversa"
                      className="font-medium"
                    >
                      <PencilSimpleIcon className="size-4" />
                      <span>Novo chat</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={onOpenIngest}
                      tooltip={`Base de conhecimento (${docsCount} docs)`}
                      className="text-muted-foreground"
                    >
                      <DatabaseIcon className="size-4 text-emerald-400" />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate">Base de conhecimento</span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                          {docsCount}
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator className="mx-0" />

            {groups.map((g) => (
              <SidebarGroup key={g.label} className="p-0">
                <SidebarGroupLabel className="px-2 text-[11px] tracking-wide text-muted-foreground/70 normal-case">
                  {query.trim() ? `${g.label} · filtro` : g.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((c) => (
                      <ConvRow
                        key={c.id}
                        c={c}
                        active={activeId === c.id}
                        onSelect={() => onSelect(c.id)}
                        onRemove={() => onRemove(c.id)}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            {filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                <ChatTextIcon className="size-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground/70">
                  {query.trim()
                    ? "Nenhuma conversa bate com a busca."
                    : "Nenhuma conversa ainda. Comece um novo chat."}
                </p>
              </div>
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-1 p-2.5">
        {!collapsed && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenAccount}
              className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <UserIcon className="size-4" /> Conta
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <SignOutIcon className="size-4" /> Sair
            </Button>
          </>
        )}
        {collapsed && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onOpenAccount}
                    className="size-8 text-muted-foreground hover:text-foreground"
                    title="Conta"
                  />
                }
              >
                <UserIcon className="size-4" />
                <span className="sr-only">Conta</span>
              </TooltipTrigger>
              <TooltipContent side="right">Conta</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onLogout}
                    className="size-8 text-muted-foreground hover:text-foreground"
                    title="Sair"
                  />
                }
              >
                <SignOutIcon className="size-4" />
                <span className="sr-only">Sair</span>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          </>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
