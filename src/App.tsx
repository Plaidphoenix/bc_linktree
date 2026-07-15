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
  WifiOff,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runtimeConfig } from "./config/runtime";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./data/seed";
import {
  ApiError,
  createLink,
  createProfile,
  createUser,
  deleteLink,
  deleteUser,
  getAccessSession,
  getAccessLoginUrl,
  getAccessLogoutUrl,
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
import { accessSessionStore, asReadOnlyAdminState } from "./services/access-session";
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

  const slug = path.replace(/^\/@?/, "") || "saude";
  return <PublicProfilePage slug={slug} navigate={navigate} />;
}

function LoginPage({ navigate }: { navigate: (to: string) => void }) {
  const accessLogin = runtimeConfig.authProvider === "access";
  const [checkingAccessSession, setCheckingAccessSession] = useState(
    () => accessLogin && accessSessionStore.hasSession()
  );
  const [email, setEmail] = useState(runtimeConfig.demoFallbackEnabled ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(runtimeConfig.demoFallbackEnabled ? DEMO_PASSWORD : "");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(runtimeConfig.demoFallbackEnabled ? DEMO_EMAIL : "");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (!accessLogin || !accessSessionStore.hasSession()) {
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
        await getAccessSession();
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
  }, [accessLogin, navigate]);

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
            <h2 id="login-title">{accessLogin ? "Acesso institucional" : "Entrar na conta"}</h2>
            <p>
              {accessLogin
                ? "Receba um codigo temporario no e-mail cadastrado para entrar com seguranca."
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
          )}
          {runtimeConfig.demoFallbackEnabled ? (
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
            <h3>{accessLogin ? "Acesso sem senha" : "Redefinir senha"}</h3>
            {accessLogin ? (
              <>
                <p>O acesso institucional usa um codigo temporario enviado ao e-mail cadastrado. Nao existe senha local para redefinir.</p>
                <div className="modal-actions">
                  <button type="button" className="primary-action compact" onClick={() => setForgotOpen(false)}>
                    Entendi
                  </button>
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
            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="form-success">{message}</p> : null}
            <button className="primary-action" type="submit" disabled={loading || !token}>
              {loading ? "Salvando..." : "Atualizar senha"}
            #]ü÷»h‘éì¶»§q«^w6W"Ö6&BÖ7F–öç2#à¢Æ#ç·W6W"ç&öÆWÓÂö#à¢Ç6VÆV7@¢fÇVS×·W6W"ç7FGW2ÇÂ‡W6W"æ7F—fRò&7F—fR"¢&–æ7F—fR"—Ğ¢F—6&ÆVC×¶'W7•W6W$–BÓÓÒW6W"æ–BÇÂW6W"æ–BÓÓÒ7W'&VçEW6W"æ–GĞ¢öä6†ævS×²†WfVçB’Óâ6†ævU7FGW2‡W6W"ÂWfVçBçF&vWBçfÇVR2W6W%7FGW2—Ğ¢à¢Æ÷F–öâfÇVSÒ&7F—fR#äF—fóÂö÷F–öãà¢Æ÷F–öâfÇVSÒ&–æ7F—fR#ä–æF—fóÂö÷F–öãà¢Æ÷F–öâfÇVSÒ'7W7VæFVB#å7W7Vç6óÂö÷F–öãà¢Â÷6VÆV7Cà¢Æ'WGFöà¢6Æ74æÖSÒ&–6öâÖ'WGFöâFævW" ¢F—FÆSÒ$W†6ÇV—"W7V&–ò ¢F—6&ÆVC×¶'W7•W6W$–BÓÓÒW6W"æ–BÇÂW6W"ç&öÆRÓÓÒ$DÔ”â'Ğ¢öä6Æ–6³×²‚’Óâ&VÖ÷fUW6W"‡W6W"—Ğ¢à¢ÅG&6ƒ"6—¦S×³wÒóà¢Âö'WGFöãà¢ÂöF—cà¢Âö'F–6ÆSà¢’—Ğ¢ÂöF—cà¢¶7W'&VçEW6W"ç&öÆRÓÒ$DÔ”â"òÇ6Æ74æÖSÒ&†VÇ×FW‡B#å6WRW&f–ÂGVÂæòöFRÇFW&"W7V&–÷2ãÂ÷â¢çVÆÇĞ¢¶7&VF–ærò€¢ÆF—b6Æ74æÖSÒ&ÖöFÂÖ&6¶G&÷"&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR#à¢ÆF—b6Æ74æÖSÒ&ÖöFÂÖ6&Bv–FRÖÖöFÂ#à¢Æƒ3äæ÷fòW7V&–óÂöƒ3à¢Çà¢·'VçF–ÖT6öæf–ræWF…&÷f–FW"ÓÓÒ&66W72 ¢ò$6F7G&RòRÖÖ–ÂVR&V6V&W&ò6öF–vòFV×÷&&–òFò6W76ò–ç7F—GV6–öæÂâ ¢¢$7&–RFÖ–æ—7G&F÷&W2ÂvW7F÷&W2÷RVF—F÷&W2Æö6—2&FW7FRâ'Ğ¢Â÷à¢Æf÷&Ò6Æ74æÖSÒ&f÷&ÒÖw&–BW6W"Öf÷&Ò"öå7V&Ö—C×·7V&Ö—EW6W'Óà¢ÆÆ&VÃà¢Ç7ãäæöÖSÂ÷7ãà¢Æ–çWBfÇVS×¶f÷&ÒææÖWÒöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂæÖS¢WfVçBçF&vWBçfÇVRÒ—Ò&WV—&VBóà¢ÂöÆ&VÃà¢ÆÆ&VÃà¢Ç7ãäRÖÖ–ÃÂ÷7ãà¢Æ–çW@¢G—SÒ&VÖ–Â ¢fÇVS×¶f÷&ÒæVÖ–ÇĞ¢öä6†ævS×²†WfVçB’Óà¢6WDf÷&Ò‡°¢ââæf÷&ÒÀ¢VÖ–Ã¢WfVçBçF&vWBçfÇVRÀ¢W6W&æÖS¢f÷&ÒçW6W&æÖRÇÂWfVçBçF&vWBçfÇVRç7Æ—B‚$"•³Ğ¢Ò¢Ğ¢&WV—&V@¢óà¢ÂöÆ&VÃà¢ÆÆ&VÃà¢Ç7ãåW7V&–óÂ÷7ãà¢Æ–çWBfÇVS×¶f÷&ÒçW6W&æÖWÒöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂW6W&æÖS¢WfVçBçF&vWBçfÇVRÒ—Ò&WV—&VBóà¢ÂöÆ&VÃà¢·'VçF–ÖT6öæf–ræWF…&÷f–FW"ÓÓÒ&Æö6Â"ò€¢ÆÆ&VÃà¢Ç7ãå6Væ†–æ–6–ÃÂ÷7ãà¢Æ–çW@¢G—SÒ'77v÷&B ¢fÇVS×¶f÷&Òç77v÷&GĞ¢öä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ77v÷&C¢WfVçBçF&vWBçfÇVRÒ—Ğ¢Ö–äÆVæwFƒ×³Ğ¢&WV—&V@¢óà¢ÂöÆ&VÃà¢’¢çVÆÇĞ¢ÆÆ&VÃà¢Ç7ãåVÃÂ÷7ãà¢Ç6VÆV7BfÇVS×¶f÷&Òç&öÆWÒöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ&öÆS¢WfVçBçF&vWBçfÇVR2W6W%²'&öÆR%ÒÒ—Óà¢Æ÷F–öâfÇVSÒ$DÔ”â#äFÖ–ãÂö÷F–öãà¢Æ÷F–öâfÇVSÒ$tU5Dõ"#ävW7F÷#Âö÷F–öãà¢Æ÷F–öâfÇVSÒ$TD•Dõ"#äVF—F÷#Âö÷F–öãà¢Â÷6VÆV7Cà¢ÂöÆ&VÃà¢ÆÆ&VÃà¢Ç7ãå7FGW3Â÷7ãà¢Ç6VÆV7BfÇVS×¶f÷&Òç7FGW7Òöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ7FGW3¢WfVçBçF&vWBçfÇVR2W6W%7FGW2Ò—Óà¢Æ÷F–öâfÇVSÒ&7F—fR#äF—fóÂö÷F–öãà¢Æ÷F–öâfÇVSÒ&–æ7F—fR#ä–æF—fóÂö÷F–öãà¢Æ÷F–öâfÇVSÒ'7W7VæFVB#å7W7Vç6óÂö÷F–öãà¢Â÷6VÆV7Cà¢ÂöÆ&VÃà¢¶f÷&Òç&öÆRÓÒ$DÔ”â"ò€¢ÆÆ&VÂ6Æ74æÖSÒ'7âÓ"#à¢Ç7ãåv–æWF÷&—¦FÂ÷7ãà¢Ç6VÆV7BfÇVS×·6VÆV7FVE&öf–ÆT–GÒöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂ&öf–ÆT–C¢WfVçBçF&vWBçfÇVRÂÆ–æ´–G3¢µÒÒ—Óà¢·&öf–ÆT÷F–öç2æÖ‚‡&öf–ÆR’Óâ€¢Æ÷F–öâfÇVS×·&öf–ÆRæ–GÒ¶W“×·&öf–ÆRæ–GÓà¢·&öf–ÆRçF—FÆWĞ¢Âö÷F–öãà¢’—Ğ¢Â÷6VÆV7Cà¢ÂöÆ&VÃà¢’¢çVÆÇĞ¢¶f÷&Òç&öÆRÓÓÒ$TD•Dõ""ò€¢ÆF—b6Æ74æÖSÒ'7âÓ"Æ–æ²×W&Ö—76–öâÖ&÷‚#à¢Ç7ãäÆ–æ·2VRòVF—F÷"öFRÇFW&#Â÷7ãà¢·W&Ö—76–öäÆ–æ·2æÆVæwF‚ò€¢W&Ö—76–öäÆ–æ·2æÖ‚†Æ–æ²’Óâ€¢ÆÆ&VÂ6Æ74æÖSÒ&6†V6¶&÷‚×&÷r"¶W“×¶Æ–æ²æ–GÓà¢Æ–çW@¢G—SÒ&6†V6¶&÷‚ ¢6†V6¶VC×¶f÷&ÒæÆ–æ´–G2æ–æ6ÇVFW2†Æ–æ²æ–B—Ğ¢öä6†ævS×²†WfVçB’Óà¢6WDf÷&Ò‡°¢ââæf÷&ÒÀ¢Æ–æ´–G3¢WfVçBçF&vWBæ6†V6¶VBò²ââæf÷&ÒæÆ–æ´–G2ÂÆ–æ²æ–EÒ¢f÷&ÒæÆ–æ´–G2æf–ÇFW"‚†—FVÒ’Óâ—FVÒÓÒÆ–æ²æ–B¢Ò¢Ğ¢óà¢Ç7ãç¶Æ–æ²çF—FÆWÓÂ÷7ãà¢ÂöÆ&VÃà¢’¢’¢€¢Ç6Æ74æÖSÒ&†VÇ×FW‡B#å6VÆV6–öæRv–ææòF÷òFò–æVÂ&W66öÆ†W"Æ–æ·2W7V6–f–6÷2ãÂ÷à¢—Ğ¢ÂöF—cà¢’¢çVÆÇĞ¢ÆÆ&VÂ6Æ74æÖSÒ'7âÓ"#à¢Ç7ãäFW67&–6óÂ÷7ãà¢ÇFW‡F&VfÇVS×¶f÷&ÒæFW67&—F–öçÒöä6†ævS×²†WfVçB’Óâ6WDf÷&Ò‡²ââæf÷&ÒÂFW67&—F–öã¢WfVçBçF&vWBçfÇVRÒ—Òóà¢ÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ&ÖöFÂÖ7F–öç27âÓ"#à¢Æ'WGFöâG—SÒ&'WGFöâ"6Æ74æÖSÒ'6V6öæF'’Ö7F–öâ"öä6Æ–6³×²‚’Óâ6WD7&VF–ær†fÇ6R—Óà¢6æ6VÆ ¢Âö'WGFöãà¢Æ'WGFöâ6Æ74æÖSÒ'&–Ö'’Ö7F–öâ6ö×7B"G—SÒ'7V&Ö—B#à¢ÅÇW26—¦S×³gÒóâ7&–"W7V&–ğ¢Âö'WGFöãà¢ÂöF—cà¢Âöf÷&Óà¢ÂöF—cà¢ÂöF—cà¢’¢çVÆÇĞ¢Â÷6V7F–öãà¢“°§Ğ ¦gVæ7F–öâ6WGF–æw5vR‡²W6W"Ó¢²W6W#¢W6W"Ò’°¢&WGW&â€¢Ç6V7F–öâ6Æ74æÖSÒ'6–ævÆRÖ6öÇVÖâ×vR#à¢ÅvUF—FÆRF—FÆSÒ$6öæf–wW&6öW2"FW67&—F–öãÒ%&VfW&Væ6–2FR6öçFÂ6VwW&æ6Ræ÷F–f–66öW2â"óà¢ÆF—b6Æ74æÖSÒ'6WGF–æw2Öw&–B#à¢ÅæVÂF—FÆSÒ$6öçF"–6öã×³ÅW6W%&÷VæBóçÓà¢Ä–æfõ&÷rÆ&VÃÒ$æöÖR"fÇVS×·W6W"ææÖWÒóà¢Ä–æfõ&÷rÆ&VÃÒ$RÖÖ–Â"fÇVS×·W6W"æVÖ–ÇÒóà¢Ä–æfõ&÷rÆ&VÃÒ%W&f–Â"fÇVS×·W6W"ç&öÆWÒóà¢ÂõæVÃà¢ÅæVÂF—FÆSÒ%6VwW&æ6"–6öã×³Å6†–VÆD6†V6²óçÓà¢Ä–æfõ&÷rÆ&VÃÒ%6W76ò"fÇVSÒ%Fö¶VâFV×÷&&–òFR‚†÷&2"óà¢Ä–æfõ&÷rÆ&VÃÒ%6æ—F—¦6ò"fÇVSÒ$VçG&F26VÒ…DÔÂÆ—g&R"óà¢Ä–æfõ&÷rÆ&VÃÒ%WÆöG2"fÇVSÒ$¥rÂärRtT%Fö7VÖVçFF÷2"óà¢ÂõæVÃà¢ÅæVÂF—FÆSÒ%&VfW&Væ6–2"–6öã×³Å6WGF–æw2óçÓà¢Ä–æfõ&÷rÆ&VÃÒ$æ÷F–f–66öW2"fÇVSÒ%W6‚F—fò"óà¢Ä–æfõ&÷rÆ&VÃÒ%&W7VÖò÷"RÖÖ–Â"fÇVSÒ%6VÖæÂ"óà¢Ä–æfõ&÷rÆ&VÃÒ$–F–öÖ"fÇVSÒ%÷'GVwVW2„%"’"óà¢ÂõæVÃà¢ÂöF—cà¢Â÷6V7F–öãà¢“°§Ğ ¦gVæ7F–öâ&Wf–Wt6öÇVÖâ‡²&öf–ÆRÂÆ–æ·2Ó¢²&öf–ÆS¢V&Æ–5&öf–ÆS²Æ–æ·3¢Æ–æ´—FVÕµÒÒ’°¢6öç7Bf—6–&ÆTÆ–æ·2ÒÆ–æ·2æf–ÇFW"‚†Æ–æ²’ÓâÆ–æ²æ7F—fR’ç6÷'B‚†Â"’Óâæ÷&FW"Ò"æ÷&FW"“° ¢&WGW&â€¢Æ6–FR6Æ74æÖSÒ'&Wf–WrÖ6öÇVÖâ#à¢Ç7â6Æ74æÖSÒ'&Wf–WrÖÆ&VÂ#à¢Å6Ö'G†öæR6—¦S×³gÒóâ&Wf–WrVÒFV×ò&VÀ¢Â÷7ãà¢ÆF—`¢6Æ74æÖSÒ'†öæRÖg&ÖR ¢7G–ÆS×°¢°¢"Ò×&öf–ÆR×&–Ö'’#¢&öf–ÆRç&–Ö'”6öÆ÷"À¢"Ò×&öf–ÆR×6V6öæF'’#¢&öf–ÆRç6V6öæF'”6öÆ÷"À¢"ÒÖ'WGFöâ×&F—W2#¢G·&öf–ÆRæ'WGFöå&F—W7×† ¢Ò2&V7Bä555&÷W'F–W0¢Ğ¢à¢ÆF—b6Æ74æÖSÒ'†öæR×67&VVâ#à¢Æ–Ör6Æ74æÖSÒ'†öæRÖ&ææW""7&3×·&öf–ÆRæ&ææW'ÒÇCÒ""óà¢Æ–Ör6Æ74æÖSÒ'†öæRÖfF""7&3×·&öf–ÆRæfF'ÒÇCÒ""óà¢Æƒ3ç·&öf–ÆRçF—FÆWÓÂöƒ3à¢Çç·&öf–ÆRæFW67&—F–öçÓÂ÷à¢ÆF—b6Æ74æÖSÒ'†öæRÖÆ–æ·2#à¢·f—6–&ÆTÆ–æ·2æÖ‚†Æ–æ²’Óâ°¢6öç7B–6öâÒvWD–6öâ†Æ–æ²æ–6öâ“°¢&WGW&â€¢Ç7â6Æ74æÖS×¶†öæRÖÆ–æ²G¶Æ–æ²æfVGW&VBò&fVGW&VB"¢"'ÖÒ¶W“×¶Æ–æ²æ–GÓà¢Ä–6öâ6—¦S×³gÒóà¢¶Æ–æ²çF—FÆWĞ¢Â÷7ãà¢“°¢Ò—Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢Âö6–FSà¢“°§Ğ ¦gVæ7F–öâvUF—FÆR‡²F—FÆRÂFW67&—F–öâÂ7F–öâÓ¢²F—FÆS¢7G&–æs²FW67&—F–öã¢7G&–æs²7F–öãó¢&V7Bå&V7DæöFRÒ’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'vR×F—FÆR#à¢ÆF—cà¢Æƒ#ç·F—FÆWÓÂöƒ#à¢Çç¶FW67&—F–öçÓÂ÷à¢ÂöF—cà¢¶7F–öâòÆF—b6Æ74æÖSÒ'vR×F—FÆRÖ7F–öâ#ç¶7F–öçÓÂöF—câ¢çVÆÇĞ¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâæVÂ‡²F—FÆRÂ–6öâÂ6†–ÆG&VâÓ¢²F—FÆS¢7G&–æs²–6öã¢&V7Bå&V7DæöFS²6†–ÆG&Vã¢&V7Bå&V7DæöFRÒ’°¢&WGW&â€¢Ç6V7F–öâ6Æ74æÖSÒ'æVÂ#à¢Æƒ3à¢¶–6öçĞ¢·F—FÆWĞ¢Âöƒ3à¢¶6†–ÆG&VçĞ¢Â÷6V7F–öãà¢“°§Ğ ¦gVæ7F–öâÖWG&–46&B‡²Æ&VÂÂfÇVRÂ–6öâÓ¢²Æ&VÃ¢7G&–æs²fÇVS¢7G&–æs²–6öã¢&V7Bå&V7DæöFRÒ’°¢&WGW&â€¢Æ'F–6ÆR6Æ74æÖSÒ&ÖWG&–2Ö6&B#à¢ÆF—cà¢Ç7ãç¶Æ&VÇÓÂ÷7ãà¢Ç7G&öæsç·fÇVWÓÂ÷7G&öæsà¢ÂöF—cà¢¶–6öçĞ¢Âö'F–6ÆSà¢“°§Ğ ¦gVæ7F–öâ–æfõ&÷r‡²Æ&VÂÂfÇVRÓ¢²Æ&VÃ¢7G&–æs²fÇVS¢7G&–ærÒ’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&–æfò×&÷r#à¢Ç7ãç¶Æ&VÇÓÂ÷7ãà¢Ç7G&öæsç·fÇVWÓÂ÷7G&öæsà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâ'&æDÖ&²‡²–çfW'6RÒfÇ6RÓ¢²–çfW'6Só¢&ööÆVâÒ’°¢&WGW&â€¢ÆF—b6Æ74æÖS×¶'&æBÖÖ&²G¶–çfW'6Rò&–çfW'6R"¢"'ÖÓà¢Ç7ãà¢Ä'V–ÆF–æs"6—¦S×³#'Òóà¢Â÷7ãà¢Ç7G&öæsäÆ–æ´v÷b–ç7F—GWF–öæÃÂ÷7G&öæsà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâæd'WGFöâ‡°¢7F—fRÒfÇ6RÀ¢–6öâÀ¢Æ&VÂÀ¢öä6Æ–6°§Ó¢°¢7F—fSó¢&ööÆVã°¢–6öã¢&V7Bå&V7DæöFS°¢Æ&VÃ¢7G&–æs°¢öä6Æ–6³¢‚’Óâfö–C°§Ò’°¢&WGW&â€¢Æ'WGFöâ6Æ74æÖS×¶æbÖ'WGFöâG¶7F—fRò&7F—fR"¢"'ÖÒöä6Æ–6³×¶öä6Æ–6·Óà¢¶–6öçĞ¢Ç7ãç¶Æ&VÇÓÂ÷7ãà¢Âö'WGFöãà¢“°§Ğ ¦gVæ7F–öâ&÷GFöÔæb‡°¢6V7F–öâÀ¢æf–vFRÀ¢W&Ö—76–öç0§Ó¢°¢6V7F–öã¢FÖ–å6V7F–öã°¢æf–vFS¢‡Fó¢7G&–ær’Óâfö–C°¢W&Ö—76–öç3¢FÖ–åW&Ö—76–öç3°§Ò’°¢&WGW&â€¢Ææb6Æ74æÖSÒ&&÷GFöÒÖæb"&–ÖÆ&VÃÒ$æfVv6òFò–æVÂ#à¢Äæd'WGFöâ7F—fS×·6V7F–öâÓÓÒ&Æ–æ·2'Ò–6öã×³ÄÆ–æ´–6öä&6RóçÒÆ&VÃÒ$Æ–æ·2"öä6Æ–6³×²‚’Óâæf–vFR‚"öFÖ–âöÆ–æ·2"—Òóà¢Äæd'WGFöâ7F—fS×·6V7F–öâÓÓÒ&V&æ6R'Ò–6öã×³ÅÆWGFRóçÒÆ&VÃÒ$&Væ6–"öä6Æ–6³×²‚’Óâæf–vFR‚"öFÖ–âöV&æ6R"—Òóà¢Äæd'WGFöâ7F—fS×·6V7F–öâÓÓÒ&æÇ—F–72'Ò–6öã×³Ä&$6†'C2óçÒÆ&VÃÒ$æÆ—F–6÷2"öä6Æ–6³×²‚’Óâæf–vFR‚"öFÖ–âöæÇ—F–72"—Òóà¢·W&Ö—76–öç2æ6äÖævUW6W'2ò€¢Äæd'WGFöâ7F—fS×·6V7F–öâÓÓÒ'vW2'Ò–6öã×³Äf–ÆUFW‡BóçÒÆ&VÃÒ%v–æ2"öä6Æ–6³×²‚’Óâæf–vFR‚"öFÖ–â÷vW2"—Òóà¢’¢çVÆÇĞ¢·W&Ö—76–öç2æ6äÖævUW6W'2ò€¢Äæd'WGFöâ7F—fS×·6V7F–öâÓÓÒ'W6W'2'Ò–6öã×³ÅW6W'2óçÒÆ&VÃÒ%W7V&–÷2"öä6Æ–6³×²‚’Óâæf–vFR‚"öFÖ–â÷W6W'2"—Òóà¢’¢çVÆÇĞ¢Âöæcà¢“°§Ğ ¦gVæ7F–öâ6öæf—&ÔF–Æör‡°¢F—FÆRÀ¢FW67&—F–öâÀ¢öä6æ6VÂÀ¢öä6öæf—&Ğ§Ó¢°¢F—FÆS¢7G&–æs°¢FW67&—F–öã¢7G&–æs°¢öä6æ6VÃ¢‚’Óâfö–C°¢öä6öæf—&Ó¢‚’Óâfö–C°§Ò’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&ÖöFÂÖ&6¶G&÷"&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR#à¢ÆF—b6Æ74æÖSÒ&ÖöFÂÖ6&B#à¢Æƒ3ç·F—FÆWÓÂöƒ3à¢Çç¶FW67&—F–öçÓÂ÷à¢ÆF—b6Æ74æÖSÒ&ÖöFÂÖ7F–öç2#à¢Æ'WGFöâ6Æ74æÖSÒ'6V6öæF'’Ö7F–öâ"öä6Æ–6³×¶öä6æ6VÇÓà¢6æ6VÆ ¢Âö'WGFöãà¢Æ'WGFöâ6Æ74æÖSÒ&FævW"Ö7F–öâ"öä6Æ–6³×¶öä6öæf—&×Óà¢ÅG&6ƒ"6—¦S×³gÒóâ&VÖ÷fW ¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâFö7E7F6²‡²Fö7G2Ó¢²Fö7G3¢Fö7EµÒÒ’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'Fö7B×7F6²"&–ÖÆ—fSÒ'öÆ—FR#à¢·Fö7G2æÖ‚‡Fö7B’Óâ€¢ÆF—b6Æ74æÖS×¶Fö7BG·Fö7BçFöæRÇÂ'7V66W72'ÖÒ¶W“×·Fö7Bæ–GÓà¢Ä6†V6²6—¦S×³gÒóà¢·Fö7BæÖW76vWĞ¢ÂöF—cà¢’—Ğ¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâÆöF–æu7FFR‡²Æ&VÂÂ–æÆ–æRÒfÇ6RÓ¢²Æ&VÃ¢7G&–æs²–æÆ–æSó¢&ööÆVâÒ’°¢&WGW&â€¢ÆF—b6Æ74æÖS×¶–æÆ–æRò&ÆöF–ær×7FFR–æÆ–æR"¢&ÆöF–ær×7FFR'Óà¢Ç7â6Æ74æÖSÒ&ÆöFW""óà¢Çç¶Æ&VÇÓÂ÷à¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâV×G•7FFR‡°¢F—FÆRÀ¢FW67&—F–öâÀ¢7F–öäÆ&VÂÀ¢öä7F–öà§Ó¢°¢F—FÆS¢7G&–æs°¢FW67&—F–öã¢7G&–æs°¢7F–öäÆ&VÃ¢7G&–æs°¢öä7F–öã¢‚’Óâfö–C°§Ò’°¢&WGW&â€¢ÆÖ–â6Æ74æÖSÒ&V×G’×7FFR#à¢Ä'&æDÖ&²óà¢Æƒç·F—FÆWÓÂöƒà¢Çç¶FW67&—F–öçÓÂ÷à¢Æ'WGFöâ6Æ74æÖSÒ'&–Ö'’Ö7F–öâ"öä6Æ–6³×¶öä7F–öçÓà¢¶7F–öäÆ&VÇĞ¢Ä'&÷u&–v‡B6—¦S×³‡Òóà¢Âö'WGFöãà¢ÂöÖ–ãà¢“°§Ğ ¦gVæ7F–öâvWDFÖ–å6V7F–öâ‡Fƒ¢7G&–ær“¢FÖ–å6V7F–öâ°¢–b‡F‚æ–æ6ÇVFW2‚&V&æ6R"’’&WGW&â&V&æ6R#°¢–b‡F‚æ–æ6ÇVFW2‚&æÇ—F–72"’’&WGW&â&æÇ—F–72#°¢–b‡F‚æ–æ6ÇVFW2‚'vW2"’’&WGW&â'vW2#°¢–b‡F‚æ–æ6ÇVFW2‚'W6W'2"’’&WGW&â'W6W'2#°¢–b‡F‚æ–æ6ÇVFW2‚'6WGF–æw2"’’&WGW&â'6WGF–æw2#°¢&WGW&â&Æ–æ·2#°§Ğ ¦gVæ7F–öâvWD–6öâ†–6öã¢7G&–ær’°¢&WGW&â–6öäÖ¶–6öâ2¶W–öbG—Vöb–6öäÖÒÇÂÆ–æ´–6öä&6S°§Ğ ¦gVæ7F–öâf÷&ÖDçVÖ&W"‡fÇVS¢çVÖ&W"’°¢&WGW&â–çFÂäçVÖ&W$f÷&ÖB‚'BÔ%""Â²æ÷FF–öã¢fÇVRâ“““’ò&6ö×7B"¢'7FæF&B"Ò’æf÷&ÖB‡fÇVR“°§Ğ ¦gVæ7F–öâ6ÇVtg&öÕFW‡B‡fÇVS¢7G&–ær’°¢&WGW&âfÇVP¢çFôÆ÷vW$66R‚¢ç&WÆ6R‚õä²òÂ""¢ææ÷&ÖÆ—¦R‚$ädB"¢ç&WÆ6R‚õµÇS3ÕÇS3feÒörÂ""¢ç&WÆ6R‚õµæ×£Ó’ÕÒörÂ"Ò"¢ç&WÆ6R‚òÒ²örÂ"Ò"¢ç&WÆ6R‚õâ×ÂÒBörÂ""¢ç6Æ–6RƒÂƒ“°§Ğ ¦7–æ2gVæ7F–öâfÆ–FFT–ÖvTf÷%WÆöB†f–ÆS¢f–ÆRÂ¶–æC¢&fF""Â&&ææW""’°¢6öç7BÆÆ÷vVEG—W2Ò²&–ÖvR÷ær"Â&–ÖvRö§Vr"Â&–ÖvR÷vV'%Ó°¢–b‚ÆÆ÷vVEG—W2æ–æ6ÇVFW2†f–ÆRçG—R’’°¢F‡&÷ræWrW'&÷"‚%W6R¥rÂär÷RtT%â"“°¢Ğ ¢6öç7BÆ–Ö—G2Ğ¢¶–æBÓÓÒ&fF" ¢ò²'—FW3¢"¢#B¢#BÂv–GFƒ¢#BÂ†V–v‡C¢#BÂÆ&VÃ¢$fF""Ğ¢¢²'—FW3¢B¢#B¢#BÂv–GFƒ¢#CÂ†V–v‡C¢“ÂÆ&VÃ¢$&ææW""Ó° ¢–b†f–ÆRç6—¦RâÆ–Ö—G2æ'—FW2’°¢F‡&÷ræWrW'&÷"†G¶Æ–Ö—G2æÆ&VÇÒFWfRFW"FRG´ÖF‚ç&÷VæB†Æ–Ö—G2æ'—FW2ò#Bò#B—ÔÔ"æ“°¢Ğ ¢6öç7BF–ÖVç6–öç2Òv—B&VD–ÖvU6—¦R†f–ÆR“°¢–b†F–ÖVç6–öç2çv–GF‚âÆ–Ö—G2çv–GF‚ÇÂF–ÖVç6–öç2æ†V–v‡BâÆ–Ö—G2æ†V–v‡B’°¢F‡&÷ræWrW'&÷"†G¶Æ–Ö—G2æÆ&VÇÒFWfRFW"æòÖ†–ÖòG¶Æ–Ö—G2çv–GF‡×‚G¶Æ–Ö—G2æ†V–v‡G×‚æ“°¢Ğ§Ğ ¦gVæ7F–öâ&VD–ÖvU6—¦R†f–ÆS¢f–ÆR’°¢&WGW&âæWr&öÖ—6SÇ²v–GFƒ¢çVÖ&W#²†V–v‡C¢çVÖ&W"Óâ‚‡&W6öÇfRÂ&V¦V7B’Óâ°¢6öç7BW&ÂÒU$Âæ7&VFTö&¦V7EU$Â†f–ÆR“°¢6öç7B–ÖvRÒæWr–ÖvR‚“°¢–ÖvRæöæÆöBÒ‚’Óâ°¢U$Âç&Wfö¶Tö&¦V7EU$Â‡W&Â“°¢&W6öÇfR‡²v–GFƒ¢–ÖvRææGW&Åv–GF‚Â†V–v‡C¢–ÖvRææGW&Ä†V–v‡BÒ“°¢Ó°¢–ÖvRæöæW'&÷"Ò‚’Óâ°¢U$Âç&Wfö¶Tö&¦V7EU$Â‡W&Â“°¢&V¦V7B†æWrW'&÷"‚$æòfö’÷76—fVÂÆW"–ÖvVÒâ"’“°¢Ó°¢–ÖvRç7&2ÒW&Ã°¢Ò“°§Ğ