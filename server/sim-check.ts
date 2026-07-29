import {
  authenticateSimCredentials,
  logoutSimToken,
  SimAuthError,
  type SimAuthBindings
} from "../worker/sim-auth";
import { assertInteractiveTerminal, readHidden, readVisible } from "./terminal-prompts";

async function main() {
  assertInteractiveTerminal();
  const env = simEnvironment();
  const identifier = requiredAnswer(await readVisible("Usuario institucional: "));
  let password = await readHidden("Senha institucional: ");

  try {
    const authenticated = await authenticateSimCredentials(env, identifier, password);
    password = "";

    try {
      console.log("Login e validacao do SIM aprovados.");
    } finally {
      await logoutSimToken(env, authenticated.token);
    }

    console.log("Logout do SIM aprovado; o JWT foi descartado sem ser exibido ou salvo.");
  } finally {
    password = "";
  }
}

void main().catch((error: unknown) => {
  const diagnostic =
    error instanceof SimAuthError
      ? `codigo=${error.code} status=${error.status}`
      : "codigo=local_failure";
  console.error(`Teste SIM nao concluido (${diagnostic}). Nenhuma credencial foi registrada.`);
  process.exitCode = 1;
});

function simEnvironment(): SimAuthBindings {
  return {
    ENVIRONMENT: process.env.ENVIRONMENT || "production",
    SIM_API_BASE_URL: requiredEnvironment("SIM_API_BASE_URL"),
    SIM_LOGIN_PATH: process.env.SIM_LOGIN_PATH,
    SIM_VALIDATE_PATH: process.env.SIM_VALIDATE_PATH,
    SIM_LOGOUT_PATH: process.env.SIM_LOGOUT_PATH,
    SIM_LOGIN_CONTENT_TYPE: process.env.SIM_LOGIN_CONTENT_TYPE,
    SIM_CLIENT_TYPE: process.env.SIM_CLIENT_TYPE,
    SIM_SUBJECT_CLAIM: process.env.SIM_SUBJECT_CLAIM,
    SIM_REQUEST_TIMEOUT_MS: process.env.SIM_REQUEST_TIMEOUT_MS
  };
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredAnswer(value: string) {
  const answer = value.trim();
  if (!answer || answer.length > 160) {
    throw new Error("Invalid institutional identifier.");
  }
  return answer;
}
