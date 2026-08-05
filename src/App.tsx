import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  HeartPulse,
  Info,
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
  TriangleAlert,
  Upload,
  UserRound,
  Users,
  WifiOff,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { runtimeConfig, usesManagedSession } from "./config/runtime";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./data/seed";
import {
  ApiError,
  approveSimAccessRequest,
  createLink,
  createProfile,
  createUser,
  deleteLink,
  deleteUser,
  getInstitutionalSession,
  getAccessLoginUrl,
  getAccessLogoutUrl,
  getAdminState,
  getAnalytics,
  getPublicProfile,
  getSimAccessRequests,
  getUsers,
  login,
  logout,
  requestPasswordReset,
  rejectSimAccessRequest,
  reorderLinks,
  resetPassword,
  sessionStore,
  trackClick,
  trackView,
  updateLink,
  updateProfile,
  updateUserStatus,
  uploadProfileAsset
} from "./services/api";
import { accessSessionStore, asReadOnlyAdminState } from "./services/access-session";
import type {
  AdminPermissions,
  AdminState,
  Analytics,
  LinkItem,
  PublicProfile,
  SimAccessRequest,
  Toast,
  User,
  UserStatus
} from "./types";
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
    accessSessionStore.rememberAdminPath(to);
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

  const slug = path.replace(/^\/@?/, "") || undefined;
  return <PublicProfilePage slug={slug} navigate={navigate} />;
}

