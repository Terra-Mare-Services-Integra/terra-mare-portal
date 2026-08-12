import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

/* Instancia de esta aplicación. Se usa para filtrar los datos del portal. */
const EMPRESA_ID     = "terramare";
const EMPRESA_NOMBRE = "TerraMare Services";

/* Módulos de la instancia. El código mono reemplaza al icono: es la
   convención de la marca (el brand book declara el set propio pendiente). */
const MODULOS = [
  { id:"ais-analyzer", codigo:"AIS", nombre:"AIS Analyzer",
    descripcion:"Análisis de tráfico y posiciones AIS para estudios de ruta y ocupación.",
    estado:"activo", url:"https://ais-analyzer.vercel.app" },
  { id:"transporte-arena", codigo:"ARENA", nombre:"Transporte de arena",
    descripcion:"Modelo de costos y logística para el transporte de arena.",
    estado:"activo", url:"https://transporte-arena.vercel.app" },
  { id:"evaluacion-gdm", codigo:"GDM", nombre:"Evaluación GdM",
    descripcion:"Evaluación de inversión y escenarios del proyecto Golfo San Matías.",
    estado:"activo", url:"https://evaluacion-gdm.vercel.app" },
  { id:"hsqe", codigo:"HSQE", nombre:"HSQE",
    descripcion:"Certificaciones, inspecciones, incidentes y no conformidades.",
    estado:"proximo", url:null },
  { id:"pipeline", codigo:"PIPE", nombre:"Pipeline de oportunidades",
    descripcion:"Seguimiento comercial de licitaciones, propuestas y oportunidades.",
    estado:"proximo", url:null },
  { id:"dashboards", codigo:"DASH", nombre:"Dashboards",
    descripcion:"Panel ejecutivo con KPIs consolidados de todos los módulos.",
    estado:"proximo", url:null },
  { id:"documentos", codigo:"DOC", nombre:"Control documental",
    descripcion:"Documentos técnicos, versiones, aprobaciones y vencimientos.",
    estado:"desarrollo", url:null },
];

const NOTA_ESTADO = {
  "sin-acceso": "ACCESO NO AUTORIZADO",
  desarrollo:   "EN PRUEBAS INTERNAS",
  proximo:      "LANZAMIENTO PREVISTO",
};

/* ─── ICONOS DE BARRA ───────────────────────────────────────────────────────
   Trazo 1,6 · terminación redonda · sin relleno · toman el color del texto. */
