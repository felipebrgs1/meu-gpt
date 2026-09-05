import type { Db } from "@meu-gpt/db";
import { authModel } from "../models/auth.model.js";

// SERVICE — auth single-user (usuário fixo + senha mutável em D1).
// Primeira sessão usa a credencial default abaixo e o login responde
// mustChangePassword=true; enquanto a troca não acontece, o middleware
// bloqueia tudo com 403 password_change_required. Após a troca, o default
// deixa de valer — só o hash em D1 autentica.
// O token de sessão NÃO é hardcoded: vem de secret (SESSION_TOKEN via Env).
// Repo pode ser público — o token de cada instância vive só nos secrets.

// Default inicial — só vale enquanto não houver linha em auth_state.
// Depois da primeira troca, essa senha nunca mais autentica.
export const LOGIN_USER = "user";
const LOGIN_PASS_DEFAULT = "123456";

export const MIN_PASSWORD_LEN = 8;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function generateSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return toHex(digest);
}

// Comparação sem early-exit para não vazar prefixo via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Leitura fail-open para null (tabela pode não existir antes da migration);
// quem decide o fallback seguro é o chamador (middleware falha fechado).
async function readState(db: Db) {
  try {
    return await authModel.get(db);
  } catch (err) {
    console.error("[auth] readState fail-open (null):", err);
    return null;
  }
}

// True se ainda está na credencial default (sem troca registrada).
export async function needsPasswordChange(db: Db): Promise<boolean> {
  const row = await readState(db);
  if (!row) return true;
  return row.mustChange === 1;
}

// Valida credencial: com troca feita, só o hash vale; sem troca, só o default.
export async function verifyCredentials(db: Db, username: unknown, password: unknown): Promise<boolean> {
  if (typeof username !== "string" || typeof password !== "string") return false;
  if (username !== LOGIN_USER) return false;
  const row = await readState(db);
  if (!row) return safeEqual(password, LOGIN_PASS_DEFAULT);
  const hash = await hashPassword(password, row.passwordSalt);
  return safeEqual(hash, row.passwordHash);
}

// Compat: usado onde só importa "é o default?" (nunca para autenticar pós-troca).
export function checkLogin(username: unknown, password: unknown): boolean {
  return username === LOGIN_USER && password === LOGIN_PASS_DEFAULT;
}

// Regras da nova senha: tamanho mínimo, diferente da atual e do default.
export function validateNewPassword(newPassword: unknown, currentPassword: unknown): string | null {
  if (typeof newPassword !== "string" || !newPassword) return "nova senha obrigatória";
  if (newPassword.length < MIN_PASSWORD_LEN) return `nova senha precisa de ao menos ${MIN_PASSWORD_LEN} caracteres`;
  if (newPassword.length > 200) return "nova senha muito longa (200 chars max)";
  if (typeof currentPassword === "string" && newPassword === currentPassword) return "nova senha precisa ser diferente da atual";
  if (newPassword === LOGIN_PASS_DEFAULT) return "escolha uma senha diferente da inicial";
  return null;
}

export async function changePassword(db: Db, currentPassword: unknown, newPassword: unknown): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof currentPassword !== "string" || !currentPassword) return { ok: false, reason: "senha atual obrigatória" };
  const invalid = validateNewPassword(newPassword, currentPassword);
  if (invalid) return { ok: false, reason: invalid };
  // Autentica a atual (hash ou default, conforme estado).
  const row = await readState(db);
  let currentOk = false;
  if (!row) {
    currentOk = currentPassword === LOGIN_PASS_DEFAULT;
  } else {
    const hash = await hashPassword(currentPassword, row.passwordSalt);
    currentOk = safeEqual(hash, row.passwordHash);
  }
  if (!currentOk) return { ok: false, reason: "senha atual incorreta" };
  const salt = generateSalt();
  const hash = await hashPassword(newPassword as string, salt);
  try {
    await authModel.upsert(db, {
      passwordHash: hash,
      passwordSalt: salt,
      mustChange: 0,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[auth] changePassword upsert failed:", err);
    return { ok: false, reason: "banco indisponível, tente de novo" };
  }
  return { ok: true };
}

// Helper só para testes (vitest/node): evita importar crypto do Workers.
export function __testOnly() {
  return { LOGIN_PASS_DEFAULT, fromHex };
}

export function isValidToken(token: string, expected: string | undefined): boolean {
  if (!token || !expected) return false;
  return token === expected;
}
