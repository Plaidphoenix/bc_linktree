import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  authenticateSimCredentials,
  logoutSimToken,
  SimAuthError,
  type SimAuthBindings
} from "../worker/sim-auth";
import { assertInteractiveTerminal, readHidden, readVisible } from "./terminal-prompts";

const databaseUrl = requiredEnvironment("DATABASE_URL");
assertInteractiveTerminal();

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  application_name: "linkgov-bootstrap"
});

void bootstrap()
  .catch((error: unknown) => {
    reportSafeFailure(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

async function bootstrap() {
  if ((await countAdministrators(pool)) > 0) {
    throw new CliError(
      "Um administrador ja existe. Use a tela de gestao de usuarios do LinkGov."
    );
  }

  const externalSubject = await verifySimIdentity(simEnvironment());
  const name = requiredAnswer(await readVisible("Nome do administrador: "));
  const email = validEmail(await readVisible("E-mail institucional: "));
  const pageTitle = requiredAnswer(
    (await readVisible("Titulo da primeira pagina [Portal Institucional]: ")) ||
      "Portal Institucional"
  );
  const suggestedSlug = cleanSlug(pageTitle) || "portal-institucional";
  const pageSlug = validSlug(
    (await readVisible(`Slug da primeira pagina [${suggestedSlug}]: `)) || suggestedSlug
  );

  const userId = randomUUID();
  const profileId = randomUUID();
  const username = cleanSlug(email.split("@")[0]) || `admin-${userId.slice(0, 8)}`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    if ((await countAdministrators(client)) > 0) {
      throw new CliError(
        "Outro administrador foi criado durante esta operacao. Nenhum dado foi alterado."
      );
    }

    await client.query(
      `INSERT INTO users (
         id, name, email, password_hash, username, role, avatar, description,
         active, status, external_subject
       ) VALUES ($1, $2, $3, 'SIM_IDENTITY_ONLY', $4, 'ADMIN', '/assets/crest.svg',
         'Administrador inicial autenticado pelo SIM', 1, 'active', $5)`,
      [userId, name, email, username, externalSubject]
    );
    await client.query(
      `INSERT INTO profiles (
         id, user_id, slug, title, description, avatar, banner, primary_color,
         secondary_color, theme, button_radius, font_family, public
       ) VALUES ($1, $2, $3, $4, 'Pagina institucional inicial.',
         '/assets/crest.svg', '/assets/institutional-banner.svg', '#001e40',
         '#005db6', 'institucional', 16, 'Inter', 1)`,
      [profileId, userId, pageSlug, pageTitle]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log("Administrador e pagina inicial criados com sucesso.");
}

async function verifySimIdentity(env: SimAuthBindings) {
  const identifier = requiredAnswer(await readVisible("Usuario institucional: "));
  let password = await readHidden("Senha institucional: ");
  let providerToken = "";

  try {
    const authenticated = await authenticateSimCredentials(env, identifier, password);
    providerToken = authenticated.token;
    password = "";
    return validExternalSubject(authenticated.identity.subject);
  } finally {
    password = "";
    if (providerToken) {
      await logoutSimToken(env, providerToken);
      providerToken = "";
    }
  }
}

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

async function countAdministrators(queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">) {
  const result = await queryable.query<{ total: string }>(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN'"
  );
  return Number(result.rows[0]?.total || 0);
}

function reportSafeFailure(error: unknown) {
  if (error instanceof CliError) {
    console.error(error.message);
    return;
  }
  if (error instanceof SimAuthError) {
    console.error(
      `Bootstrap nao concluido pela autenticacao institucional (codigo=${error.code} status=${error.status}).`
    );
    return;
  }

  const incidentId = randomUUID();
  const databaseCode =
    isRecord(error) && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
      ? ` db_code=${error.code}`
      : "";
  console.error(
    `Bootstrap nao concluido (incident=${incidentId}${databaseCode}). Consulte os logs restritos do servidor.`
  );
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new CliError(`Variavel obrigatoria ausente: ${name}.`);
  }
  return value;
}

function requiredAnswer(value: string) {
  const answer = value.trim();
  if (!answer) {
    throw new CliError("O valor informado nao pode ficar vazio.");
  }
  return answer.slice(0, 160);
}

function validEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    throw new CliError("E-mail invalido.");
  }
  return email;
}

function validExternalSubject(value: string) {
  const subject = value.trim();
  if (!/^[A-Za-z0-9._:@-]{1,160}$/.test(subject)) {
    throw new CliError("Identificador SIM invalido.");
  }
  return subject;
}

function validSlug(value: string) {
  const slug = cleanSlug(value);
  if (!slug) {
    throw new CliError("Slug invalido.");
  }
  return slug;
}

function cleanSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

class CliError extends Error {}
