import type { AdminState, Analytics, LinkItem, PublicProfile, User } from "../types";

export const DEMO_EMAIL = "admin@linkgov.local";
export const DEMO_PASSWORD = "Admin@123";

export const seedUsers: User[] = [
  {
    id: "usr_admin",
    name: "Carlos Eduardo",
    email: DEMO_EMAIL,
    username: "saude",
    role: "ADMIN",
    avatar: "/assets/crest.svg",
    description: "Administrador do portal institucional",
    status: "active",
    active: true
  },
  {
    id: "usr_gestor",
    name: "Ana Silva",
    email: "ana.silva@linkgov.local",
    username: "educacao",
    role: "GESTOR",
    avatar: "/assets/crest.svg",
    description: "Gestora de conteudo institucional",
    status: "active",
    active: true
  },
  {
    id: "usr_editor",
    name: "Marcos Lima",
    email: "marcos.lima@linkgov.local",
    username: "editor-saude",
    role: "EDITOR",
    avatar: "/assets/crest.svg",
    description: "Editor de links autorizados",
    status: "active",
    active: true
  }
];

export const seedProfiles: PublicProfile[] = [
  {
    id: "prf_saude",
    userId: "usr_admin",
    slug: "saude",
    title: "Secretaria Municipal de Saude",
    description: "Informacoes oficiais, agendamentos e servicos de saude para o cidadao.",
    avatar: "/assets/crest.svg",
    banner: "/assets/institutional-banner.svg",
    primaryColor: "#001e40",
    secondaryColor: "#005db6",
    theme: "institucional",
    buttonRadius: 16,
    fontFamily: "Inter",
    public: true
  },
  {
    id: "prf_educacao",
    userId: "usr_gestor",
    slug: "educacao",
    title: "Secretaria Municipal de Educacao",
    description: "Servicos educacionais, calendario escolar e atendimento a comunidade.",
    avatar: "/assets/crest.svg",
    banner: "/assets/institutional-banner.svg",
    primaryColor: "#123c69",
    secondaryColor: "#2f80ed",
    theme: "institucional",
    buttonRadius: 14,
    fontFamily: "Inter",
    public: true
  }
];

export const seedLinks: LinkItem[] = [
    {
      id: "lnk_transparencia",
      profileId: "prf_saude",
      title: "Portal da Transparencia",
      description: "Dados publicos e prestacao de contas.",
      url: "https://transparencia.gov.br",
      icon: "FileText",
      order: 1,
      active: true,
      featured: false,
      clicks: 15200
    },
    {
      id: "lnk_agendamento",
      profileId: "prf_saude",
      title: "Agendamento de Consultas",
      description: "Marque atendimento na rede municipal.",
      url: "https://saude.gov.br/agendar",
      icon: "CalendarDays",
      order: 2,
      active: true,
      featured: true,
      clicks: 12100
    },
    {
      id: "lnk_documentos",
      profileId: "prf_saude",
      title: "Solicitacao de Documentos",
      description: "Emissao e acompanhamento de solicitacoes.",
      url: "https://cidadao.gov.br/documentos",
      icon: "ClipboardList",
      order: 3,
      active: true,
      featured: false,
      clicks: 8400
    },
    {
      id: "lnk_farmacia",
      profileId: "prf_saude",
      title: "Farmacia Municipal",
      description: "Consulta de medicamentos disponiveis.",
      url: "https://saude.gov.br/farmacia",
      icon: "HeartPulse",
      order: 4,
      active: true,
      featured: false,
      clicks: 7200
    },
    {
      id: "lnk_whatsapp",
      profileId: "prf_saude",
      title: "WhatsApp Oficial",
      description: "Canal rapido de atendimento ao cidadao.",
      url: "https://wa.me/5500000000000",
      icon: "MessageCircle",
      order: 5,
      active: true,
      featured: true,
      clicks: 6500
    },
    {
      id: "lnk_matricula",
      profileId: "prf_educacao",
      title: "Matricula Escolar",
      description: "Inscricoes e acompanhamento de vagas.",
      url: "https://educacao.gov.br/matricula",
      icon: "ClipboardList",
      order: 1,
      active: true,
      featured: true,
      clicks: 5300
    },
    {
      id: "lnk_calendario",
      profileId: "prf_educacao",
      title: "Calendario Letivo",
      description: "Datas oficiais da rede municipal.",
      url: "https://educacao.gov.br/calendario",
      icon: "CalendarDays",
      order: 2,
      active: true,
      featured: false,
      clicks: 4200
    },
    {
      id: "lnk_transporte",
      profileId: "prf_educacao",
      title: "Transporte Escolar",
      description: "Rotas, cadastro e informacoes de atendimento.",
      url: "https://educacao.gov.br/transporte",
      icon: "Building2",
      order: 3,
      active: true,
      featured: false,
      clicks: 2100
    }
];

export const seedState: AdminState = {
  user: seedUsers[0],
  profile: seedProfiles[0],
  profiles: seedProfiles,
  links: seedLinks.filter((link) => link.profileId === "prf_saude"),
  permissions: {
    roleOnProfile: "ADMIN",
    canManageProfile: true,
    canCreateLinks: true,
    canDeleteLinks: true,
    canReorderLinks: true,
    canManageUsers: true,
    editableLinkIds: seedLinks.filter((link) => link.profileId === "prf_saude").map((link) => link.id)
  }
};

export const seedAnalytics: Analytics = {
  totals: {
    views: 124800,
    clicks: seedLinks.filter((link) => link.profileId === "prf_saude").reduce((sum, link) => sum + link.clicks, 0),
    ctr: 39.6
  },
  timeline: [
    { label: "Seg", views: 42, clicks: 16 },
    { label: "Ter", views: 60, clicks: 25 },
    { label: "Qua", views: 85, clicks: 40 },
    { label: "Qui", views: 55, clicks: 20 },
    { label: "Sex", views: 70, clicks: 30 },
    { label: "Sab", views: 65, clicks: 25 }
  ],
  topLinks: seedLinks
    .filter((link) => link.profileId === "prf_saude")
    .map(({ id, title, url, clicks }) => ({ id, title, url, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
};
