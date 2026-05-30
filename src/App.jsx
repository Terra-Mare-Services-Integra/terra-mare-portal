import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

const ERP_HOME_URL = "https://integra.terra-mare.com.ar";

const MODULOS = [
  {
    id: "crewing",
    nombre: "Crewing",
    descripcion: "Gestión del personal embarcado, rotaciones, documentación y liquidaciones de tripulación.",
    icono: "👥",
    status: "proximamente",
    url: null,
    color: "#1A7A6E",
    tags: ["RRHH", "Tripulación", "Rotaciones"],
  },
  {
    id: "compras",
    nombre: "Compras",
    descripcion: "Requisiciones, tracker de órdenes de compra, proveedores y KPIs.",
    icono: "🛒",
    status: "activo",
    url: "https://compras-app-beta.vercel.app",
    color: "#6B4FA0",
    tags: ["Requisiciones", "Proveedores", "KPIs"],
  },
  {
    id: "hsqe",
    nombre: "HSQE",
    descripcion: "Control de certificaciones, inspecciones, incidentes y cumplimiento normativo.",
    icono: "🛡️",
    status: "proximamente",
    url: null,
    color: "#C0392B",
    tags: ["Seguridad", "ISO", "Certificaciones"],
  },
  {
    id: "proyectos",
    nombre: "Proyectos",
    descripcion: "Gestión de proyectos con Diagrama de Gantt, camino crítico y seguimiento de tareas.",
    icono: "📋",
    status: "proximamente",
    url: null,
    color: "#B07D0A",
    tags: ["Gantt", "Proyectos", "Tareas"],
  },
  {
    id: "dashboards",
    nombre: "Dashboards",
    descripcion: "Panel ejecutivo con KPIs consolidados de todos los módulos para toma de decisiones.",
    icono: "📊",
    status: "proximamente",
    url: null,
    color: "#213363",
    tags: ["Reportes", "KPIs", "Ejecutivo"],
  },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --navy:    #0B1629;
  --navy2:   #132040;
  --navy3:   #1a2a5e;
  --blue:    #235C96;
  --blue2:   #2E75C0;
  --bg:      #F0F4F8;
  --surface: #FFFFFF;
  --border:  #D6E0ED;
  --text:    #0B1629;
  --muted:   #6381A7;
  --sans:    'Montserrat', sans-serif;
  --mono:    'DM Mono', monospace;
}
body { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; }

