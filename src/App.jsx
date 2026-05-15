import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

const ERP_HOME_URL = "https://erp-home-nine.vercel.app";

const MODULOS = [
  {
    id: "transporte_arena",
    nombre: "Transporte de Arena",
    descripcion: "Análisis económico del transporte de arena de fractura desde Zárate hasta Sea White (Bahía Blanca). Modelo ideal, fricciones climáticas, Monte Carlo P10–P90 y análisis mensual.",
    icono: "⛴️",
    status: "activo",
    url: null, // se completa cuando transporte-arena esté deployado
    color: "#235C96",
    tags: ["Logística", "Arena", "Monte Carlo", "Análisis"],
  },
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
    status: "proximamente",
    url: null,
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

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --navy: #213363; --blue: #235C96; --mid: #6381A7; --light: #A5B5CC;
  --bg: #EEF2F7; --surface: #FFFFFF; --border: #D6E0ED;
  --text: #213363; --muted: #6381A7;
  --sans: 'Montserrat', sans-serif; --mono: 'DM Mono', monospace;
}
body { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; }

/* HEADER */
.header {
  background: var(--navy); padding: 0 40px; display: flex; align-items: center;
  justify-content: space-between; height: 64px;
  box-shadow: 0 2px 12px rgba(33,51,99,.2); position: sticky; top: 0; z-index: 10;
}
.header-brand { display: flex; align-items: center; gap: 12px; }
.header-logo-img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,.2); }
.header-main { font-size: 13px; font-weight: 700; color: #fff; letter-spacing: 1.5px; text-transform: uppercase; }
.header-sub { font-size: 9px; color: rgba(255,255,255,.45); letter-spacing: .5px; font-family: var(--mono); margin-top: 1px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.header-email { font-size: 10px; font-family: var(--mono); color: rgba(255,255,255,.4); }
.back-btn {
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2);
  color: rgba(255,255,255,.7); font-family: var(--sans); font-size: 10px; font-weight: 600;
  padding: 5px 12px; border-radius: 6px; cursor: pointer; transition: all .15s; letter-spacing: .3px;
}
.back-btn:hover { background: rgba(255,255,255,.2); color: #fff; }

/* HERO */
.hero {
  background: linear-gradient(135deg, var(--navy) 0%, #1a2a5e 50%, #0f1d4a 100%);
  padding: 52px 40px 48px; position: relative; overflow: hidden;
}
.hero::before {
  content: ''; position: absolute; top: -60px; right: -60px;
  width: 300px; height: 300px; border-radius: 50%;
  background: rgba(35,92,150,.2); pointer-events: none;
}
.hero::after {
  content: ''; position: absolute; bottom: -80px; left: 20%;
  width: 200px; height: 200px; border-radius: 50%;
  background: rgba(35,92,150,.1); pointer-events: none;
}
.hero-content { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; text-align: center; }
.hero-eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 3px; color: rgba(255,255,255,.4); text-transform: uppercase; margin-bottom: 10px; }
.hero-title { font-size: 32px; font-weight: 800; color: #fff; line-height: 1.15; margin-bottom: 10px; letter-spacing: -.5px; }
.hero-title span { color: #7EB8E8; }
.hero-desc { font-size: 13px; color: rgba(255,255,255,.5); max-width: 520px; line-height: 1.7; margin: 0 auto; }
.hero-stats { display: flex; gap: 32px; margin-top: 28px; justify-content: center; }
.hero-stat { display: flex; flex-direction: column; gap: 2px; }
.hero-stat-n { font-family: var(--mono); font-size: 24px; font-weight: 700; color: #fff; }
.hero-stat-l { font-size: 10px; color: rgba(255,255,255,.4); letter-spacing: .5px; text-transform: uppercase; }

/* CONTENT */
.content { max-width: 1200px; margin: 0 auto; padding: 36px 40px 60px; }
.section-label {
  font-family: var(--mono); font-size: 9px; letter-spacing: 2.5px; color: var(--muted);
  text-transform: uppercase; margin-bottom: 16px; display: flex; align-items: center; gap: 10px;
}
.section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

.modulos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-bottom: 36px; }

/* CARDS */
.modulo-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 22px; transition: all .2s; position: relative; overflow: hidden;
  display: flex; flex-direction: column; gap: 14px;
}
.modulo-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--card-color, var(--blue)); opacity: 0; transition: opacity .2s;
}
.modulo-card.activo { cursor: pointer; box-shadow: 0 2px 8px rgba(33,51,99,.06); }
.modulo-card.activo:hover { border-color: var(--card-color, var(--blue)); box-shadow: 0 4px 20px rgba(33,51,99,.12); transform: translateY(-2px); }
.modulo-card.activo:hover::before { opacity: 1; }
.modulo-card.proximamente { opacity: .75; }
.modulo-card.sin-acceso { opacity: .45; cursor: not-allowed; }

.card-top { display: flex; align-items: flex-start; justify-content: space-between; }
.card-icono { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.card-badges { display: flex; gap: 6px; align-items: center; }
.badge-activo { font-family: var(--mono); font-size: 8px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: #D1FAE5; color: #065F46; border: 1px solid #A7F3D0; letter-spacing: .5px; text-transform: uppercase; }
.badge-prox { font-family: var(--mono); font-size: 8px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: #F3F4F6; color: #6B7280; border: 1px solid #E5E7EB; letter-spacing: .5px; text-transform: uppercase; }
.badge-sin-acceso { font-family: var(--mono); font-size: 8px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; letter-spacing: .5px; text-transform: uppercase; }

.card-body { flex: 1; }
.card-nombre { font-size: 15px; font-weight: 700; color: var(--navy); margin-bottom: 6px; line-height: 1.3; }
.card-desc { font-size: 12px; color: var(--muted); line-height: 1.6; }
.card-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 12px; }
.card-tag { font-family: var(--mono); font-size: 9px; padding: 2px 7px; background: #F0F4F8; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); }
.card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--border); margin-top: auto; }
.card-link { font-size: 11px; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px; letter-spacing: .3px; text-transform: uppercase; cursor: pointer; }
.card-link:hover { text-decoration: underline; }
.card-link-disabled { font-size: 11px; font-weight: 500; color: var(--muted); letter-spacing: .3px; }

/* FOOTER */
.portal-footer { background: var(--navy); padding: 20px 40px; display: flex; align-items: center; justify-content: space-between; }
.footer-left { font-size: 11px; color: rgba(255,255,255,.3); font-family: var(--mono); letter-spacing: .5px; }
.footer-right { font-size: 10px; color: rgba(255,255,255,.2); font-family: var(--mono); }

/* LOADING */
.loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--navy); }
.loading-text { font-family: var(--mono); font-size: 11px; color: rgba(255,255,255,.4); letter-spacing: 2px; text-transform: uppercase; }
`;

function ModuloCard({ mod, tieneAcceso }) {
  const isActivo = mod.status === "activo";
  const puedeAbrir = isActivo && mod.url && tieneAcceso;

  const handleClick = () => {
    if (puedeAbrir) window.open(mod.url, "_blank");
  };

  let clase = `modulo-card ${mod.status}`;
  if (isActivo && !tieneAcceso) clase = "modulo-card sin-acceso";

  return (
    <div
      className={clase}
      style={{ "--card-color": mod.color }}
      onClick={handleClick}
    >
      <div className="card-top">
        <div
          className="card-icono"
          style={{
            background: `${mod.color}18`,
            border: `1px solid ${mod.color}30`,
          }}
        >
          {mod.icono}
        </div>
        <div className="card-badges">
          {isActivo && !tieneAcceso ? (
            <span className="badge-sin-acceso">Sin acceso</span>
          ) : isActivo ? (
            <span className="badge-activo">● Activo</span>
          ) : (
            <span className="badge-prox">Próximamente</span>
          )}
        </div>
      </div>

      <div className="card-body">
        <div className="card-nombre">{mod.nombre}</div>
        <div className="card-desc">{mod.descripcion}</div>
        <div className="card-tags">
          {mod.tags.map((t) => (
            <span key={t} className="card-tag">{t}</span>
          ))}
        </div>
      </div>

      <div className="card-footer">
        {isActivo && !tieneAcceso ? (
          <span className="card-link-disabled">Acceso no autorizado</span>
        ) : puedeAbrir ? (
          <span className="card-link" style={{ color: mod.color }}>
            Abrir módulo →
          </span>
        ) : isActivo && !mod.url ? (
          <span className="card-link-disabled">En deploy...</span>
        ) : (
          <span className="card-link-disabled">En desarrollo</span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [modulosPermitidos, setModulosPermitidos] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserEmail(session.user.email);
        loadPermisos(session.user.id);
      } else {
        setModulosPermitidos(null);
        setLoading(false);
      }
    });
  }, []);

  const loadPermisos = async (userId) => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("modulos")
        .eq("user_id", userId)
        .single();
      setModulosPermitidos(
        data?.modulos?.length > 0 ? data.modulos : null
      );
    } catch {
      setModulosPermitidos(null);
    } finally {
      setLoading(false);
    }
  };

  const tieneAcceso = (moduloId) => {
    if (!modulosPermitidos) return true;
    return modulosPermitidos.includes(moduloId);
  };

  const activos = MODULOS.filter((m) => m.status === "activo");
  const proximos = MODULOS.filter((m) => m.status === "proximamente");

  if (loading) {
    return (
      <div className="loading">
        <style>{CSS}</style>
        <div className="loading-text">Cargando...</div>
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>

      <header className="header">
        <div className="header-brand">
          <img
            src="/logo-tm.png"
            alt="Terra Mare"
            className="header-logo-img"
          />
          <div>
            <div className="header-main">Terra Mare Services</div>
            <div className="header-sub">Portal de gestión</div>
          </div>
        </div>
        <div className="header-right">
          {userEmail && (
            <span className="header-email">{userEmail}</span>
          )}
          <button
            className="back-btn"
            onClick={() => window.open(ERP_HOME_URL, "_self")}
          >
            ← Volver al ERP
          </button>
        </div>
      </header>

      <div className="hero">
        <div className="hero-content">
          <div className="hero-eyebrow">Portal de gestión</div>
          <h1 className="hero-title">
            Terra Mare <span>Services</span>
          </h1>
          <p className="hero-desc" style={{ margin: "0 auto" }}>
            Crewing, logística y operaciones marítimas para clientes externos.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-n">{MODULOS.length}</div>
              <div className="hero-stat-l">Módulos</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-n">{activos.length}</div>
              <div className="hero-stat-l">Activos</div>
            </div>
          </div>
        </div>
      </div>

      <div className="content">
        <div className="section-label">Módulos activos</div>
        <div className="modulos-grid">
          {activos.map((mod) => (
            <ModuloCard
              key={mod.id}
              mod={mod}
              tieneAcceso={tieneAcceso(mod.id)}
            />
          ))}
        </div>

        <div className="section-label" style={{ marginTop: 8 }}>
          Próximamente
        </div>
        <div className="modulos-grid">
          {proximos.map((mod) => (
            <ModuloCard key={mod.id} mod={mod} tieneAcceso={true} />
          ))}
        </div>
      </div>

      <footer className="portal-footer">
        <div className="footer-left">Terra Mare Services · Confidencial</div>
        <div className="footer-right">
          v1.0 — {new Date().getFullYear()}
        </div>
      </footer>
    </>
  );
}
