import { describe, expect, it } from "vitest";
import app, { type Bindings } from "./index";

describe("public profile entry route", () => {
  it("returns the first public database profile at the site root endpoint", async () => {
    const queries: string[] = [];
    const profile = {
      id: "profile-sport",
      user_id: "admin",
      slug: "secretaria-de-esporte",
      title: "Secretaria de esporte",
      description: "Pagina institucional inicial.",
      avatar: null,
      banner: null,
      primary_color: "#001e40",
      secondary_color: "#005db6",
      theme: "institucional",
      button_radius: 16,
      font_family: "Inter",
      public: 1
    };
    const database = {
      prepare(sql: string) {
        queries.push(sql);
        const statement = {
          bind() {
            return statement;
          },
          async first() {
            return profile;
          },
          async all() {
            return { success: true, results: [], meta: { changes: 0 } };
          }
        };
        return statement;
      }
    } as unknown as D1Database;

    const response = await app.request("https://links.example.test/api/profiles", undefined, {
      DB: database,
      ENVIRONMENT: "production",
      AUTH_PROVIDER: "sim",
      APP_BASE_URL: "https://links.example.test"
    } as Bindings);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      profile: {
        slug: "secretaria-de-esporte",
        public: true
      },
      links: []
    });
    expect(queries[0]).toMatch(/WHERE public = 1 ORDER BY created_at ASC/);
  });

  it("records a public view with an idempotent event identifier", async () => {
    const queries: string[] = [];
    const profile = {
      id: "profile-sport",
      user_id: "admin",
      slug: "secretaria-de-esporte",
      title: "Secretaria de esporte",
      description: null,
      avatar: null,
      banner: null,
      primary_color: "#001e40",
      secondary_color: "#005db6",
      theme: "institucional",
      button_radius: 16,
      font_family: "Inter",
      public: 1
    };
    const database = {
      prepare(sql: string) {
        queries.push(sql);
        const statement = {
          bind() {
            return statement;
          },
          async first() {
            return profile;
          },
          async run() {
            return { success: true, results: [], meta: { changes: 1 } };
          }
        };
        return statement;
      }
    } as unknown as D1Database;

    const response = await app.request(
      "https://links.example.test/api/view/profile-sport",
      {
        method: "POST",
        body: JSON.stringify({ viewId: "view_123e4567-e89b-42d3-a456-426614174000" })
      },
      {
        DB: database,
        ENVIRONMENT: "production",
        AUTH_PROVIDER: "sim",
        APP_BASE_URL: "https://links.example.test"
      } as Bindings
    );

    expect(response.status).toBe(200);
    expect(queries.some((query) => /ON CONFLICT \(id\) DO NOTHING/.test(query))).toBe(true);
  });
});
