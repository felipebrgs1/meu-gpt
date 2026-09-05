// SERVICE — auth single-user (usuário + senha, sem JWT).
// App pessoal: usuário+senha fixos no código por decisão explícita do dono.
// O token de sessão NÃO é hardcoded: vem de secret (SESSION_TOKEN via Env).
// Repo pode ser público — o token de cada instância vive só nos secrets.

// ⚠️ DEFAULT CREDENTIALS — change these before exposing your instance.
// Edite usuário+senha aqui e redeploye a API. (Token de sessão continua
// vindo de secret SESSION_TOKEN — ver DEPLOY.md §8.)
const LOGIN_USER = "user";
const LOGIN_PASS = "123456";

export function checkLogin(username: unknown, password: unknown): boolean {
  return username === LOGIN_USER && password === LOGIN_PASS;
}

export function isValidToken(token: string, expected: string | undefined): boolean {
  if (!token || !expected) return false;
  return token === expected;
}
