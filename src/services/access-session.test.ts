import { beforeEach, describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { accessSessionStore, asReadOnlyAdminState } from "./access-session";

describe("Cloudflare Access session persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores the last authenticated admin state and route", () => {
    accessSessionStore.mark(seedState.user);
    accessSessionStore.cacheAdminState(seedState);
    accessSessionStore.rememberAdminPath("/admin/appearance");

    expect(accessSessionStore.hasSession()).toBe(true);
    expect(accessSessionStore.getCachedAdminState()).toEqual(seedState);
    expect(accessSessionStore.getLastAdminPath()).toBe("/admin/appearance");
  });

  it("ignores malformed cache data and unsafe routes", () => {
    localStorage.setItem("linkgov.admin-cache", "not-json");
    accessSessionStore.rememberAdminPath("https://example.com/admin/links");

    expect(accessSessionStore.getCachedAdminState()).toBeNull();
    expect(accessSessionStore.getLastAdminPath()).toBe("/admin/links");
  });

  it("removes mutation permissions from cached offline state", () => {
    const readOnly = asReadOnlyAdminState(seedState);

    expect(readOnly.permissions.roleOnProfile).toBe("ADMIN");
    expect(readOnly.permissions.canManageProfile).toBe(false);
    expect(readOnly.permissions.canCreateLinks).toBe(false);
    expect(readOnly.permissions.canManageUsers).toBe(false);
    expect(readOnly.permissions.editableLinkIds).toEqual([]);
    expect(seedState.permissions.canManageProfile).toBe(true);
  });

  it("rejects cached admin data from a different Access identity", () => {
    accessSessionStore.mark(seedState.user);
    accessSessionStore.cacheAdminState(seedState);

    accessSessionStore.mark({ id: "usr_other", email: "other@example.invalid" });

    expect(accessSessionStore.hasSession()).toBe(true);
    expect(accessSessionStore.getCachedAdminState()).toBeNull();
    expect(accessSessionStore.getLastAdminPath()).toBe("/admin/links");
  });

  it("requires an authenticated identity marker before returning offline cache", () => {
    accessSessionStore.mark(seedState.user);
    accessSessionStore.cacheAdminState(seedState);
    localStorage.removeItem("linkgov.access-session");

    expect(accessSessionStore.getCachedAdminState()).toBeNull();
  });

  it("clears malformed identity metadata instead of trusting it", () => {
    localStorage.setItem("linkgov.access-session", "{}");
    localStorage.setItem("linkgov.admin-cache", "{}");

    expect(() => accessSessionStore.mark(seedState.user)).not.toThrow();
    expect(accessSessionStore.getCachedAdminState()).toBeNull();
  });

  it("clears the access marker, cache and remembered route on logout", () => {
    accessSessionStore.mark(seedState.user);
    accessSessionStore.cacheAdminState(seedState);
    accessSessionStore.rememberAdminPath("/admin/users");

    accessSessionStore.clear();

    expect(accessSessionStore.hasSession()).toBe(false);
    expect(accessSessionStore.getCachedAdminState()).toBeNull();
    expect(accessSessionStore.getLastAdminPath()).toBe("/admin/links");
  });
});
