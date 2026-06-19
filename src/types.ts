export type Role = "ADMIN" | "GESTOR" | "EDITOR";
export type UserStatus = "active" | "inactive" | "suspended";

export type User = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  avatar?: string | null;
  description?: string | null;
  status?: UserStatus;
  active: boolean;
};

export type PublicProfile = {
  id: string;
  userId: string;
  slug: string;
  title: string;
  description: string;
  avatar: string;
  banner: string;
  primaryColor: string;
  secondaryColor: string;
  theme: string;
  buttonRadius: number;
  fontFamily: string;
  public: boolean;
};

export type LinkItem = {
  id: string;
  profileId: string;
  title: string;
  description: string;
  url: string;
  icon: string;
  order: number;
  active: boolean;
  featured: boolean;
  clicks: number;
};

export type AdminPermissions = {
  roleOnProfile: Role;
  canManageProfile: boolean;
  canCreateLinks: boolean;
  canDeleteLinks: boolean;
  canReorderLinks: boolean;
  canManageUsers: boolean;
  editableLinkIds: string[];
};

export type AdminState = {
  user: User;
  profile: PublicProfile;
  profiles: PublicProfile[];
  links: LinkItem[];
  permissions: AdminPermissions;
};

export type Analytics = {
  totals: {
    views: number;
    clicks: number;
    ctr: number;
  };
  timeline: Array<{
    label: string;
    views: number;
    clicks: number;
  }>;
  topLinks: Array<{
    id: string;
    title: string;
    url: string;
    clicks: number;
  }>;
};

export type Toast = {
  id: string;
  message: string;
  tone?: "success" | "error" | "info";
};
