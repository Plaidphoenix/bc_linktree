import { describe, expect, it } from "vitest";
import {
  canCreateOrDeleteLinks,
  canEditLink,
  canManageAllPages,
  canManageProfile,
  canManageUsers,
  type PolicyProfileAccess,
  type PolicyUser
} from "./policy";

const admin: PolicyUser = { id: "usr_admin", role: "ADMIN" };
const gestor: PolicyUser = { id: "usr_gestor", role: "GESTOR" };
const editor: PolicyUser = { id: "usr_editor", role: "EDITOR" };

const saudeForEditor: PolicyProfileAccess = {
  id: "prf_saude",
  userId: "usr_admin",
  permissionRole: "EDITOR"
};

const educacaoForGestor: PolicyProfileAccess = {
  id: "prf_educacao",
  userId: "usr_gestor",
  permissionRole: "GESTOR"
};

describe("worker authorization policy", () => {
  it("allows admins to manage all public pages and users", () => {
    expect(canManageAllPages(admin)).toBe(true);
    expect(canManageUsers(admin)).toBe(true);
    expect(canManageProfile(admin, saudeForEditor)).toBe(true);
    expect(canCreateOrDeleteLinks(admin, saudeForEditor)).toBe(true);
  });

  it("limits gestores to their assigned public page", () => {
    expect(canManageAllPages(gestor)).toBe(false);
    expect(canManageUsers(gestor)).toBe(false);
    expect(canManageProfile(gestor, educacaoForGestor)).toBe(true);
    expect(canCreateOrDeleteLinks(gestor, educacaoForGestor)).toBe(true);
    expect(canManageProfile(gestor, saudeForEditor)).toBe(false);
  });

  it("allows editors to edit only links approved by the admin", () => {
    expect(canManageProfile(editor, saudeForEditor)).toBe(false);
    expect(canCreateOrDeleteLinks(editor, saudeForEditor)).toBe(false);
    expect(canEditLink(editor, saudeForEditor, "lnk_transparencia", ["lnk_transparencia"])).toBe(true);
    expect(canEditLink(editor, saudeForEditor, "lnk_agendamento", ["lnk_transparencia"])).toBe(false);
  });
});

