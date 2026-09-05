import type { Db } from "@meu-gpt/db";
import { authModel } from "../models/auth.model.js";

// SERVICE — auth single-user (usuário + senha mutáveis em D1).
// Primeira sessão usa a credencial default abaixo e o login responde
// mustChangePassword=true; enquanto a troca não acontece, o middleware
// bloqueia tudo com 403 password_change_required. Após a troca, o default
// deixa de valer — só username + hash em D1 autenticam.
// O token de sessão NÃO é hardcoded: vem de secret (SESSION_TOKEN via Env).
// Repo pode ser público — o token de cada instância vive só nos secrets.

// Default inicial — só vale enquanto não houver linha em auth_state.
// Depois da primeira troca, essa credencial nunca mais autentica.
export const LOGIN_USER = "user";
const LOGIN_PASS_DEFAULT = "123456";

export const MIN_PASSWORD_LEN = 8;
export const MIN_USERNAME_LEN = 2;
export const MAX_USERNAME_LEN = 50;

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

// Username efetivo: customizado em D1 ou o default inicial.
export async function getEffectiveUsername(db: Db): Promise<string> {
  const row = await readState(db);
  return row?.username ?? LOGIN_USER;
}

// True se ainda está na credencial default (sem troca de senha registrada).
export async function needsPasswordChange(db: Db): Promise<boolean> {
  const row = await readState(db);
  if (!row) return true;
  return row.mustChange === 1;
}

// Valida credencial: com troca feita, só username + hash em D1 valem;
// sem troca, só o default.
export async function verifyCredentials(db: Db, username: unknown, password: unknown): Promise<boolean> {
  if (typeof username !== "string" || typeof password !== "string") return false;
  const row = await readState(db);
  if (!row) return username.trim() === LOGIN_USER && safeEqual(password, LOGIN_PASS_DEFAULT);
  if (username.trim() !== row.username) return false;
  const hash = await hashPassword(password, row.passwordSalt);
  return safeEqual(hash, row.passwordHash);
}

// Compat: usado onde só importa "é o default?" (nunca para autenticar pós-troca).
export function checkLogin(username: unknown, password: unknown): boolean {
  return username === LOGIN_USER && password === LOGIN_PASS_DEFAULT;
}

// Regras do novo usuário: aparado, 2–50 chars.
export function validateNewUsername(newUsername: unknown, currentUsername: unknown): string | null {
  if (typeof newUsername !== "string") return "novo usuário inválido";
  const name = newUsername.trim();
  if (!name) return "novo usuário obrigatório";
  if (name.length < MIN_USERNAME_LEN) return `usuário precisa de ao menos ${MIN_USERNAME_LEN} caracteres`;
  if (name.length > MAX_USERNAME_LEN) return "usuário muito longo (50 chars max)";
  if (typeof currentUsername === "string" && name === currentUsername.trim()) {
    return "novo usuário precisa ser diferente do atual";
  }
  return null;
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

export interface CredentialChanges {
  newPassword?: unknown;
  newUsername?: unknown;
}

// Troca usuário e/ou senha (exige a senha atual). A obrigação da 1ª sessão
// (mustChange) só sai com troca de senha — trocar só o usuário não libera.
export async function changeCredentials(
  db: Db,
  currentPassword: unknown,
  changes: CredentialChanges,
): Promise<{ ok: true; username: string } | { ok: false; reason: string }> {
  if (typeof currentPassword !== "string" || !currentPassword) return { ok: false, reason: "senha atual obrigatória" };
  const wantPassword = changes.newPassword !== undefined;
  const wantUsername = changes.newUsername !== undefined;
  if (!wantPassword && !wantUsername) return { ok: false, reason: "informe o novo usuário e/ou a nova senha" };

  const row = await readState(db);
  const currentUsername = row?.username ?? LOGIN_USER;

  if (wantUsername) {
    const invalid = validateNewUsername(changes.newUsername, currentUsername);
    if (invalid) return { ok: false, reason: invalid };
  }
  if (wantPassword) {
    const invalid = validateNewPassword(changes.newPassword, currentPassword);
    if (invalid) return { ok: false, reason: invalid };
  }

  // Autentica a senha atual (hash ou default, conforme estado).
  let currentOk = false;
  if (!row) {
    currentOk = currentPassword === LOGIN_PASS_DEFAULT;
  } else {
    const hash = await hashPassword(currentPassword, row.passwordSalt);
    currentOk = safeEqual(hash, row.passwordHash);
  }
  if (!currentOk) return { ok: false, reason: "senha atual incorreta" };

  const username =
    wantUsername && typeof changes.newUsername === "string" ? changes.newUsername.trim() : currentUsername;
  // Trocar só o usuário não quita a troca obrigatória da 1ª sessão.
  const mustChange = wantPassword ? 0 : (row?.mustChange ?? 1);
  // Salt novo a cada troca de senha; sem troca, preserva a senha atual
  // (se ainda não há linha, fixa o hash da senha atual sob o novo usuário).
  let passwordSalt = row?.passwordSalt ?? generateSalt();
  let finalHash = row?.passwordHash ?? "";
  if (wantPassword && typeof changes.newPassword === "string") {
    passwordSalt = generateSalt();
    finalHash = await hashPassword(changes.newPassword, passwordSalt);
  } else if (!row) {
    finalHash = await hashPassword(currentPassword, passwordSalt);
  }
  try {
    await authModel.upsert(db, {
      username,
      passwordHash: finalHash,
      passwordSalt,
      mustChange,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[auth] changeCredentials upsert failed:", err);
    return { ok: false, reason: "banco indisponível, tente de novo" };
  }
  return { ok: true, username };
}

// Compat: troca só de senha (endpoint antigo continua valendo).
export async function changePassword(
  db: Db,
  currentPassword: unknown,
  newPassword: unknown,
): Promise<{ ok: true; username?: string } | { ok: false; reason: string }> {
  return changeCredentials(db, currentPassword, { newPassword });
}

// Helper só para testes (vitest/node): evita importar crypto do Workers.
export function __testOnly() {
  return { LOGIN_PASS_DEFAULT, fromHex };
}

export function isValidToken(token: string, expected: string | undefined): boolean {
  if (!token || !expected) return false;
  return token === expected;
}
