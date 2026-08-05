import { describe, expect, it } from "vitest";
import { canonicalAssetReference, resolveAssetReference } from "./index";

const environment = {
  ASSET_BASE_URL: "https://10.170.1.27:9443/api/assets"
};

describe("asset URL portability", () => {
  it("rebases an old localhost asset URL to the active HTTPS host", () => {
    expect(
      resolveAssetReference(
        "http://localhost:8787/api/assets/profile/avatar/image.png",
        environment,
        "/assets/crest.svg"
      )
    ).toBe("https://10.170.1.27:9443/api/assets/profile/avatar/image.png");
  });

  it("stores managed assets without a deployment hostname", () => {
    expect(
      canonicalAssetReference(
        "https://old-host.example/api/assets/profile/banner/image.webp",
        "/assets/institutional-banner.svg"
      )
    ).toBe("/api/assets/profile/banner/image.webp");
  });

  it("keeps approved external images unchanged", () => {
    expect(
      resolveAssetReference(
        "https://images.example.gov.br/brasao.png",
        environment,
        "/assets/crest.svg"
      )
    ).toBe("https://images.example.gov.br/brasao.png");
  });

  it("rejects traversal disguised as an internal asset URL", () => {
    expect(
      canonicalAssetReference(
        "https://old-host.example/api/assets/profile/%2e%2e/private.txt",
        "/assets/crest.svg"
      )
    ).toBe("/assets/crest.svg");
  });

  it("drops query strings before storing a managed asset reference", () => {
    expect(
      canonicalAssetReference(
        "https://old-host.example/api/assets/profile/avatar/image.png?v=2",
        "/assets/crest.svg"
      )
    ).toBe("/api/assets/profile/avatar/image.png");
  });
});