/* ── LOGIN ── */
.login-page {
  min-height: 100vh; display: flex;
  background: var(--navy); position: relative; overflow: hidden;
}
.login-bg-overlay {
  position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(135deg, rgba(11,22,41,0.93) 0%, rgba(11,22,41,0.75) 60%, rgba(11,22,41,0.93) 100%);
}
.login-bg-lines {
  position: absolute; inset: 0; z-index: 0;
  background-image:
    linear-gradient(rgba(26,122,110,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(26,122,110,0.06) 1px, transparent 1px);
  background-size: 60px 60px;
}
.login-split { position: relative; z-index: 2; display: flex; width: 100%; }
.login-left {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  padding: 80px 60px; border-right: 1px solid rgba(26,122,110,0.2);
}
.login-left-eyebrow {
  font-family: var(--mono); font-size: 10px; letter-spacing: 3px;
  color: var(--blue2); text-transform: uppercase; margin-bottom: 20px;
}
.login-left-logo { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.login-left-logo img { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; border: 2px solid rgba(255,255,255,0.15); }
.login-left-title {
  font-size: 48px; font-weight: 900; color: #fff;
  line-height: 0.95; letter-spacing: -2px;
}
.login-left-title span { color: var(--blue2); display: block; }
.login-left-line { width: 48px; height: 3px; background: #1A7A6E; margin: 20px 0; }
.login-left-sub {
  font-size: 13px; color: rgba(255,255,255,0.4);
  line-height: 1.7; max-width: 320px; font-style: italic;
}
.login-right {
  width: 440px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  padding: 60px 48px;
}
.login-card {
  width: 100%; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(35,92,150,0.25); border-radius: 16px;
  padding: 40px 36px; backdrop-filter: blur(20px);
}
.login-card-title { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.login-card-sub {
  font-family: var(--mono); font-size: 10px;
  color: rgba(255,255,255,0.35); letter-spacing: 1px;
  margin-bottom: 28px; text-transform: uppercase;
}
.login-fg { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.login-fg label { font-size: 9px; color: rgba(255,255,255,0.4); letter-spacing: 1px; text-transform: uppercase; font-weight: 600; }
.login-fg input {
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  padding: 11px 14px; font-size: 13px; font-family: var(--sans);
  color: #fff; background: rgba(255,255,255,0.06); outline: none; transition: border-color .15s;
}
.login-fg input::placeholder { color: rgba(255,255,255,0.2); }
.login-fg input:focus { border-color: var(--blue2); background: rgba(255,255,255,0.09); }
.login-btn {
  width: 100%; padding: 12px; margin-top: 8px;
  background: var(--blue); color: #fff;
  border: none; border-radius: 8px;
  font-family: var(--sans); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background .15s; letter-spacing: .5px;
}
.login-btn:hover { background: var(--blue2); }
.login-btn:disabled { opacity: .5; cursor: not-allowed; }
.login-error {
  background: rgba(239,68,68,0.12); color: #FCA5A5;
  border: 1px solid rgba(239,68,68,0.25); border-radius: 8px;
  padding: 10px 14px; font-size: 12px; margin-bottom: 14px;
}
.login-footer {
  text-align: center; font-family: var(--mono); font-size: 9px;
  color: rgba(255,255,255,0.2); margin-top: 20px; letter-spacing: 1px;
}
.login-back {
  text-align: center; margin-top: 12px;
  font-size: 11px; color: rgba(255,255,255,0.3);
  cursor: pointer; font-family: var(--mono);
}
.login-back:hover { color: var(--blue2); }

/* ── HEADER ── */
.header {
  background: var(--navy); padding: 0 40px;
  display: flex; align-items: center; justify-content: space-between;
  height: 60px; position: sticky; top: 0; z-index: 10;
  border-bottom: 1px solid rgba(35,92,150,0.25);
}
.header-integra-img { height: 44px; width: auto; object-fit: contain; opacity: 0.95; }
.login-left-integra-wrap { margin-bottom: 8px; }
.login-left-integra-img  { height: 340px; width: auto; object-fit: contain; opacity: 0.95; }
.login-left-divider { width: 100%; height: 1px; background: rgba(255,255,255,0.1); margin: 8px 0 20px; }
.login-left-company { display: flex; align-items: center; gap: 14px; margin-bottom: 4px; }
.login-left-company-logo { width: 48px; height: 48px; border-radius: 50%; object-fit: contain; border: 1.5px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); }
.login-left-company-name { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
.header-brand { display: flex; align-items: center; gap: 14px; }
.header-logo-img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.2); }
.header-divider { width: 1px; height: 24px; background: rgba(35,92,150,0.3); margin: 0 2px; }
.header-main { font-size: 13px; font-weight: 800; color: #fff; letter-spacing: 2px; text-transform: uppercase; }
.header-sub { font-size: 9px; color: var(--blue2); letter-spacing: 1px; font-family: var(--mono); margin-top: 1px; text-transform: uppercase; }
.header-right { display: flex; align-items: center; gap: 14px; }
.header-email { font-size: 10px; font-family: var(--mono); color: rgba(255,255,255,0.35); }
.back-btn {
  background: transparent; border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.5); font-family: var(--sans); font-size: 10px;
  font-weight: 600; padding: 5px 12px; border-radius: 6px;
  cursor: pointer; transition: all .15s; letter-spacing: .3px;
}
.back-btn:hover { border-color: rgba(255,255,255,0.35); color: #fff; }
.logout-btn {
  background: transparent; border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.5); font-family: var(--sans); font-size: 10px;
  font-weight: 600; padding: 5px 12px; border-radius: 6px;
  cursor: pointer; transition: all .15s; letter-spacing: .3px;
}
.logout-btn:hover { border-color: rgba(255,255,255,0.35); color: #fff; }

/* ── HERO ── */
.hero {
  background: linear-gradient(160deg, #0D1B2E 0%, #132040 60%, #213363 100%);
  padding: 28px 40px 24px; position: relative; overflow: hidden;
  height: 370px; display: flex; align-items: center;
}
.hero::before {
  content: ''; position: absolute; bottom: -80px; right: -80px;
  width: 400px; height: 400px; border-radius: 50%;
  background: radial-gradient(circle, rgba(26,122,110,0.10) 0%, transparent 70%);
  pointer-events: none;
}
.hero::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #1A7A6E, transparent);
}
.hero-logo-wrap { margin: 0; }
.hero-logo-img  { height: 340px; width: auto; object-fit: contain; }
.hero-content { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; }
.hero-eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 3px; color: var(--blue2); text-transform: uppercase; margin-bottom: 14px; }
.hero-title { font-size: 42px; font-weight: 900; color: #fff; line-height: 1.0; margin-bottom: 6px; letter-spacing: -1.5px; }
.hero-title span { color: var(--blue2); }
.hero-line { width: 48px; height: 3px; background: var(--blue); margin: 18px 0; }
.hero-tagline { font-size: 13px; color: rgba(255,255,255,0.45); font-style: italic; font-weight: 400; letter-spacing: 0.5px; margin-bottom: 28px; max-width: 440px; }
.hero-stats { display: flex; gap: 40px; }
.hero-stat { display: flex; flex-direction: column; gap: 3px; }
.hero-stat-n { font-family: var(--mono); font-size: 28px; font-weight: 700; color: #fff; line-height: 1; }
.hero-stat-l { font-size: 9px; color: rgba(255,255,255,0.35); letter-spacing: 1.5px; text-transform: uppercase; }

/* ── CONTENT ── */
.content { max-width: 1200px; margin: 0 auto; padding: 40px 40px 64px; }
.section-label {
  font-family: var(--mono); font-size: 9px; letter-spacing: 2.5px;
  color: var(--muted); text-transform: uppercase; margin-bottom: 20px;
  display: flex; align-items: center; gap: 10px;
}
.section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

/* ── GRID ── */
.modulos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 40px; }

/* ── CARD ── */
.modulo-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden; transition: all .2s;
  display: flex; flex-direction: column;
  box-shadow: 0 1px 4px rgba(11,22,41,0.06);
}
.card-accent-bar { height: 3px; background: var(--card-color, var(--blue)); flex-shrink: 0; opacity: 0; transition: opacity .2s; }
.modulo-card.activo { cursor: pointer; }
.modulo-card.activo:hover { border-color: var(--card-color, var(--blue)); box-shadow: 0 6px 24px rgba(11,22,41,0.12); transform: translateY(-3px); }
.modulo-card.activo:hover .card-accent-bar { opacity: 1; }
.modulo-card.proximamente { opacity: .75; }
.modulo-card.sin-acceso { opacity: .4; cursor: not-allowed; }
.card-inner { padding: 20px; flex: 1; display: flex; flex-direction: column; gap: 12px; }
.card-top { display: flex; align-items: flex-start; justify-content: space-between; }
.card-icono { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.card-badges { display: flex; gap: 6px; align-items: center; }
.badge-activo { font-family: var(--mono); font-size: 8px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: #D1FAE5; color: #065F46; border: 1px solid #A7F3D0; letter-spacing: .5px; text-transform: uppercase; }
.badge-prox   { font-family: var(--mono); font-size: 8px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: #F3F4F6; color: #6B7280; border: 1px solid #E5E7EB; letter-spacing: .5px; text-transform: uppercase; }
.badge-sin    { font-family: var(--mono); font-size: 8px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; letter-spacing: .5px; text-transform: uppercase; }
.card-body { flex: 1; }
.card-nombre { font-size: 14px; font-weight: 700; color: var(--navy); margin-bottom: 6px; line-height: 1.3; }
.card-desc { font-size: 12px; color: var(--muted); line-height: 1.6; }
.card-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 10px; }
.card-tag { font-family: var(--mono); font-size: 9px; padding: 2px 7px; background: #F0F4F8; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); }
.card-footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: #FAFBFC; }
.card-link { font-size: 11px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; }
.card-link-disabled { font-size: 11px; font-weight: 500; color: var(--muted); letter-spacing: .3px; }

/* ── FOOTER ── */
.portal-footer { border-top: 1px solid rgba(26,122,110,0.2); padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; background: var(--navy); }

@media (max-width: 768px) {
  .login-split { flex-direction: column; }
  .login-left { padding: 48px 32px 32px; border-right: none; border-bottom: 1px solid rgba(26,122,110,0.2); align-items: center; text-align: center; }
  .login-left-integra-img { height: 200px; max-width: 90vw; }
  .login-left-line { margin: 16px auto; }
  .login-left-sub { max-width: 100%; }
  .login-right { width: 100%; padding: 32px 24px 48px; }
  .login-card { padding: 28px 24px; }
  .hero { height: auto !important; padding: 24px 20px; }
  .hero-logo-img { height: 160px; max-width: 90vw; }
  .hero-content { text-align: center; }
  .header { padding: 0 16px; height: 52px; }
  .header-integra-img { height: 32px; }
  .content { padding: 24px 16px 48px; }
  .modulos-grid { grid-template-columns: 1fr; }
  .portal-footer { padding: 16px 20px; flex-direction: column; gap: 6px; text-align: center; }
}
.footer-left  { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,0.25); }
.footer-right { font-family: var(--mono); font-size: 10px; color: var(--blue2); opacity: 0.5; }

/* ── LOADING ── */
.loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--navy); }
.loading-text { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 3px; text-transform: uppercase; }
`;

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage() {
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleLogin = async () => {
    setLoading(true); setError("");
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (e) setError("Credenciales incorrectas. Verificá tu email y contraseña.");
    } catch {
      setError("Error de conexión. Verificá tu red e intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleLogin(); };

  return (
    <div className="login-page">
      <div className="login-bg-lines" />
      <div className="login-bg-overlay" />
      <div className="login-split">
        <div className="login-left">
          <div className="login-left-integra-wrap">
            <img src="/integralogo.png" alt="INTEGRA" className="login-left-integra-img" />
          </div>
          <div className="login-left-divider" />
          <div className="login-left-company">
            <img src="/logo-tm.png" alt="Terra Mare" className="login-left-company-logo" />
            <div className="login-left-company-name">Terra Mare Services</div>
          </div>
          <div className="login-left-line" />
          <div className="login-left-sub">
            Crewing · Husbandry · Logística · Contenedores DNV/ISO · Oil & Gas Support Services.
          </div>
        </div>
        <div className="login-right">
          <div className="login-card">
            <div className="login-card-title">Acceso al portal</div>
            <div className="login-card-sub">Solo personal autorizado</div>
            {error && <div className="login-error">{error}</div>}
            <div className="login-fg">
              <label>Email</label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey}
                placeholder="usuario@terra-mare.com.ar"
                autoFocus
              />
            </div>
            <div className="login-fg">
              <label>Contraseña</label>
              <input
                type="password" value={pass}
                onChange={e => setPass(e.target.value)}
                onKeyDown={handleKey}
                placeholder="••••••••"
              />
            </div>
            <button className="login-btn" onClick={handleLogin} disabled={loading || !email || !pass}>
              {loading ? "Ingresando..." : "Ingresar →"}
            </button>
            <div className="login-footer">Terra Mare Services · Acceso restringido</div>
            <div className="login-back" onClick={() => window.location.href = ERP_HOME_URL}>
              ← Volver a Grupo PL
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODULO CARD ─────────────────────────────────────────────────────────────
function ModuloCard({ mod, tieneAcceso }) {
  const isActivo   = mod.status === "activo";
  const puedeAbrir = isActivo && mod.url && tieneAcceso;

  const handleClick = () => { if (puedeAbrir) window.location.href = mod.url; };

  let clase = `modulo-card ${mod.status}`;
  if (isActivo && !tieneAcceso) clase = "modulo-card sin-acceso";

  return (
    <div className={clase} style={{ "--card-color": mod.color }} onClick={handleClick}>
      <div className="card-accent-bar" />
      <div className="card-inner">
        <div className="card-top">
          <div className="card-icono" style={{ background: `${mod.color}18`, border: `1px solid ${mod.color}30` }}>
            {mod.icono}
          </div>
          <div className="card-badges">
            {isActivo && !tieneAcceso
              ? <span className="badge-sin">Sin acceso</span>
              : isActivo
                ? <span className="badge-activo">● Activo</span>
                : <span className="badge-prox">Próximamente</span>
            }
          </div>
        </div>
        <div className="card-body">
          <div className="card-nombre">{mod.nombre}</div>
          <div className="card-desc">{mod.descripcion}</div>
          <div className="card-tags">
            {mod.tags.map(t => <span key={t} className="card-tag">{t}</span>)}
          </div>
        </div>
      </div>
      <div className="card-footer">
        {isActivo && !tieneAcceso
          ? <span className="card-link-disabled">Acceso no autorizado</span>
          : puedeAbrir
            ? <span className="card-link" style={{ color: mod.color }}>Abrir módulo →</span>
            : <span className="card-link-disabled">En desarrollo</span>
        }
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]                     = useState(null);
  const [modulosPermitidos, setModulosPermitidos] = useState(null);
  const [loading, setLoading]                     = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadPermisos(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadPermisos(session.user.id);
      else { setModulosPermitidos(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadPermisos = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("user_roles").select("modulos").eq("user_id", userId).maybeSingle();
      if (error) console.error("Error cargando permisos:", error.message);
      setModulosPermitidos(data?.modulos?.length > 0 ? data.modulos : null);
    } catch {
      setModulosPermitidos(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const tieneAcceso = (moduloId) => {
    if (!modulosPermitidos) return true;
    return modulosPermitidos.includes(moduloId);
  };

  const activos  = MODULOS.filter(m => m.status === "activo");
  const proximos = MODULOS.filter(m => m.status === "proximamente");

  if (loading) {
    return (
      <div className="loading">
        <style>{CSS}</style>
        <div className="loading-text">Cargando...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <style>{CSS}</style>
        <LoginPage />
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>

      <header className="header">
        <div className="header-brand">
          <img src="/integralogo.png" alt="INTEGRA" className="header-integra-img" />
        </div>
        <div className="header-right">
          <span className="header-email">{session.user.email}</span>
          <button className="back-btn" onClick={() => window.location.href = ERP_HOME_URL}>
            ← Grupo PL
          </button>
          <button className="logout-btn" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </header>

      <div className="hero">
        <div className="hero-content">
          <div className="hero-logo-wrap">
            <img src="/integralogo.png" alt="INTEGRA" className="hero-logo-img" />
          </div>
        </div>
      </div>

      <div className="content">
        <div className="section-label">Módulos activos</div>
        <div className="modulos-grid">
          {activos.map(mod => (
            <ModuloCard key={mod.id} mod={mod} tieneAcceso={tieneAcceso(mod.id)} />
          ))}
        </div>
        <div className="section-label" style={{ marginTop: 8 }}>Próximamente</div>
        <div className="modulos-grid">
          {proximos.map(mod => (
            <ModuloCard key={mod.id} mod={mod} tieneAcceso={true} />
          ))}
        </div>
      </div>

      <footer className="portal-footer">
        <div className="footer-left">Terra Mare Services · Sistema de Gestión · Confidencial</div>
        <div className="footer-right">v2.0 — {new Date().getFullYear()}</div>
      </footer>
    </>
  );
}
