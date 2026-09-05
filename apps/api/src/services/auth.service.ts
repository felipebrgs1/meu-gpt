// SERVICE — auth single-user (usuário + senha, sem JWT).
// App pessoal: credenciais fixas no código por decisão explícita do dono.
// Login válido retorna sempre o mesmo token opaco (sem expiração/assinatura).

const LOGIN_USER = "felipeb";
const LOGIN_PASS = "909090";

export const SESSION_TOKEN = "meu-gpt-felipeb-local-session-v1";

export function checkLogin(username: unknown, password: unknown): boolean {
  return username === LOGIN_USER && password === LOGIN_PASS;
}

export function isValidToken(token: string): boolean {
  return token === SESSION_TOKEN;
}
