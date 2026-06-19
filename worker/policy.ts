export type PolicyRole = "ADMIN" | "GESTOR" | "EDITOR";

export type PermissionRole = "GESTOR" | "EDITOR";

export type PolicyUser = {
  id: string;
  role: PolicyRole;
};

export type PolicyProfileAccess = {
  id: string;
  userId: string;
  permissionRole?: PermissionRole | null;
};

export function canManageAllPages(user: PolicyUser) {
  return user.role === "ADMIN";
}

export function canManageUsers(user: PolicyUser) {
  return user.role === "ADMIN";
}

export function canApproveProfileChange(user: PolicyUser) {
  return user.role === "ADMIN";
}

export function canManageProfile(user: PolicyUser, profile: PolicyProfileAccess) {
  if (user.role === "ADMIN") {
    return true;
  }

  if (user.role !== "GESTOR") {
    return false;
  }

  return profile.userId === user.id || profile.permissionRole === "GESTOR";
}

export function canCreateOrDeleteLinks(user: PolicyUser, profile: PolicyProfileAccess) {
  return canManageProfile(user, profile);
}

export function canReorderLinks(user: PolicyUser, profile: PolicyProfileAccess) {
  return canManageProfile(user, profile);
}

export function canEditLink(
  user: PolicyUser,
  profile: PolicyProfileAccess,
  linkId: string,
  editableLinkIds: readonly string[]
) {
  if (canManageProfile(user, profile)) {
    return true;
  }

  if (user.role !== "EDITOR" || profile.permissionRole !== "EDITOR") {
    return false;
  }

  return editableLinkIds.includes(linkId);
}

