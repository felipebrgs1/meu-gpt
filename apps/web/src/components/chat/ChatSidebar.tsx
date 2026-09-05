import { Database, DotsThreeVertical, Plus, SignOut, Trash } from "@phosphor-icons/react";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";

interface Props {
  convs: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenIngest: () => void;
  onLogout: () => void;
}

// Sidebar: histórico de conversas + acesso à base RAG + logout.
export function ChatSidebar({ convs, activeId, onNew, onSelect, onRemove, onOpenIngest, onLogout }: Props) {
  return (
    <Sidebar className="border-r border-border/50 h-full overflow-hidden">
      <SidebarHeader className="p-3">
        <Button onClick={onNew} className="w-full justify-start gap-2 shadow-sm font-medium">
          <Plus className="size-4" /> Nova conversa
        </Button>
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs tracking-wider uppercase text-muted-foreground/70">
            Histórico
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {convs.map((c) => (
                <SidebarMenuItem key={c.id} className="group/menu-item relative flex items-center min-w-0">
                  <SidebarMenuButton
                    isActive={activeId === c.id}
                    onClick={() => onSelect(c.id)}
                    tooltip={c.title}
                    className="min-w-0 flex-1 pr-7"
                  >
                    <span className="block w-full min-w-0 truncate whitespace-nowrap text-left text-xs font-normal">
                      {c.title}
                    </span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuAction showOnHover className="size-6 text-muted-foreground hover:text-foreground">
                          <DotsThreeVertical className="size-3.5" />
                          <span className="sr-only">Opções</span>
                        </SidebarMenuAction>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onSelect={() => onRemove(c.id)}>
                        <Trash className="size-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}
              {convs.length === 0 && (
                <p className="px-3 py-6 text-xs text-muted-foreground/60 text-center">Nenhuma conversa gravada.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 space-y-2">
        <Button variant="outline" onClick={onOpenIngest} className="w-full justify-start gap-2 text-xs">
          <Database className="size-4 text-emerald-400" /> Base de conhecimento
        </Button>
        <SidebarSeparator />
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <SignOut className="size-4" /> Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
