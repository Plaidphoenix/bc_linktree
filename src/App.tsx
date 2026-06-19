import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  HeartPulse,
  KeyRound,
  Link as LinkIconBase,
  LogOut,
  Mail,
  MessageCircle,
  Palette,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserRound,
  Users,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./data/seed";
import {
  createLink,
  createProfile,
  createUser,
  deleteLink,
  deleteUser,
  getAdminState,
  getAnalytics,
  getPublicProfile,
  getUsers,
  login,
  logout,
  requestPasswordReset,
  reorderLinks,
  resetPassword,
  sessionStore,
  trackClick,
  updateLink,
  updateProfile,
  updateUserStatus,
  uploadProfileAsset
} from "./services/api";
import type { AdminPermissions, AdminState, Analytics, LinkItem, PublicProfile, Toast, User, UserStatus } from "./types";
import { createId } from "./utils/id";

type AdminSection = "links" | "appearance" | "analytics" | "pages" | "users" | "settings";

const iconMap = {
  Link: LinkIconBase,
  FileText,
  CalendarDays,
  ClipboardList,
  HeartPulse,
  MessageCircle,
  Building2,
  ShieldCheck
};

const iconOptions = Object.keys(iconMap);

export function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (path === "/login") {
    return <LoginPage navigate={navigate} />;
  }

  if (path === "/reset-password") {
    return <ResetPasswordPage navigate={navigate} />;
  }

  if (path.startsWith("/admin")) {
    return <AdminApp navigate={navigate} path={path} />;
  }

  const slug = path.replace(/^\/@?/, "") || "saude";
  return <PublicProfilePage slug={slug} navigate={navigate} />;
}

