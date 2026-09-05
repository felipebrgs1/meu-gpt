// Slots lógicos — nunca gravar marca fixa no código de negócio.
// Valores reais vêm de env: CHAT_MODEL_FAST / CHEAP / QUALITY
export const MODEL_SLOTS = ["fast", "cheap", "quality"] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];

export interface ModelCatalog {
  fast: string;
  cheap: string;
  quality: string;
}

export function resolveModel(slot: ModelSlot, catalog: ModelCatalog): string {
  return catalog[slot];
}
