import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Pool } from "pg";

const databaseUrl = requiredEnvironment("DATABASE_URL");
if (!input.isTTY || !output.isTTY) {
  throw new Error("Bootstrap must be run in an interactive terminal.");
}

const prompt = createInterface({ input, output });
const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  application_name: "linkgov-bootstrap"
});

try {
  const adminCount = await pool.query<{ total: string }>(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN'"
  );
  if (Number(adminCount.rows[0]?.total || 0) > 0) {
    throw new Error("An administrator already exists. Use the LinkGov user management screen.");
  }

  const name = requiredAnswer(await prompt.question("Nome do administrador: "));
  const email = validEmail(await prompt.question("E-mail institucional: "));
  const externalSubject = validExternalSubject(
    await prompt.question("Identificador interno retornado pelo SIM: ")
  );
  const pageTitle = requiredAnswer(
    (await prompt.question("Titulo da primeira pagina [Portal Institucional]: ")) || "Portal Institucional"
  );
  const suggestedSlug = cleanSlug(pageTitle) || "portal-institucional";
  const pageSlug = cleanSlug(
    (await prompt.question(`Slug da primeira pagina [${suggestedSlug}]: `)) || suggestedSlug
  );

  const userId = randomUUID();
  const profileId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users (
         id, name, email, password_hash, username, role, avatar, description,
         active, status, external_subject
       ) VALUES ($1, $2, $3, 'SIM_IDENTITY_ONLY', $4, 'ADMIN', '/assets/crest.svg',
         'Administrador inicial autenticado pelo SIM', 1, 'active', $5)`,
      [userId, name, email, cleanSlug(email.split("@")[0]), externalSubject]
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
} finally {
  prompt.close();
  await pool.end();
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requiredAnswer(value: string) {
  const answer = value.trim();
  if (!answer) throw new Error("O valor informado nao pode ficar vazio.");
  return answer.slice(0, 160);
}

function validEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("E-mail invalido.");
  }
  return email;
}

function validExternalSubject(value: string) {
  const subject = value.trim();
  if (!/^[A-Za-z0-9._:@-]{1,160}$/.test(subject)) {
    throw new Error("Identificador SIM invalido.");
  }
  return subject;
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