function LoginPage({ navigate }: { navigate: (to: string) => void }) {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(DEMO_EMAIL);
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(email, password);
      navigate("/admin/links");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  };

  const submitPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setResetLoading(true);
    setResetMessage("");
    try {
      const response = await requestPasswordReset(resetEmail);
      setResetMessage(response.message || "Se o e-mail existir, enviaremos um link seguro para cadastrar uma nova senha.");
    } catch (err) {
      setResetMessage(err instanceof Error ? err.message : "Nao foi possivel solicitar a redefinicao.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-visual">
        <div className="login-visual__content">
          <BrandMark inverse />
          <h1>Conectando o cidadao ao futuro digital.</h1>
          <p>
            Gerencie paginas publicas de links com seguranca, padronizacao visual e publicacao
            instantanea para cada secretaria, setor ou projeto.
          </p>
          <div className="trust-row">
            <span>
              <ShieldCheck size={18} /> Acesso seguro
            </span>
            <span>
              <Building2 size={18} /> Gestao unificada
            </span>
          </div>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <BrandMark />
          <div>
            <h2 id="login-title">Entrar na conta</h2>
            <p>Portal de acesso para gestores e administradores institucionais.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <label>
              <span>E-mail institucional</span>
              <span className="input-with-icon">
                <Mail size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </span>
            </label>
            <label>
              <span>Senha</span>
              <span className="input-with-icon">
                <ShieldCheck size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="icon-button ghost" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  <span className="sr-only">Alternar visibilidade da senha</span>
                </button>
              </span>
            </label>
            <button type="button" className="text-link align-right" onClick={() => setForgotOpen(true)}>
              Esqueceu a senha?
            </button>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar no sistema"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="demo-box">
            <span>Credenciais demo</span>
            <code>{DEMO_EMAIL}</code>
            <code>{DEMO_PASSWORD}</code>
          </div>
        </div>
      </section>
      {forgotOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Redefinir senha</h3>
            <p>Informe o e-mail real do usuario para receber um link seguro de cadastro de nova senha.</p>
            <form className="form-stack" onSubmit={submitPasswordReset}>
              <label>
                <span>E-mail institucional</span>
                <span className="input-with-icon">
                  <Mail size={18} />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </span>
              </label>
              {resetMessage ? <p className="form-success">{resetMessage}</p> : null}
              <div className="modal-actions">
                <button type="button" className="secondary-action" onClick={() => setForgotOpen(false)}>
                  Cancelar
                </button>
                <button className="primary-action compact" type="submit" disabled={resetLoading}>
                  <Mail size={16} /> {resetLoading ? "Enviando..." : "Enviar link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ResetPasswordPage({ navigate }: { navigate: (to: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 10) {
      setError("Use uma senha com pelo menos 10 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas digitadas nao conferem.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setMessage("Senha atualizada. Voce ja pode entrar novamente.");
      window.setTimeout(() => navigate("/login"), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-visual">
        <div className="login-visual__content">
          <BrandMark inverse />
          <h1>Nova senha institucional.</h1>
          <p>O link enviado por e-mail expira rapidamente e invalida sessoes antigas apos a alteracao.</p>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="reset-title">
        <div className="login-card">
          <BrandMark />
          <div>
            <h2 id="reset-title">Cadastrar nova senha</h2>
            <p>Digite uma senha forte para concluir a redefinicao.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            <label>
              <span>Nova senha</span>
              <span className="input-with-icon">
                <KeyRound size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button type="button" className="icon-button ghost" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  <span className="sr-only">Alternar visibilidade da senha</span>
                </button>
              </span>
            </label>
            <label>
              <span>Confirmar senha</span>
              <span className="input-with-icon">
                <ShieldCheck size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </span>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="form-success">{message}</p> : null}
            <button className="primary-action" type="submit" disabled={loading || !token}>
              {loading ? "Salvando..." : "Atualizar senha"}
              <ArrowRight size={18} />
            </button>
            <button type="button" className="text-link" onClick={() => navigate("/login")}>
              Voltar para o login
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function PublicProfilePage({ slug, navigate }: { slug: string; navigate: (to: string) => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPublicProfile(slug)
      .then((data) => {
        if (cancelled) return;
        setProfile(data.profile);
        setLinks(data.links);
        document.title = `${data.profile.title} | LinkGov Institutional`;
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Perfil nao encontrado.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return <LoadingState label="Carregando pagina publica..." />;
  }

  if (error || !profile) {
    return (
      <EmptyState
        title="Pagina nao encontrada"
        description={error || "Este perfil nao esta publico ou nao existe."}
        actionLabel="Ir para login"
        onAction={() => navigate("/login")}
      />
    );
  }

  return (
    <main
      className="public-page"
      style={
        {
          "--profile-primary": profile.primaryColor,
          "--profile-secondary": profile.secondaryColor,
          "--button-radius": `${profile.buttonRadius}px`
        } as React.CSSProperties
      }
    >
      <header className="public-topbar">
        <BrandMark />
        <button className="icon-text-button" onClick={() => navigate("/login")}>
          <UserRound size={18} /> Painel
        </button>
      </header>
      <section className="public-card">
        <div className="public-banner">
          <img src={profile.banner} alt="" />
        </div>
        <img className="public-avatar" src={profile.avatar} alt={`Avatar de ${profile.title}`} />
        <h1>{profile.title}</h1>
        <p>{profile.description}</p>
        <div className="public-links">
          {links.map((link) => (
            <PublicLinkButton key={link.id} link={link} profile={profile} />
          ))}
        </div>
        <p className="public-note">
          <ShieldCheck size={16} /> Conteudo institucional verificado
        </p>
      </section>
      <footer className="public-footer">
        <span>{profile.title}</span>
        <nav aria-label="Links institucionais">
          <a href="#">Privacidade</a>
          <a href="#">Termos de Uso</a>
          <a href="#">Acessibilidade</a>
        </nav>
      </footer>
    </main>
  );
}

function PublicLinkButton({ link, profile }: { link: LinkItem; profile: PublicProfile }) {
  const Icon = getIcon(link.icon);

  const openLink = async () => {
    await trackClick(link);
    window.open(link.url, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      className={`public-link ${link.featured ? "featured" : ""}`}
      onClick={openLink}
      style={
        link.featured
          ? ({ "--featured-bg": profile.primaryColor, "--featured-fg": "#ffffff" } as React.CSSProperties)
          : undefined
      }
    >
      <span className="public-link__icon">
        <Icon size={22} />
      </span>
      <span>
        <strong>{link.title}</strong>
        {link.description ? <small>{link.description}</small> : null}
      </span>
      <ChevronRight size={20} />
    </button>
  );
}

function AdminApp({ navigate, path }: { navigate: (to: string) => void; path: string }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const section = getAdminSection(path);

  useEffect(() => {
    if (!sessionStore.getToken()) {
      navigate("/login");
      return;
    }

    let cancelled = false;
    getAdminState()
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const pushToast = (message: string, tone: Toast["tone"] = "success") => {
    const toast = { id: createId("toast"), message, tone };
    setToasts((items) => [...items, toast]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== toast.id));
    }, 3600);
  };

  const exit = async () => {
    await logout();
    navigate("/login");
  };

  const switchProfile = async (profileId: string) => {
    const next = await getAdminState(profileId);
    setState(next);
    pushToast("Pagina publica selecionada.", "info");
  };

  if (loading || !state) {
    return <LoadingState label="Carregando painel administrativo..." />;
  }

  const updateState = (next: Partial<AdminState>) => setState((current) => (current ? { ...current, ...next } : current));

  return (
    <div className="admin-layout">
      <Sidebar section={section} navigate={navigate} profile={state.profile} permissions={state.permissions} onLogout={exit} />
      <main className="admin-main">
        <AdminHeader
          user={state.user}
          profile={state.profile}
          profiles={state.profiles}
          permissions={state.permissions}
          navigate={navigate}
          onLogout={exit}
          onProfileChange={switchProfile}
        />
        {section === "links" ? (
          <LinksPage state={state} updateState={updateState} pushToast={pushToast} />
        ) : null}
        {section === "appearance" ? (
          <AppearancePage state={state} updateState={updateState} pushToast={pushToast} />
        ) : null}
        {section === "analytics" ? <AnalyticsPage profileId={state.profile.id} /> : null}
        {section === "pages" ? <PagesPage state={state} updateState={updateState} pushToast={pushToast} navigate={navigate} /> : null}
        {section === "users" ? (
          <UsersPage
            currentUser={state.user}
            permissions={state.permissions}
            profiles={state.profiles}
            activeProfile={state.profile}
            links={state.links}
          />
        ) : null}
        {section === "settings" ? <SettingsPage user={state.user} /> : null}
      </main>
      <BottomNav section={section} navigate={navigate} permissions={state.permissions} />
      <ToastStack toasts={toasts} />
    </div>
  );
}

function Sidebar({
  section,
  navigate,
  profile,
  permissions,
  onLogout
}: {
  section: AdminSection;
  navigate: (to: string) => void;
  profile: PublicProfile;
  permissions: AdminPermissions;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <BrandMark />
      <div className="sidebar-profile">
        <img src={profile.avatar} alt="" />
        <div>
          <strong>Administrador</strong>
          <span>Portal Institucional</span>
        </div>
      </div>
      <nav>
        <NavButton active={section === "links"} icon={<LinkIconBase />} label="Links" onClick={() => navigate("/admin/links")} />
        <NavButton active={section === "appearance"} icon={<Palette />} label="Aparencia" onClick={() => navigate("/admin/appearance")} />
        <NavButton active={section === "analytics"} icon={<BarChart3 />} label="Analiticos" onClick={() => navigate("/admin/analytics")} />
        {permissions.canManageUsers ? (
          <NavButton active={section === "pages"} icon={<FileText />} label="Paginas" onClick={() => navigate("/admin/pages")} />
        ) : null}
        {permissions.canManageUsers ? (
          <NavButton active={section === "users"} icon={<Users />} label="Usuarios" onClick={() => navigate("/admin/users")} />
        ) : null}
      </nav>
      <button className="primary-action compact" onClick={() => navigate(`/@${profile.slug}`)}>
        <Eye size={17} /> Ver pagina publica
      </button>
      <div className="sidebar-footer">
        <NavButton active={section === "settings"} icon={<Settings />} label="Configuracoes" onClick={() => navigate("/admin/settings")} />
        <NavButton icon={<LogOut />} label="Sair" onClick={onLogout} />
      </div>
    </aside>
  );
}

function AdminHeader({
  user,
  profile,
  profiles,
  permissions,
  navigate,
  onLogout,
  onProfileChange
}: {
  user: User;
  profile: PublicProfile;
  profiles: PublicProfile[];
  permissions: AdminPermissions;
  navigate: (to: string) => void;
  onLogout: () => void;
  onProfileChange: (profileId: string) => void;
}) {
  return (
    <header className="admin-header">
      <div>
        <span className="eyebrow">Painel Gestor</span>
        <h1>{profile.title}</h1>
        <span className="role-badge">{permissions.roleOnProfile}</span>
      </div>
      <div className="admin-header-actions">
        {profiles.length > 1 ? (
          <label className="profile-switcher">
            <span className="sr-only">Selecionar pagina publica</span>
            <select value={profile.id} onChange={(event) => onProfileChange(event.target.value)}>
              {profiles.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="icon-button" onClick={() => navigate(`/@${profile.slug}`)}>
          <Eye size={18} />
          <span className="sr-only">Ver pagina publica</span>
        </button>
        <button className="icon-button">
          <Bell size={18} />
          <span className="sr-only">Notificacoes</span>
        </button>
        <button className="avatar-button" onClick={onLogout} title="Sair">
          <img src={user.avatar || "/assets/crest.svg"} alt="" />
        </button>
      </div>
    </header>
  );
}

function LinksPage({
  state,
  updateState,
  pushToast
}: {
  state: AdminState;
  updateState: (next: Partial<AdminState>) => void;
  pushToast: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [editing, setEditing] = useState<LinkItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkItem | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const orderedLinks = [...state.links].sort((a, b) => a.order - b.order);

  const onDragEnd = async (event: DragEndEvent) => {
    if (!state.permissions.canReorderLinks) {
      pushToast("Seu perfil nao pode reordenar links.", "error");
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedLinks.findIndex((link) => link.id === active.id);
    const newIndex = orderedLinks.findIndex((link) => link.id === over.id);
    const next = arrayMove(orderedLinks, oldIndex, newIndex).map((link, index) => ({ ...link, order: index + 1 }));
    updateState({ links: next });
    const saved = await reorderLinks(next, state.profile.id);
    updateState({ links: saved });
    pushToast("Ordem dos links atualizada.");
  };

  const addLink = async () => {
    if (!state.permissions.canCreateLinks) {
      pushToast("Seu perfil nao pode criar links nesta pagina.", "error");
      return;
    }

    const link = await createLink({
      profileId: state.profile.id,
      title: "Novo servico",
      description: "Descricao curta do servico.",
      url: "https://example.gov.br",
      icon: "Link",
      active: true,
      featured: false
    });
    updateState({
      links: [...state.links, link],
      permissions: {
        ...state.permissions,
        editableLinkIds: state.permissions.editableLinkIds.includes(link.id)
          ? state.permissions.editableLinkIds
          : [...state.permissions.editableLinkIds, link.id]
      }
    });
    setEditing(link);
    pushToast("Novo link criado.");
  };

  const saveLink = async (link: LinkItem) => {
    try {
      new URL(link.url);
      const saved = await updateLink(link);
      updateState({ links: state.links.map((item) => (item.id === saved.id ? saved : item)) });
      setEditing(null);
      pushToast("Link salvo.");
    } catch {
      pushToast("Use uma URL valida com http ou https.", "error");
    }
  };

  const removeLink = async () => {
    if (!deleteTarget) return;
    if (!state.permissions.canDeleteLinks) {
      pushToast("Seu perfil nao pode excluir links nesta pagina.", "error");
      setDeleteTarget(null);
      return;
    }
    await deleteLink(deleteTarget.id);
    updateState({ links: state.links.filter((link) => link.id !== deleteTarget.id) });
    setDeleteTarget(null);
    pushToast("Link removido.");
  };

  return (
    <section className="admin-grid">
      <div className="content-column">
        <PageTitle
          title="Meus Links"
          description="Gerencie os links institucionais exibidos no perfil publico."
          action={
            <button className="primary-action" onClick={addLink} disabled={!state.permissions.canCreateLinks}>
              <Plus size={18} /> Adicionar novo link
            </button>
          }
        />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedLinks.map((link) => link.id)} strategy={verticalListSortingStrategy}>
            <div className="link-list">
              {orderedLinks.map((link) => (
                <SortableLinkCard
                  key={link.id}
                  link={link}
                  editing={editing?.id === link.id}
                  canDrag={state.permissions.canReorderLinks}
                  canEdit={state.permissions.canManageProfile || state.permissions.editableLinkIds.includes(link.id)}
                  canManage={state.permissions.canManageProfile}
                  canDelete={state.permissions.canDeleteLinks}
                  onEdit={() => {
                    if (!state.permissions.canManageProfile && !state.permissions.editableLinkIds.includes(link.id)) {
                      pushToast("Editor nao autorizado para este link.", "error");
                      return;
                    }
                    setEditing(link);
                  }}
                  onCancel={() => setEditing(null)}
                  onSave={saveLink}
                  onDelete={() => setDeleteTarget(link)}
                  onQuickChange={async (next) => {
                    const saved = await updateLink(next);
                    updateState({ links: state.links.map((item) => (item.id === saved.id ? saved : item)) });
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <PreviewColumn profile={state.profile} links={orderedLinks} />
      {deleteTarget ? (
        <ConfirmDialog
          title="Remover link?"
          description={`O link "${deleteTarget.title}" sera removido do painel e da pagina publica.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={removeLink}
        />
      ) : null}
    </section>
  );
}

function SortableLinkCard({
  link,
  editing,
  canDrag,
  canEdit,
  canManage,
  canDelete,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onQuickChange
}: {
  link: LinkItem;
  editing: boolean;
  canDrag: boolean;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (link: LinkItem) => void;
  onDelete: () => void;
  onQuickChange: (link: LinkItem) => void;
}) {
  const [draft, setDraft] = useState(link);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  const Icon = getIcon(link.icon);

  useEffect(() => setDraft(link), [link]);

  return (
    <article
      className={`link-card ${!link.active ? "muted" : ""} ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className="drag-handle" {...attributes} {...listeners} aria-label="Arrastar link" disabled={!canDrag}>
        <GripVertical size={20} />
      </button>
      <div className="link-card-main">
        {editing ? (
          <div className="edit-grid">
            <label>
              <span>Titulo</span>
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              <span>URL</span>
              <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />
            </label>
            <label>
              <span>Descricao</span>
              <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </label>
            <label>
              <span>Icone</span>
              <select value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.target.value })}>
                {iconOptions.map((icon) => (
                  <option value={icon} key={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
            <div className="edit-actions">
              <button className="secondary-action" onClick={onCancel}>
                <X size={16} /> Cancelar
              </button>
              <button className="primary-action compact" onClick={() => onSave(draft)}>
                <Save size={16} /> Salvar
              </button>
            </div>
          </div>
        ) : (
          <>
            <span className="link-icon">
              <Icon size={20} />
            </span>
            <div>
              <strong>{link.title}</strong>
              <span>{link.url}</span>
            </div>
          </>
        )}
      </div>
      {!editing ? (
        <div className="link-actions">
          <label className="switch">
            <input
              type="checkbox"
              checked={link.active}
              disabled={!canManage}
              onChange={(event) => onQuickChange({ ...link, active: event.target.checked })}
            />
            <span />
            <span className="sr-only">Alternar visibilidade</span>
          </label>
          <button
            className={`icon-button ${link.featured ? "selected" : ""}`}
            onClick={() => onQuickChange({ ...link, featured: !link.featured })}
            title="Destacar link"
            disabled={!canManage}
          >
            <Activity size={18} />
          </button>
          <button className="icon-button" onClick={onEdit} title="Editar" disabled={!canEdit}>
            <Palette size={18} />
          </button>
          <button className="icon-button danger" onClick={onDelete} title="Excluir" disabled={!canDelete}>
            <Trash2 size={18} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function AppearancePage({
  state,
  updateState,
  pushToast
}: {
  state: AdminState;
  updateState: (next: Partial<AdminState>) => void;
  pushToast: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [draft, setDraft] = useState(state.profile);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const canManage = state.permissions.canManageProfile;

  useEffect(() => setDraft(state.profile), [state.profile]);

  const save = async () => {
    if (!canManage) {
      pushToast("Seu perfil nao pode alterar a aparencia desta pagina.", "error");
      return;
    }
    try {
      const saved = await updateProfile(draft);
      setDraft(saved);
      updateState({
        profile: saved,
        profiles: state.profiles.map((profile) => (profile.id === saved.id ? saved : profile))
      });
      pushToast("Aparencia publicada.");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Nao foi possivel publicar a aparencia.", "error");
    }
  };

  const uploadAsset = async (kind: "avatar" | "banner", file: File | null) => {
    if (!file) return;
    if (!canManage) {
      pushToast("Seu perfil nao pode enviar imagens nesta pagina.", "error");
      return;
    }

    setUploading(kind);
    try {
      await validateImageForUpload(file, kind);
      const response = await uploadProfileAsset(kind, file, state.profile.id);
      const nextProfile = response.profile || { ...draft, [kind]: response.url };
      setDraft(nextProfile);
      updateState({
        profile: nextProfile,
        profiles: state.profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile))
      });
      pushToast(`${kind === "avatar" ? "Avatar" : "Banner"} enviado para o R2.`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Nao foi possivel enviar a imagem.", "error");
    } finally {
      setUploading(null);
    }
  };

  return (
    <section className="admin-grid">
      <div className="content-column">
        <PageTitle
          title="Configuracoes de Aparencia"
          description="Personalize identidade visual, dados publicos e comportamento da pagina."
          action={
            <button className="primary-action" onClick={save} disabled={!canManage}>
              <Save size={18} /> Publicar alteracoes
            </button>
          }
        />
        <div className="panel-stack">
          <Panel title="Perfil e pagina publica" icon={<UserRound />}>
            <div className="form-grid">
              <label>
                <span>Nome da pagina</span>
                <input value={draft.title} disabled={!canManage} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label>
                <span>Slug publico</span>
                <input value={draft.slug} disabled={!canManage} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
              </label>
              <label className="span-2">
                <span>Descricao curta</span>
                <textarea
                  value={draft.description}
                  disabled={!canManage}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label>
                <span>Avatar ou logotipo</span>
                <input value={draft.avatar} disabled={!canManage} onChange={(event) => setDraft({ ...draft, avatar: event.target.value })} />
                <span className="file-action">
                  <Upload size={16} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!canManage || uploading === "avatar"}
                    onChange={(event) => uploadAsset("avatar", event.target.files?.[0] || null)}
                  />
                  {uploading === "avatar" ? "Enviando..." : "Enviar imagem"}
                </span>
              </label>
              <label>
                <span>Banner</span>
                <input value={draft.banner} disabled={!canManage} onChange={(event) => setDraft({ ...draft, banner: event.target.value })} />
                <span className="file-action">
                  <Upload size={16} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!canManage || uploading === "banner"}
                    onChange={(event) => uploadAsset("banner", event.target.files?.[0] || null)}
                  />
                  {uploading === "banner" ? "Enviando..." : "Enviar imagem"}
                </span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.public}
                  disabled={!canManage}
                  onChange={(event) => setDraft({ ...draft, public: event.target.checked })}
                />
                <span>Pagina publica visivel</span>
              </label>
            </div>
          </Panel>
          <Panel title="Temas e cores" icon={<Palette />}>
            <div className="theme-grid">
              {[
                ["institucional", "#001e40", "#005db6"],
                ["ecologico", "#1b5e20", "#4caf50"],
                ["minimalista", "#212121", "#757575"]
              ].map(([theme, primary, secondary]) => (
                <button
                  className={`theme-option ${draft.theme === theme ? "active" : ""}`}
                  key={theme}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      theme,
                      primaryColor: primary,
                      secondaryColor: secondary
                    })
                  }
                  disabled={!canManage}
                >
                  <span style={{ background: primary }} />
                  <span style={{ background: secondary }} />
                  <strong>{theme}</strong>
                </button>
              ))}
            </div>
            <div className="form-grid compact-grid">
              <label>
                <span>Cor primaria</span>
                <input
                  type="color"
                  value={draft.primaryColor}
                  disabled={!canManage}
                  onChange={(event) => setDraft({ ...draft, primaryColor: event.target.value })}
                />
              </label>
              <label>
                <span>Cor de destaque</span>
                <input
                  type="color"
                  value={draft.secondaryColor}
                  disabled={!canManage}
                  onChange={(event) => setDraft({ ...draft, secondaryColor: event.target.value })}
                />
              </label>
              <label>
                <span>Arredondamento: {draft.buttonRadius}px</span>
                <input
                  type="range"
                  min={0}
                  max={32}
                  step={4}
                  value={draft.buttonRadius}
                  disabled={!canManage}
                  onChange={(event) => setDraft({ ...draft, buttonRadius: Number(event.target.value) })}
                />
              </label>
              <label>
                <span>Fonte</span>
                <select value={draft.fontFamily} disabled={!canManage} onChange={(event) => setDraft({ ...draft, fontFamily: event.target.value })}>
                  <option value="Inter">Inter</option>
                  <option value="Georgia">Georgia</option>
                </select>
              </label>
            </div>
          </Panel>
        </div>
      </div>
      <PreviewColumn profile={draft} links={state.links} />
    </section>
  );
}

function AnalyticsPage({ profileId }: { profileId: string }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    setAnalytics(null);
    getAnalytics(profileId).then(setAnalytics);
  }, [profileId]);

  if (!analytics) {
    return <LoadingState label="Carregando analiticos..." inline />;
  }

  const max = Math.max(...analytics.timeline.map((item) => item.views));

  return (
    <section className="single-column-page">
      <PageTitle title="Analiticos" description="Acompanhe visualizacoes, cliques e desempenho dos links publicados." />
      <div className="metric-grid">
        <MetricCard label="Visualizacoes totais" value={formatNumber(analytics.totals.views)} icon={<Eye />} />
        <MetricCard label="Cliques totais" value={formatNumber(analytics.totals.clicks)} icon={<Activity />} />
        <MetricCard label="CTR media" value={`${analytics.totals.ctr}%`} icon={<BarChart3 />} />
      </div>
      <Panel title="Desempenho temporal" icon={<BarChart3 />}>
        <div className="bar-chart">
          {analytics.timeline.map((item) => (
            <div className="bar-column" key={item.label}>
              <span className="bar views" style={{ height: `${(item.views / max) * 100}%` }} />
              <span className="bar clicks" style={{ height: `${(item.clicks / max) * 100}%` }} />
              <strong>{item.label}</strong>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Links mais acessados" icon={<LinkIconBase />}>
        <div className="rank-list">
          {analytics.topLinks.map((link) => (
            <div className="rank-row" key={link.id}>
              <div>
                <strong>{link.title}</strong>
                <span>{link.url}</span>
              </div>
              <b>{formatNumber(link.clicks)}</b>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function PagesPage({
  state,
  updateState,
  pushToast,
  navigate
}: {
  state: AdminState;
  updateState: (next: Partial<AdminState>) => void;
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  navigate: (to: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<User[]>([state.user]);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    managerUserId: state.user.id
  });

  useEffect(() => {
    if (state.permissions.canManageUsers) {
      getUsers()
        .then(setUsers)
        .catch(() => setUsers([state.user]));
    }
  }, [state.permissions.canManageUsers, state.user]);

  const managerOptions = users.filter((user) => user.role === "ADMIN" || user.role === "GESTOR");

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!state.permissions.canManageUsers) {
      pushToast("Apenas administradores podem criar paginas publicas.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const profile = await createProfile(form);
      const profiles = [...state.profiles.filter((item) => item.id !== profile.id), profile].sort((a, b) =>
        a.title.localeCompare(b.title)
      );
      updateState({
        profile,
        profiles,
        links: [],
        permissions: {
          ...state.permissions,
          roleOnProfile: "ADMIN",
          canManageProfile: true,
          canCreateLinks: true,
          canDeleteLinks: true,
          canReorderLinks: true,
          editableLinkIds: []
        }
      });
      setForm({ title: "", slug: "", description: "", managerUserId: state.user.id });
      setCreating(false);
      pushToast("Pagina publica criada.");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Nao foi possivel criar a pagina.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!state.permissions.canManageUsers) {
    return (
      <section className="single-column-page">
        <PageTitle title="Paginas Publicas" description="Acesso restrito ao administrador geral." />
        <Panel title="Permissao insuficiente" icon={<ShieldCheck />}>
          <p className="help-text">Gestores e editores administram apenas as paginas autorizadas.</p>
        </Panel>
      </section>
    );
  }

  return (
    <section className="single-column-page">
      <PageTitle
        title="Paginas Publicas"
        description="Crie e administre paginas dinamicas sem pastas fisicas no computador servidor."
        action={
          <button className="primary-action" onClick={() => setCreating(true)}>
            <Plus size={18} /> Nova pagina
          </button>
        }
      />
      <div className="page-card-grid">
        {state.profiles.map((profile) => (
          <article className="page-card" key={profile.id}>
            <img src={profile.avatar} alt="" />
            <div>
              <strong>{profile.title}</strong>
              <span>@{profile.slug}</span>
              <small>{profile.description}</small>
            </div>
            <div className="page-card-actions">
              <b>{profile.public ? "Publica" : "Rascunho"}</b>
              <button className="icon-button" title="Abrir pagina publica" onClick={() => navigate(`/@${profile.slug}`)}>
                <Eye size={18} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {creating ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card wide-modal">
            <h3>Nova pagina publica</h3>
            <p>A pagina nasce no banco de dados local e fica acessivel por /@slug na rede.</p>
            <form className="form-grid user-form" onSubmit={submitProfile}>
              <label>
                <span>Nome da pagina</span>
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => {
                      const nextTitle = event.target.value;
                      const slugWasAutomatic = !current.slug || current.slug === slugFromText(current.title);
                      return {
                        ...current,
                        title: nextTitle,
                        slug: slugWasAutomatic ? slugFromText(nextTitle) : current.slug
                      };
                    })
                  }
                  required
                />
              </label>
              <label>
                <span>Link publico</span>
                <input value={form.slug} onChange={(event) => setForm({ ...form, slug: slugFromText(event.target.value) })} required />
              </label>
              <label className="span-2">
                <span>Gestor responsavel</span>
                <select value={form.managerUserId} onChange={(event) => setForm({ ...form, managerUserId: event.target.value })}>
                  {managerOptions.map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.name} - {user.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                <span>Descricao</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Servicos, documentos e canais oficiais desta area."
                />
              </label>
              <div className="modal-actions span-2">
                <button type="button" className="secondary-action" onClick={() => setCreating(false)}>
                  Cancelar
                </button>
                <button className="primary-action compact" type="submit" disabled={submitting}>
                  <Plus size={16} /> {submitting ? "Criando..." : "Criar pagina"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const emptyUserForm = {
  name: "",
  email: "",
  username: "",
  role: "EDITOR" as User["role"],
  status: "active" as UserStatus,
  password: "Admin@123",
  description: "",
  profileId: "",
  linkIds: [] as string[]
};

function UsersPage({
  currentUser,
  permissions,
  profiles,
  activeProfile,
  links
}: {
  currentUser: User;
  permissions: AdminPermissions;
  profiles: PublicProfile[];
  activeProfile: PublicProfile;
  links: LinkItem[];
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyUserForm, profileId: activeProfile.id });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (permissions.canManageUsers) {
      getUsers().then(setUsers);
    }
  }, [permissions.canManageUsers]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      profileId: current.profileId || activeProfile.id
    }));
  }, [activeProfile.id]);

  const reloadUsers = async () => setUsers(await getUsers());

  const submitUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const created = await createUser({ ...form, profileId: form.profileId || activeProfile.id });
    setUsers((items) => [...items, created]);
    setForm({ ...emptyUserForm, profileId: activeProfile.id });
    setCreating(false);
  };

  const changeStatus = async (user: User, status: UserStatus) => {
    setBusyUserId(user.id);
    try {
      const updated = await updateUserStatus(user.id, status);
      setUsers((items) => items.map((item) => (item.id === user.id ? updated : item)));
    } finally {
      setBusyUserId(null);
    }
  };

  const removeUser = async (user: User) => {
    setBusyUserId(user.id);
    try {
      await deleteUser(user.id);
      await reloadUsers();
    } finally {
      setBusyUserId(null);
    }
  };

  if (!permissions.canManageUsers) {
    return (
      <section className="single-column-page">
        <PageTitle title="Gestao de Usuarios" description="Acesso restrito ao administrador geral." />
        <Panel title="Permissao insuficiente" icon={<ShieldCheck />}>
          <p className="help-text">Seu perfil atual administra apenas a pagina publica autorizada.</p>
        </Panel>
      </section>
    );
  }

  const filtered = users.filter((user) => {
    const target = `${user.name} ${user.email} ${user.role}`.toLowerCase();
    return target.includes(filter.toLowerCase());
  });
  const profileOptions = profiles.length ? profiles : [activeProfile];
  const selectedProfileId = form.profileId || profileOptions[0]?.id || activeProfile.id;
  const permissionLinks = selectedProfileId === activeProfile.id ? links : [];

  return (
    <section className="single-column-page">
      <PageTitle
        title="Gestao de Usuarios"
        description="Administre perfis, papeis e status de acesso."
        action={
          <button className="primary-action" onClick={() => setCreating(true)}>
            <Plus size={18} /> Novo usuario
          </button>
        }
      />
      <div className="search-row">
        <Search size={18} />
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar por nome, email ou permissao" />
      </div>
      <div className="user-grid">
        {filtered.map((user) => (
          <article className={`user-card ${user.status !== "active" ? "muted" : ""}`} key={user.id}>
            <img src={user.avatar || "/assets/crest.svg"} alt="" />
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <small>{user.description}</small>
            </div>
            <div className="user-card-actions">
              <b>{user.role}</b>
              <select
                value={user.status || (user.active ? "active" : "inactive")}
                disabled={busyUserId === user.id || user.id === currentUser.id}
                onChange={(event) => changeStatus(user, event.target.value as UserStatus)}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="suspended">Suspenso</option>
              </select>
              <button
                className="icon-button danger"
                title="Excluir usuario"
                disabled={busyUserId === user.id || user.role === "ADMIN"}
                onClick={() => removeUser(user)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {currentUser.role !== "ADMIN" ? <p className="help-text">Seu perfil atual nao pode alterar usuarios.</p> : null}
      {creating ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card wide-modal">
            <h3>Novo usuario</h3>
            <p>Crie administradores, gestores ou editores locais para teste.</p>
            <form className="form-grid user-form" onSubmit={submitUser}>
              <label>
                <span>Nome</span>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </label>
              <label>
                <span>E-mail</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                      username: form.username || event.target.value.split("@")[0]
                    })
                  }
                  required
                />
              </label>
              <label>
                <span>Usuario</span>
                <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
              </label>
              <label>
                <span>Senha inicial</span>
                <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
              </label>
              <label>
                <span>Papel</span>
                <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as User["role"] })}>
                  <option value="ADMIN">Admin</option>
                  <option value="GESTOR">Gestor</option>
                  <option value="EDITOR">Editor</option>
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                  <option value="suspended">Suspenso</option>
                </select>
              </label>
              {form.role !== "ADMIN" ? (
                <label className="span-2">
                  <span>Pagina autorizada</span>
                  <select value={selectedProfileId} onChange={(event) => setForm({ ...form, profileId: event.target.value, linkIds: [] })}>
                    {profileOptions.map((profile) => (
                      <option value={profile.id} key={profile.id}>
                        {profile.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {form.role === "EDITOR" ? (
                <div className="span-2 link-permission-box">
                  <span>Links que o editor pode alterar</span>
                  {permissionLinks.length ? (
                    permissionLinks.map((link) => (
                      <label className="checkbox-row" key={link.id}>
                        <input
                          type="checkbox"
                          checked={form.linkIds.includes(link.id)}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              linkIds: event.target.checked ? [...form.linkIds, link.id] : form.linkIds.filter((item) => item !== link.id)
                            })
                          }
                        />
                        <span>{link.title}</span>
                      </label>
                    ))
                  ) : (
                    <p className="help-text">Selecione a pagina no topo do painel para escolher links especificos.</p>
                  )}
                </div>
              ) : null}
              <label className="span-2">
                <span>Descricao</span>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </label>
              <div className="modal-actions span-2">
                <button type="button" className="secondary-action" onClick={() => setCreating(false)}>
                  Cancelar
                </button>
                <button className="primary-action compact" type="submit">
                  <Plus size={16} /> Criar usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SettingsPage({ user }: { user: User }) {
  return (
    <section className="single-column-page">
      <PageTitle title="Configuracoes" description="Preferencias de conta, seguranca e notificacoes." />
      <div className="settings-grid">
        <Panel title="Conta" icon={<UserRound />}>
          <InfoRow label="Nome" value={user.name} />
          <InfoRow label="E-mail" value={user.email} />
          <InfoRow label="Perfil" value={user.role} />
        </Panel>
        <Panel title="Seguranca" icon={<ShieldCheck />}>
          <InfoRow label="Sessao" value="Token temporario de 8 horas" />
          <InfoRow label="Sanitizacao" value="Entradas sem HTML livre" />
          <InfoRow label="Uploads" value="JPG, PNG e WEBP documentados" />
        </Panel>
        <Panel title="Preferencias" icon={<Settings />}>
          <InfoRow label="Notificacoes" value="Push ativo" />
          <InfoRow label="Resumo por e-mail" value="Semanal" />
          <InfoRow label="Idioma" value="Portugues (BR)" />
        </Panel>
      </div>
    </section>
  );
}

function PreviewColumn({ profile, links }: { profile: PublicProfile; links: LinkItem[] }) {
  const visibleLinks = links.filter((link) => link.active).sort((a, b) => a.order - b.order);

  return (
    <aside className="preview-column">
      <span className="preview-label">
        <Smartphone size={16} /> Preview em tempo real
      </span>
      <div
        className="phone-frame"
        style={
          {
            "--profile-primary": profile.primaryColor,
            "--profile-secondary": profile.secondaryColor,
            "--button-radius": `${profile.buttonRadius}px`
          } as React.CSSProperties
        }
      >
        <div className="phone-screen">
          <img className="phone-banner" src={profile.banner} alt="" />
          <img className="phone-avatar" src={profile.avatar} alt="" />
          <h3>{profile.title}</h3>
          <p>{profile.description}</p>
          <div className="phone-links">
            {visibleLinks.map((link) => {
              const Icon = getIcon(link.icon);
              return (
                <span className={`phone-link ${link.featured ? "featured" : ""}`} key={link.id}>
                  <Icon size={16} />
                  {link.title}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PageTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-title">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="page-title-action">{action}</div> : null}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <article className="metric-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {icon}
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`brand-mark ${inverse ? "inverse" : ""}`}>
      <span>
        <Building2 size={22} />
      </span>
      <strong>LinkGov Institutional</strong>
    </div>
  );
}

function NavButton({
  active = false,
  icon,
  label,
  onClick
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BottomNav({
  section,
  navigate,
  permissions
}: {
  section: AdminSection;
  navigate: (to: string) => void;
  permissions: AdminPermissions;
}) {
  return (
    <nav className="bottom-nav" aria-label="Navegacao do painel">
      <NavButton active={section === "links"} icon={<LinkIconBase />} label="Links" onClick={() => navigate("/admin/links")} />
      <NavButton active={section === "appearance"} icon={<Palette />} label="Aparencia" onClick={() => navigate("/admin/appearance")} />
      <NavButton active={section === "analytics"} icon={<BarChart3 />} label="Analiticos" onClick={() => navigate("/admin/analytics")} />
      {permissions.canManageUsers ? (
        <NavButton active={section === "pages"} icon={<FileText />} label="Paginas" onClick={() => navigate("/admin/pages")} />
      ) : null}
      {permissions.canManageUsers ? (
        <NavButton active={section === "users"} icon={<Users />} label="Usuarios" onClick={() => navigate("/admin/users")} />
      ) : null}
    </nav>
  );
}

function ConfirmDialog({
  title,
  description,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="modal-actions">
          <button className="secondary-action" onClick={onCancel}>
            Cancelar
          </button>
          <button className="danger-action" onClick={onConfirm}>
            <Trash2 size={16} /> Remover
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast ${toast.tone || "success"}`} key={toast.id}>
          <Check size={16} />
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function LoadingState({ label, inline = false }: { label: string; inline?: boolean }) {
  return (
    <div className={inline ? "loading-state inline" : "loading-state"}>
      <span className="loader" />
      <p>{label}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <main className="empty-state">
      <BrandMark />
      <h1>{title}</h1>
      <p>{description}</p>
      <button className="primary-action" onClick={onAction}>
        {actionLabel}
        <ArrowRight size={18} />
      </button>
    </main>
  );
}

function getAdminSection(path: string): AdminSection {
  if (path.includes("appearance")) return "appearance";
  if (path.includes("analytics")) return "analytics";
  if (path.includes("pages")) return "pages";
  if (path.includes("users")) return "users";
  if (path.includes("settings")) return "settings";
  return "links";
}

function getIcon(icon: string) {
  return iconMap[icon as keyof typeof iconMap] || LinkIconBase;
}

function formatNumber(value: number) {
  return Intl.NumberFormat("pt-BR", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}

function slugFromText(value: string) {
  return value
    .toLowerCase()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function validateImageForUpload(file: File, kind: "avatar" | "banner") {
  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Use JPG, PNG ou WEBP.");
  }

  const limits =
    kind === "avatar"
      ? { bytes: 2 * 1024 * 1024, width: 1024, height: 1024, label: "Avatar" }
      : { bytes: 4 * 1024 * 1024, width: 2400, height: 900, label: "Banner" };

  if (file.size > limits.bytes) {
    throw new Error(`${limits.label} deve ter ate ${Math.round(limits.bytes / 1024 / 1024)}MB.`);
  }

  const dimensions = await readImageSize(file);
  if (dimensions.width > limits.width || dimensions.height > limits.height) {
    throw new Error(`${limits.label} deve ter no maximo ${limits.width}x${limits.height}px.`);
  }
}

function readImageSize(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel ler a imagem."));
    };
    image.src = url;
  });
}