const Ico = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const IcoSearch  = () => <Ico size={16} d={<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>} />;
const IcoBell    = () => <Ico d={<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>} />;
const IcoHelp    = () => <Ico d={<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.1 1-1.1 1.7v.3" /><path d="M12 17.5h.01" /></>} />;

/* ─── FORMATOS ──────────────────────────────────────────────────────────────
   Fecha 12.03.2026 · fecha y hora 12.03.2026 · 14:30. Dato ausente: — */
const dosDigitos = n => String(n).padStart(2, "0");
const fmtFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return `${dosDigitos(d.getDate())}.${dosDigitos(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const fmtFechaHora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  return mismoDia ? `HOY · ${hora}` : `${fmtFecha(iso)} · ${hora}`;
};
const saludo = () => {
  const h = new Date().getHours();
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
};
const inicialesDe = (nombre, email) => {
  const base = (nombre || email || "").trim();
  if (!base) return "—";
  const partes = base.replace(/@.*$/, "").split(/[.\s_]+/).filter(Boolean);
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : base.slice(0, 2)).toUpperCase();
};

/* ─── LOGIN ─────────────────────────────────────────────────────────────────── */
function LoginPage() {
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleLogin = async () => {
    setLoading(true); setError("");
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (e) setError("Revisá el correo y la contraseña. La cuenta no coincide.");
    } catch {
      setError("No se pudo conectar con el servidor. Verificá tu red e intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleLogin(); };

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="login-brand-top">
          <img src="/terramare-blanco.png" alt="TERRAMARE" className="login-brand-logo" />
          <div className="login-env">
            <span className="login-env-dot" />
            INSTANCIA TERRAMARE
          </div>
        </div>

        <div>
          <div className="login-eyebrow">Sistema de gestión</div>
          <h1 className="login-h1">Evaluación de proyectos, operación y documentación en un solo sistema.</h1>
          <div className="login-rule" />
          <p className="login-lead">
            Herramientas de evaluación de inversiones y análisis de proyectos del grupo,
            sobre la misma base funcional.
          </p>
          <div className="login-claim">El socio local que hace posible la operación.</div>
        </div>

        <div className="login-brand-foot">
          <div className="login-built-on">
            <div className="login-built-on-label">Desarrollado sobre</div>
            <img src="/integra-logo-white-noclaim.svg" alt="INTEGRA" />
          </div>
          <div className="login-meta">
            <div>TerraMare Services</div>
            <div>integra.terra-mare.com.ar</div>
          </div>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form-head">
          <div>
            <div className="i-label">Acceso a la instancia</div>
            <div style={{ font: "600 15px/1.4 var(--font-sans)", color: "var(--navy-integra)", marginTop: 4 }}>
              TerraMare
            </div>
          </div>
          <div className="login-tls">TLS 1.3 · CIFRADO</div>
        </div>

        <div className="login-form">
          <h2 className="login-form-title">Acceso al portal</h2>
          <p className="login-form-lead">Ingresá con tu cuenta corporativa. Solo personal autorizado.</p>

          {error && (
            <div className="alert" style={{ marginTop: 24 }} role="alert">
              <div className="alert-label">No se pudo ingresar</div>
              <div className="alert-text">{error}</div>
            </div>
          )}

          <div className="login-fields">
            <div className="field">
              <label htmlFor="login-email">Correo corporativo</label>
              <input
                id="login-email" type="email" value={email} autoFocus
                onChange={e => setEmail(e.target.value)} onKeyDown={handleKey}
                placeholder="usuario@terra-mare.com.ar" disabled={loading}
              />
            </div>
            <div className="field field-pass">
              <label htmlFor="login-pass">Contraseña</label>
              <input
                id="login-pass" type={show ? "text" : "password"} value={pass}
                onChange={e => setPass(e.target.value)} onKeyDown={handleKey}
                placeholder="••••••••" disabled={loading}
              />
              <button type="button" className="field-pass-toggle" onClick={() => setShow(!show)}>
                {show ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ marginTop: 24, height: 44, width: "100%", fontSize: 15 }}
            onClick={handleLogin}
            disabled={loading || !email || !pass}
          >
            {loading ? "Verificando credenciales…" : "Ingresar a TerraMare"}
          </button>

          <div className="login-form-foot">
            <div className="login-form-foot-rule" />
            <div className="login-form-foot-row">
              <span>Acceso restringido · Confidencial</span>
              <span className="powered">Powered by INTEGRA</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── CARD DE MÓDULO ────────────────────────────────────────────────────────── */
function ModuloCard({ mod, tieneAcceso, actividad }) {
  const activo     = mod.estado === "activo";
  const puedeAbrir = activo && !!mod.url && tieneAcceso;
  const estado     = !activo ? mod.estado : tieneAcceso ? "activo" : "sin-acceso";

  const badge =
    estado === "activo"      ? <span className="badge badge-ok">Habilitado</span> :
    estado === "sin-acceso"  ? <span className="badge badge-draft">Sin acceso</span> :
    estado === "desarrollo"  ? <span className="badge badge-draft">En desarrollo</span> :
                               <span className="badge badge-draft">Próximamente</span>;

  const cuerpo = (
    <>
      <div className="mcard-head">
        <span className="mcard-code">{mod.codigo}</span>
        <span className="mcard-text">
          <span className="mcard-name">{mod.nombre}</span>
          <span className="mcard-desc">{mod.descripcion}</span>
        </span>
        <span style={{ flex: "0 0 auto" }}>{badge}</span>
      </div>
      <div className="mcard-rule" />
      <div className="mcard-foot">
        <span className="mcard-act">
          {estado === "activo"
            ? (actividad?.ultima_actividad
                ? `ACTIVIDAD · ${fmtFechaHora(actividad.ultima_actividad)}`
                : "SIN ACTIVIDAD REGISTRADA")
            : (NOTA_ESTADO[estado] || "—")}
        </span>
        {estado === "activo"
          ? (actividad?.pendientes
              ? <span className={`pill pill-${actividad.tono || "draft"}`}>{actividad.pendientes}</span>
              : <span className="pill pill-draft">Sin pendientes</span>)
          : <span className="mcard-action">{estado === "sin-acceso" ? "Solicitar acceso" : "Ver hoja de ruta"}</span>}
      </div>
    </>
  );

  return puedeAbrir
    ? <a className="mcard" href={mod.url}>{cuerpo}</a>
    : <div className={`mcard ${estado === "activo" ? "" : "mcard--off"}`}>{cuerpo}</div>;
}

/* ─── PORTAL ────────────────────────────────────────────────────────────────── */
function Portal({ user, permisos, onLogout }) {
  const [perfil, setPerfil]     = useState(null);
  const [notifs, setNotifs]     = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [actividad, setActividad] = useState({});
  const [estado, setEstado]     = useState(null);

  /* Cada consulta es independiente: si una tabla todavía no existe, esa
     sección queda vacía y el resto del portal funciona igual. */
  useEffect(() => {
    let vivo = true;
    const safe = async (fn) => { try { return await fn(); } catch { return null; } };

    safe(async () => {
      const { data } = await supabase.from("user_profiles")
        .select("nombre, rol, alcance, ultimo_acceso").eq("user_id", user.id).maybeSingle();
      if (vivo && data) setPerfil(data);
    });

    safe(async () => {
      const { data } = await supabase.from("notificaciones")
        .select("id, kind, label, texto, created_at")
        .eq("empresa", EMPRESA_ID).order("created_at", { ascending: false }).limit(3);
      if (vivo && data) setNotifs(data);
    });

    safe(async () => {
      const { data } = await supabase.from("accesos_recientes")
        .select("code, label, modulo, url")
        .eq("empresa", EMPRESA_ID).eq("user_id", user.id)
        .order("updated_at", { ascending: false }).limit(4);
      if (vivo && data) setRecientes(data);
    });

    safe(async () => {
      const { data } = await supabase.from("modulo_actividad")
        .select("modulo_id, ultima_actividad, pendientes, tono").eq("empresa", EMPRESA_ID);
      if (vivo && data) setActividad(Object.fromEntries(data.map(r => [r.modulo_id, r])));
    });

    safe(async () => {
      const { data } = await supabase.from("sistema_estado")
        .select("ultima_sincronizacion, docs_por_vencer, incidencias_abiertas")
        .eq("empresa", EMPRESA_ID).maybeSingle();
      if (vivo && data) setEstado(data);
    });

    return () => { vivo = false; };
  }, [user.id]);

  const tieneAcceso = (id) => !permisos || permisos.includes(id);
  const nombre      = perfil?.nombre || user.email;
  const primerNombre = (perfil?.nombre || "").split(" ")[0];

  const habilitados = MODULOS.filter(m => m.estado === "activo" && tieneAcceso(m.id));
  const resto       = MODULOS.filter(m => !(m.estado === "activo" && tieneAcceso(m.id)));

  return (
    <>
      <header className="topbar">
        <img src="/integra-isotipo-white.svg" alt="INTEGRA" className="topbar-iso" />
        <span className="topbar-div" />
        <span className="topbar-company">{EMPRESA_NOMBRE}</span>
        <input
          className="topbar-search" type="search" disabled
          placeholder="Buscar requisición, proyecto, buque o documento"
          aria-label="Buscar"
        />
        <div className="topbar-tools">
          <span className="topbar-icon" title={notifs.length ? `${notifs.length} notificaciones` : "Sin notificaciones"}>
            <IcoBell />
            {notifs.length > 0 && <span className="topbar-icon-count">{notifs.length}</span>}
          </span>
          <span className="topbar-icon"><IcoHelp /></span>
          <span className="topbar-div" />
          <div className="topbar-id">
            <span className="topbar-avatar">{inicialesDe(perfil?.nombre, user.email)}</span>
            <span>
              <span className="topbar-name">{nombre}</span>
              <span className="topbar-role">{perfil?.rol ? perfil.rol.toUpperCase() : "SIN ROL ASIGNADO"}</span>
            </span>
          </div>
          <button className="topbar-exit" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </header>

      <div className="brandstrip">
        <img src="/terramare-azul.png" alt="TERRAMARE" className="brandstrip-logo" />
        <span className="brandstrip-div" />
        <div>
          <div className="i-label">Portal de módulos</div>
          <div className="brandstrip-hello">
            {saludo()}{primerNombre ? `, ${primerNombre}.` : "."}
          </div>
        </div>
        <div className="brandstrip-right">
          <div className="brandstrip-last">
            <div className="i-label">Último acceso</div>
            <div className="brandstrip-last-val">{fmtFechaHora(perfil?.ultimo_acceso)}</div>
          </div>
        </div>
      </div>

      <div className="portal-body">
        <div className="portal-main">

          <section>
            <div className="sec-head">
              <h2>Retomar donde dejaste</h2>
              <span className="sec-head-rule" />
            </div>
            {recientes.length > 0 ? (
              <div className="recent-row">
                {recientes.map(r => (
                  <a key={r.code} className="recent-chip" href={r.url || "#"}>
                    <span className="recent-code">{r.code}</span>
                    <span className="recent-label">{r.label}</span>
                    <span className="recent-mod">{(r.modulo || "").toUpperCase()}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="aside-empty">Sin actividad reciente registrada.</div>
            )}
          </section>

          <section>
            <div className="sec-head">
              <h2>Módulos habilitados</h2>
              <span className="sec-head-count">{habilitados.length} de {MODULOS.length}</span>
              <span className="sec-head-rule" />
            </div>
            {habilitados.length > 0 ? (
              <div className="mgrid">
                {habilitados.map(m => (
                  <ModuloCard key={m.id} mod={m} tieneAcceso={true} actividad={actividad[m.id]} />
                ))}
              </div>
            ) : (
              <div className="aside-empty">Tu cuenta todavía no tiene módulos habilitados en esta instancia.</div>
            )}
          </section>

          {resto.length > 0 && (
            <section>
              <div className="sec-head">
                <h2>Sin acceso y en desarrollo</h2>
                <span className="sec-head-rule" />
              </div>
              <div className="mgrid">
                {resto.map(m => (
                  <ModuloCard key={m.id} mod={m} tieneAcceso={tieneAcceso(m.id)} actividad={actividad[m.id]} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="portal-aside">
          <div className="acard">
            <div className="acard-head">
              <span className="acard-title">Notificaciones</span>
            </div>
            {notifs.length > 0 ? (
              <div className="notif-list">
                {notifs.map(n => (
                  <div key={n.id} className={`notif notif-${n.kind || "info"}`}>
                    <div className="notif-label">{n.label}</div>
                    <div className="notif-text">{n.texto}</div>
                    <div className="notif-date">{fmtFechaHora(n.created_at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="aside-empty">Sin notificaciones.</div>
            )}
          </div>

          <div className="acard">
            <div className="acard-title" style={{ marginBottom: 12 }}>Estado del sistema</div>
            <div className="status-now">
              <span className={`status-dot ${estado ? "" : "status-dot--unknown"}`} />
              <span className="status-text">{estado ? "Operativo" : "Sin datos"}</span>
            </div>
            <div className="kv-list">
              <div className="kv">
                <span className="kv-k">Última sincronización</span>
                <span className="kv-v">{fmtFechaHora(estado?.ultima_sincronizacion)}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Documentos por vencer</span>
                <span className="kv-v">{estado?.docs_por_vencer ?? "—"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Incidencias abiertas</span>
                <span className="kv-v">{estado?.incidencias_abiertas ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="acard">
            <div className="acard-title" style={{ marginBottom: 12 }}>Tu acceso</div>
            <div className="kv-list">
              <div className="kv">
                <span className="kv-k">Usuario</span>
                <span className="kv-v kv-v--text">{user.email}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Rol</span>
                <span className="kv-v kv-v--text">{perfil?.rol || "—"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Alcance</span>
                <span className="kv-v kv-v--text">{perfil?.alcance || "—"}</span>
              </div>
              <div className="kv">
                <span className="kv-k">Módulos habilitados</span>
                <span className="kv-v">{habilitados.length}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="portal-foot">
        <div className="portal-foot-left">
          <img src="/integra-logo-navy-noclaim.svg" alt="INTEGRA" className="portal-foot-logo" />
          <span className="powered">Powered by INTEGRA</span>
        </div>
        <div className="portal-foot-right">
          <a href="mailto:soporte@paranalogistica.com.ar">Soporte técnico</a>
          <span>GRUPO PARANÁ LOGÍSTICA</span>
        </div>
      </footer>
    </>
  );
}

/* ─── APP ───────────────────────────────────────────────────────────────────── */
export default function App() {
  const [session, setSession] = useState(null);
  const [permisos, setPermisos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadPermisos(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadPermisos(session.user.id);
      else { setPermisos(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadPermisos = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("user_roles").select("modulos").eq("user_id", userId).maybeSingle();
      if (error) console.error("Error cargando permisos:", error.message);
      setPermisos(data?.modulos?.length > 0 ? data.modulos : null);
    } catch {
      setPermisos(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  if (loading) return (
    <div className="loading-page">
      <div className="loading-inner">
        <img src="/terramare-blanco.png" alt="TERRAMARE" />
        <div className="loading-text">Cargando</div>
      </div>
    </div>
  );

  return session
    ? <Portal user={session.user} permisos={permisos} onLogout={handleLogout} />
    : <LoginPage />;
}