function LoginPage({ navigate }: { navigate: (to: string) => void }) {
  const accessLogin = runtimeConfig.authProvider === "access";
  const simLogin = runtimeConfig.authProvider === "sim";
  const managedLogin = usesManagedSession(runtimeConfig.authProvider);
  const localDemo = runtimeConfig.authProvider === "local" && runtimeConfig.demoFallbackEnabled;
  const [checkingAccessSession, setCheckingAccessSession] = useState(
    () => managedLogin && accessSessionStore.hasSession()
  );
  const [identifier, setIdentifier] = useState(localDemo ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(localDemo ? DEMO_PASSWORD : "");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(localDemo ? DEMO_EMAIL : "");
  const [resetMessage, setResetMessage] = useState("");
  const [resetTone, setResetTone] = useState<"success" | "error">("success");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (!managedLogin || !accessSessionStore.hasSession()) {
      setCheckingAccessSession(false);
      return;
    }

    let cancelled = false;
    const resumeSession = async () => {
      const cachedState = accessSessionStore.getCachedAdminState();
      if (!navigator.onLine) {
        if (cachedState && !cancelled) {
          navigate(accessSessionStore.getLastAdminPath());
        } else if (!cancelled) {
          setCheckingAccessSession(false);
        }
        return;
      }

      try {
        await getInstitutionalSession();
        if (!cancelled) {
          navigate(accessSessionStore.getLastAdminPath());
        }
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          accessSessionStore.clear();
        }
        if (!cancelled) {
          setCheckingAccessSession(false);
        }
      }
    };

    void resumeSession();
    return () => {
      cancelled = true;
    };
  }, [managedLogin, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(identifier, password);
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
      setResetTone("success");
      setResetMessage(response.message || "Se o e-mail existir, enviaremos um link seguro para cadastrar uma nova senha.");
    } catch (err) {
      setResetTone("error");
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
            <h2 id="login-title">
              {accessLogin ? "Acesso institucional" : simLogin ? "Acesso SIM" : "Entrar na conta"}
            </h2>
            <p>
              {accessLogin
                ? "Receba um codigo temporario no e-mail cadastrado para entrar com seguranca."
                : simLogin
                  ? "Use sua identidade institucional. A sessao fica protegida no servidor da prefeitura."
                  : "Portal de acesso para gestores e administradores institucionais."}
            </p>
          </div>
          {accessLogin ? (
            <div className="form-stack">
              {checkingAccessSession ? (
                <button className="primary-action" type="button" disabled>
                  <KeyRound size={18} /> Verificando acesso...
                </button>
              ) : (
                <a className="primary-action" href={getAccessLoginUrl()}>
                  <KeyRound size={18} /> Entrar com codigo por e-mail
                  <ArrowRight size={18} />
                </a>
              )}
              <button type="button" className="text-link align-right" onClick={() => setForgotOpen(true)}>
                Esqueceu a senha?
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="form-stack">
              <label>
                <span>{simLogin ? "Usuario institucional" : "E-mail institucional"}</span>
                <span className="input-with-icon">
                  {simLogin ? <UserRound size={18} /> : <Mail size={18} />}
                  <input
                    type={simLogin ? "text" : "email"}
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete={simLogin ? "username" : "email"}
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
              {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
              <button className="primary-action" type="submit" disabled={loading}>
                {loading ? "Entrando..." : simLogin ? "Entrar com SIM" : "Entrar no sistema"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {localDemo ? (
            <div className="demo-box">
              <span>Credenciais demo</span>
              <code>{DEMO_EMAIL}</code>
              <code>{DEMO_PASSWORD}</code>
            </div>
          ) : null}
        </div>
      </section>
      {forgotOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>{accessLogin ? "Acesso sem senha" : simLogin ? "Senha institucional" : "Redefinir senha"}</h3>
            {accessLogin ? (
              <>
                <p>O acesso institucional usa um codigo temporario enviado ao e-mail cadastrado. Nao existe senha local para redefinir.</p>
                <div className="modal-actions">
                  <button type="button" className="primary-action compact" onClick={() => setForgotOpen(false)}>
                    Entendi
                  </button>
                </div>
              </>
            ) : simLogin ? (
              <>
                <p>A senha e administrada pelo SIM e nunca e redefinida dentro do LinkGov.</p>
                {!runtimeConfig.simPasswordResetUrl ? (
                  <AlertBanner tone="warning">
                    O endereco oficial de recuperacao ainda nao foi configurado. Procure o suporte do SIM.
                  </AlertBanner>
                ) : null}
                <div className="modal-actions">
                  <button type="button" className="secondary-action" onClick={() => setForgotOpen(false)}>
                    Fechar
                  </button>
                  {runtimeConfig.simPasswordResetUrl ? (
                    <a className="primary-action compact" href={runtimeConfig.simPasswordResetUrl}>
                      <KeyRound size={16} /> Recuperar no SIM
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <form className="form-stack" onSubmit={submitPasswordReset}>
                <p>Informe o e-mail real do usuario para receber um link seguro de cadastro de nova senha.</p>
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
                {resetMessage ? <AlertBanner tone={resetTone}>{resetMessage}</AlertBanner> : null}
                <div className="modal-actions">
                  <button type="button" className="secondary-action" onClick={() => setForgotOpen(false)}>
                    Cancelar
                  </button>
                  <button className="primary-action compact" type="submit" disabled={resetLoading}>
                    <Mail size={16} /> {resetLoading ? "Enviando..." : "Enviar link"}
                  </button>
                </div>
              </form>
            )}
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
            {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
            {message ? <AlertBanner tone="success">{message}</AlertBanner> : null}
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

function PublicProfilePage({ slug, navigate }: { slug?: string; navigate: (to: string) => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const viewEvent = useRef({ route: "", id: "" });
  const routeKey = slug || "__default__";

  if (viewEvent.current.route !== routeKey) {
    viewEvent.current = { route: routeKey, id: createId("view") };
  }

  useEffect(() => {
    let cancelled = false;
    const viewId = viewEvent.current.id;

    const loadProfile = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setError("");
      setAvailabilityError(false);

      try {
        const data = await getPublicProfile(slug);
        if (cancelled) return;
        setProfile(data.profile);
        setLinks(data.links);
        setCachedAt(data.source === "cache" ? data.cachedAt || new Date().toISOString() : null);
        document.title = `${data.profile.title} | LinkGov Institutional`;
        if (data.source === "network") {
          void trackView(data.profile.id, viewId).catch(() => undefined);
        }
      } catch (err) {
        if (cancelled) return;
        setAvailabilityError(err instanceof ApiError && (err.status === 0 || err.status >= 500));
        setError(err instanceof Error ? err.message : "Perfil nao encontrado.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const handleOnline = () => void loadProfile(false);
    void loadProfile(true);
    window.addEventListener("online", handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [retryKey, slug]);

  if (loading) {
    return <LoadingState label="Carregando pagina publica..." />;
  }

  if (error || !profile) {
    return (
      <EmptyState
        title={availabilityError ? "Servidor temporariamente indisponivel" : "Pagina nao encontrada"}
        description={
          availabilityError
            ? "Nao ha uma copia desta pagina neste dispositivo. Verifique se o servidor esta ativo e tente novamente."
            : error || "Este perfil nao esta publico ou nao existe."
        }
        actionLabel={availabilityError ? "Tentar novamente" : "Ir para login"}
        onAction={() => (availabilityError ? setRetryKey((value) => value + 1) : navigate("/login"))}
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
      {cachedAt ? (
        <div className="public-connection-banner" role="status">
          <WifiOff size={20} />
          <span>
            Servidor temporariamente indisponivel. Exibindo a ultima versao salva em {formatSnapshotTime(cachedAt)}.
          </span>
        </div>
      ) : null}
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
    window.open(link.url, "_blank", "noopener,noreferrer");
    void trackClick(link).catch(() => undefined);
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
  const [accessRequests, setAccessRequests] = useState<SimAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const section = getAdminSection(path);
  const managedSession = usesManagedSession(runtimeConfig.authProvider);

  useEffect(() => {
    accessSessionStore.rememberAdminPath(path);
  }, [path]);

  useEffect(() => {
    if (!managedSession && !sessionStore.getToken()) {
      navigate("/login");
      return;
    }

    let cancelled = false;
    const loadState = async (initial = false) => {
      try {
        const data = await getAdminState();
        if (!cancelled) {
          setState(data);
          setOffline(false);
        }
      } catch (err) {
        if (cancelled) return;

        if (managedSession && err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          accessSessionStore.clear();
          navigate("/login");
          return;
        }

        const cachedState = managedSession ? accessSessionStore.getCachedAdminState() : null;
        if (cachedState) {
          setState(cachedState);
          setOffline(true);
        } else {
          navigate("/login");
        }
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    };

    const handleOnline = () => void loadState();
    const handleOffline = () => {
      if (managedSession) setOffline(true);
    };

    void loadState(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [managedSession, navigate]);

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const toast = { id: createId("toast"), message, tone };
    setToasts((items) => [...items, toast]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== toast.id));
    }, 3600);
  }, []);

  useEffect(() => {
    if (!state?.permissions.canManageUsers || offline) {
      return;
    }

    let cancelled = false;
    let errorReported = false;
    const loadRequests = async () => {
      try {
        const requests = await getSimAccessRequests();
        if (!cancelled) {
          setAccessRequests(requests);
          errorReported = false;
        }
      } catch (error) {
        if (!cancelled && !errorReported) {
          errorReported = true;
          pushToast(
            error instanceof Error ? error.message : "Nao foi possivel atualizar as solicitacoes de acesso.",
            "error"
          );
        }
      }
    };

    const refreshOnFocus = () => void loadRequests();
    void loadRequests();
    const poll = window.setInterval(loadRequests, 30_000);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [offline, pushToast, state?.permissions.canManageUsers]);

  const exit = async () => {
    await logout();
    if (runtimeConfig.authProvider === "access") {
      window.location.assign(getAccessLogoutUrl());
      return;
    }
    navigate("/login");
  };

  const switchProfile = async (profileId: string) => {
    if (offline) return;
    try {
      const next = await getAdminState(profileId);
      setState(next);
      pushToast("Pagina publica selecionada.", "info");
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setOffline(true);
      }
      pushToast(err instanceof Error ? err.message : "Nao foi possivel trocar a pagina.", "error");
    }
  };

  const approveAccessRequest = async (
    requestId: string,
    payload: Parameters<typeof approveSimAccessRequest>[1]
  ) => {
    const created = await approveSimAccessRequest(requestId, payload);
    setAccessRequests((items) => items.filter((item) => item.id !== requestId));
    pushToast(`${created.name} recebeu acesso como ${created.role}.`);
    return created;
  };

  const rejectAccessRequest = async (requestId: string) => {
    await rejectSimAccessRequest(requestId);
    setAccessRequests((items) => items.filter((item) => item.id !== requestId));
    pushToast("Solicitacao de acesso recusada.", "info");
  };

  if (loading || !state) {
    return <LoadingState label="Carregando painel administrativo..." />;
  }

  const updateState = (next: Partial<AdminState>) => setState((current) => (current ? { ...current, ...next } : current));
  const visibleState = offline ? asReadOnlyAdminState(state) : state;
  const networkOnlySection = offline && (section === "analytics" || section === "pages" || section === "users");

  return (
    <div className="admin-layout">
      <Sidebar section={section} navigate={navigate} profile={state.profile} permissions={state.permissions} onLogout={exit} />
      <main className="admin-main">
        <AdminHeader
          user={state.user}
          profile={state.profile}
          profiles={state.profiles}
          permissions={state.permissions}
          accessRequests={accessRequests}
          links={state.links}
          navigate={navigate}
          onLogout={exit}
          onProfileChange={switchProfile}
          onApproveAccessRequest={approveAccessRequest}
          onRejectAccessRequest={rejectAccessRequest}
          readOnly={offline}
        />
        {offline ? (
          <div className="connection-banner" role="status">
            <WifiOff size={20} />
            <span>Sem conexao. Exibindo a ultima versao salva em modo somente leitura.</span>
          </div>
        ) : null}
        {networkOnlySection ? <OfflineAdminSection /> : null}
        {!networkOnlySection && section === "links" ? (
          <LinksPage state={visibleState} updateState={updateState} pushToast={pushToast} />
        ) : null}
        {!networkOnlySection && section === "appearance" ? (
          <AppearancePage state={visibleState} updateState={updateState} pushToast={pushToast} />
        ) : null}
        {!networkOnlySection && section === "analytics" ? <AnalyticsPage profileId={state.profile.id} /> : null}
        {!networkOnlySection && section === "pages" ? <PagesPage state={visibleState} updateState={updateState} pushToast={pushToast} navigate={navigate} /> : null}
        {!networkOnlySection && section === "users" ? (
          <UsersPage
            currentUser={visibleState.user}
            permissions={visibleState.permissions}
            profiles={visibleState.profiles}
            activeProfile={visibleState.profile}
            links={visibleState.links}
            pushToast={pushToast}
          />
        ) : null}
        {section === "settings" ? <SettingsPage user={visibleState.user} /> : null}
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
  accessRequests,
  links,
  navigate,
  onLogout,
  onProfileChange,
  onApproveAccessRequest,
  onRejectAccessRequest,
  readOnly
}: {
  user: User;
  profile: PublicProfile;
  profiles: PublicProfile[];
  permissions: AdminPermissions;
  accessRequests: SimAccessRequest[];
  links: LinkItem[];
  navigate: (to: string) => void;
  onLogout: () => void;
  onProfileChange: (profileId: string) => void;
  onApproveAccessRequest: (
    requestId: string,
    payload: Parameters<typeof approveSimAccessRequest>[1]
  ) => Promise<User>;
  onRejectAccessRequest: (requestId: string) => Promise<void>;
  readOnly: boolean;
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reviewing, setReviewing] = useState<SimAccessRequest | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (reviewing && !accessRequests.some((request) => request.id === reviewing.id)) {
      setReviewing(null);
    }
  }, [accessRequests, reviewing]);

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
            <select value={profile.id} disabled={readOnly} onChange={(event) => onProfileChange(event.target.value)}>
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
        {permissions.canManageUsers ? (
          <div className="notification-hub" ref={notificationsRef}>
            <button
              className={`icon-button notification-trigger ${notificationsOpen ? "selected" : ""}`}
              aria-label={`Notificacoes: ${accessRequests.length} solicitacoes pendentes`}
              aria-expanded={notificationsOpen}
              aria-controls="access-request-notifications"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell size={18} />
              {accessRequests.length ? (
                <span className="notification-count" aria-hidden="true">
                  {accessRequests.length > 99 ? "99+" : accessRequests.length}
                </span>
              ) : null}
            </button>
            {notificationsOpen ? (
              <section className="notification-popover" id="access-request-notifications" aria-label="Solicitacoes de acesso">
                <div className="notification-popover-header">
                  <div>
                    <strong>Solicitacoes de acesso</strong>
                    <span>Identidades validadas pelo SIM</span>
                  </div>
                  <button className="icon-button ghost" onClick={() => setNotificationsOpen(false)}>
                    <X size={17} />
                    <span className="sr-only">Fechar notificacoes</span>
                  </button>
                </div>
                {accessRequests.length ? (
                  <div className="notification-list">
                    {accessRequests.map((request) => (
                      <button
                        className="notification-row"
                        key={request.id}
                        onClick={() => {
                          setReviewing(request);
                          setNotificationsOpen(false);
                        }}
                      >
                        <span className="notification-person" aria-hidden="true">
                          <UserRound size={18} />
                        </span>
                        <span className="notification-copy">
                          <strong>{request.displayName}</strong>
                          {request.institutionalEmail ? <span>{request.institutionalEmail}</span> : null}
                          <small>
                            {formatAccessRequestTime(request.lastAttemptAt)}
                            {request.attemptsCount > 1 ? ` · ${request.attemptsCount} tentativas` : ""}
                          </small>
                        </span>
                        <ChevronRight size={17} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="notification-empty">
                    <CheckCircle2 size={22} />
                    <strong>Nenhuma solicitacao pendente</strong>
                    <span>Novas identidades aparecerao aqui.</span>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        ) : null}
        <button className="avatar-button" onClick={onLogout} title="Sair">
          <img src={user.avatar || "/assets/crest.svg"} alt="" />
        </button>
      </div>
      {profiles.length > 1 ? (
        <label className="mobile-profile-switcher">
          <Building2 size={18} aria-hidden="true" />
          <span>Trocar pagina</span>
          <strong>{profile.title}</strong>
          <ChevronRight size={17} aria-hidden="true" />
          <select
            aria-label="Trocar pagina publica"
            value={profile.id}
            disabled={readOnly}
            onChange={(event) => onProfileChange(event.target.value)}
          >
            {profiles.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {reviewing
        ? createPortal(
            <SimAccessReviewDialog
              key={reviewing.id}
              request={reviewing}
              profile={profile}
              links={links}
              readOnly={readOnly}
              onClose={() => setReviewing(null)}
              onApprove={onApproveAccessRequest}
              onReject={onRejectAccessRequest}
            />,
            document.body
          )
        : null}
    </header>
  );
}

function SimAccessReviewDialog({
  request,
  profile,
  links,
  readOnly,
  onClose,
  onApprove,
  onReject
}: {
  request: SimAccessRequest;
  profile: PublicProfile;
  links: LinkItem[];
  readOnly: boolean;
  onClose: () => void;
  onApprove: (requestId: string, payload: Parameters<typeof approveSimAccessRequest>[1]) => Promise<User>;
  onReject: (requestId: string) => Promise<void>;
}) {
  const [role, setRole] = useState<User["role"]>("EDITOR");
  const [email, setEmail] = useState(request.institutionalEmail || "");
  const [username, setUsername] = useState("");
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState("");

  const approve = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy("approve");
    try {
      await onApprove(request.id, {
        role,
        ...(role === "ADMIN" ? {} : { profileId: profile.id }),
        ...(role === "EDITOR" ? { linkIds } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(username.trim() ? { username: username.trim() } : {})
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Nao foi possivel aprovar esta solicitacao.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    setError("");
    setBusy("reject");
    try {
      await onReject(request.id);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Nao foi possivel recusar esta solicitacao.");
      setConfirmReject(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sim-access-review-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-card access-review-modal">
        <div className="access-review-heading">
          <div>
            <span className="eyebrow">Identidade validada pelo SIM</span>
            <h3 id="sim-access-review-title">Revisar acesso</h3>
          </div>
          <button className="icon-button ghost" type="button" onClick={onClose} disabled={Boolean(busy)}>
            <X size={18} />
            <span className="sr-only">Fechar revisao</span>
          </button>
        </div>
        <div className="access-request-identity">
          <span aria-hidden="true"><UserRound size={20} /></span>
          <div>
            <strong>{request.displayName}</strong>
            <small>{request.institutionalEmail || "E-mail nao informado pelo SIM"}</small>
          </div>
        </div>
        {readOnly ? <AlertBanner tone="info">Reconecte o sistema para revisar esta solicitacao.</AlertBanner> : null}
        {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
        <form className="access-review-form" onSubmit={approve}>
          <label>
            <span>Papel no LinkGov</span>
            <select
              value={role}
              disabled={Boolean(busy) || readOnly}
              onChange={(event) => {
                setRole(event.target.value as User["role"]);
                setConfirmReject(false);
              }}
            >
              <option value="ADMIN">Administrador</option>
              <option value="GESTOR">Gestor</option>
              <option value="EDITOR">Editor</option>
            </select>
          </label>
          <div className="form-grid compact-grid">
            <label>
              <span>E-mail institucional (opcional)</span>
              <input
                type="email"
                value={email}
                disabled={Boolean(busy) || readOnly}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@bc.sc.gov.br"
              />
            </label>
            <label>
              <span>Nome de usuario (opcional)</span>
              <input
                value={username}
                disabled={Boolean(busy) || readOnly}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Gerado automaticamente"
                maxLength={80}
              />
            </label>
          </div>
          {role === "ADMIN" ? (
            <div className="access-scope-summary">
              <ShieldCheck size={20} />
              <div>
                <strong>Acesso administrativo global</strong>
                <span>Podera administrar todas as paginas e usuarios.</span>
              </div>
            </div>
          ) : (
            <div className="access-scope-summary">
              <Building2 size={20} />
              <div>
                <strong>{profile.title}</strong>
                <span>O acesso sera limitado a pagina selecionada no topo do painel.</span>
              </div>
            </div>
          )}
          {role === "EDITOR" ? (
            <div className="link-permission-box access-link-permissions">
              <span>Links que este editor podera alterar</span>
              {links.length ? (
                links.map((link) => (
                  <label className="checkbox-row" key={link.id}>
                    <input
                      type="checkbox"
                      checked={linkIds.includes(link.id)}
                      disabled={Boolean(busy) || readOnly}
                      onChange={(event) =>
                        setLinkIds((items) =>
                          event.target.checked ? [...items, link.id] : items.filter((item) => item !== link.id)
                        )
                      }
                    />
                    <span>{link.title}</span>
                  </label>
                ))
              ) : (
                <p className="help-text">Esta pagina ainda nao possui links para autorizar.</p>
              )}
            </div>
          ) : null}
          <div className="modal-actions access-review-actions">
            <button
              type="button"
              className="danger-action"
              disabled={Boolean(busy) || readOnly}
              onClick={reject}
            >
              <X size={16} />
              {busy === "reject" ? "Recusando..." : confirmReject ? "Confirmar recusa" : "Recusar acesso"}
            </button>
            <button className="primary-action compact" type="submit" disabled={Boolean(busy) || readOnly}>
              <Check size={16} /> {busy === "approve" ? "Aprovando..." : "Aprovar acesso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatAccessRequestTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function OfflineAdminSection() {
  return (
    <section className="single-column-page">
      <PageTitle title="Conteudo indisponivel offline" description="Esta area sera atualizada automaticamente quando a conexao voltar." />
    </section>
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
  const [reordering, setReordering] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const orderedLinks = [...state.links].sort((a, b) => a.order - b.order);

  const onDragEnd = async (event: DragEndEvent) => {
    if (!state.permissions.canReorderLinks) {
      pushToast("Seu perfil nao pode reordenar links.", "error");
      return;
    }
    if (reordering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedLinks.findIndex((link) => link.id === active.id);
    const newIndex = orderedLinks.findIndex((link) => link.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(orderedLinks, oldIndex, newIndex).map((link, index) => ({ ...link, order: index + 1 }));
    updateState({ links: next });
    setReordering(true);
    try {
      const saved = await reorderLinks(next, state.profile.id);
      updateState({ links: saved });
      pushToast("Ordem dos links atualizada.");
    } catch (error) {
      updateState({ links: orderedLinks });
      pushToast(error instanceof Error ? error.message : "Nao foi possivel salvar a nova ordem.", "error");
    } finally {
      setReordering(false);
    }
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
            <div className="link-list" aria-busy={reordering}>
              {orderedLinks.map((link) => (
                <SortableLinkCard
                  key={link.id}
                  link={link}
                  editing={editing?.id === link.id}
                  canDrag={state.permissions.canReorderLinks && !reordering}
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

  const max = Math.max(1, ...analytics.timeline.flatMap((item) => [item.views, item.clicks]));

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
  password: runtimeConfig.authProvider === "local" ? "Admin@1234" : "",
  externalSubject: "",
  description: "",
  profileId: "",
  linkIds: [] as string[]
};

function UsersPage({
  currentUser,
  permissions,
  profiles,
  activeProfile,
  links,
  pushToast
}: {
  currentUser: User;
  permissions: AdminPermissions;
  profiles: PublicProfile[];
  activeProfile: PublicProfile;
  links: LinkItem[];
  pushToast: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyUserForm, profileId: activeProfile.id });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (permissions.canManageUsers) {
      getUsers()
        .then(setUsers)
        .catch((error) =>
          pushToast(error instanceof Error ? error.message : "Nao foi possivel carregar os usuarios.", "error")
        );
    }
  }, [permissions.canManageUsers, pushToast]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      profileId: current.profileId || activeProfile.id
    }));
  }, [activeProfile.id]);

  const reloadUsers = async () => setUsers(await getUsers());

  const submitUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    try {
      const created = await createUser({ ...form, profileId: form.profileId || activeProfile.id });
      setUsers((items) => [...items, created]);
      setForm({ ...emptyUserForm, profileId: activeProfile.id });
      setCreating(false);
      pushToast("Usuario criado e vinculado com sucesso.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel criar o usuario.");
    }
  };

  const changeStatus = async (user: User, status: UserStatus) => {
    setBusyUserId(user.id);
    try {
      const updated = await updateUserStatus(user.id, status);
      setUsers((items) => items.map((item) => (item.id === user.id ? updated : item)));
      pushToast("Status do usuario atualizado.", "info");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Nao foi possivel alterar o status.", "error");
    } finally {
      setBusyUserId(null);
    }
  };

  const removeUser = async (user: User) => {
    setBusyUserId(user.id);
    try {
      await deleteUser(user.id);
      await reloadUsers();
      pushToast("Usuario excluido.");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Nao foi possivel excluir o usuario.", "error");
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
            <p>
              {runtimeConfig.authProvider === "access"
                ? "Cadastre o e-mail que recebera o codigo temporario do acesso institucional."
                : runtimeConfig.authProvider === "sim"
                  ? "Vincule o cadastro ao identificador interno do SIM. CPF e JWT nao devem ser informados aqui."
                : "Crie administradores, gestores ou editores locais para teste."}
            </p>
            <form className="form-grid user-form" onSubmit={submitUser}>
              {formError ? (
                <div className="span-2">
                  <AlertBanner tone="error">{formError}</AlertBanner>
                </div>
              ) : null}
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
              {runtimeConfig.authProvider === "local" ? (
                <label>
                  <span>Senha inicial</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    minLength={10}
                    required
                  />
                </label>
              ) : null}
              {runtimeConfig.authProvider === "sim" ? (
                <label>
                  <span>Identificador interno SIM</span>
                  <input
                    value={form.externalSubject}
                    onChange={(event) => setForm({ ...form, externalSubject: event.target.value })}
                    autoComplete="off"
                    maxLength={160}
                    required
                  />
                </label>
              ) : null}
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
        <div className={`toast ${toast.tone || "success"}`} key={toast.id} role="status">
          {toast.tone === "error" ? (
            <AlertCircle size={18} />
          ) : toast.tone === "info" ? (
            <Info size={18} />
          ) : (
            <Check size={18} />
          )}
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function AlertBanner({
  tone,
  children
}: {
  tone: "error" | "success" | "warning" | "info";
  children: React.ReactNode;
}) {
  const icon =
    tone === "error" ? (
      <AlertCircle size={19} />
    ) : tone === "success" ? (
      <CheckCircle2 size={19} />
    ) : tone === "warning" ? (
      <TriangleAlert size={19} />
    ) : (
      <Info size={19} />
    );

  return (
    <div className={`alert-banner ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {icon}
      <span>{children}</span>
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

function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "um acesso anterior";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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
