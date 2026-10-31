import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import "./tracker.css";

/* ─── TRACKER LEAN ───────────────────────────────────────────────────────────
   Tableros compartidos (cada uno con sus miembros) y tareas con semáforo lean:
   gris = en curso, rojo = atrasada, verde = completada. Sin amarillo por diseño. */

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (iso) => (iso ? iso.split("-").reverse().join(".") : "—");
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

const estadoTarea = (t, hoy = hoyIso()) =>
  t.completada_el ? "completada" : t.fin_tentativa && t.fin_tentativa < hoy ? "atrasada" : "en_curso";

const ESTADOS = {
  en_curso:   { nombre: "En curso",   clase: "pill-draft" },
  atrasada:   { nombre: "Atrasada",   clase: "pill-error" },
  completada: { nombre: "Completada", clase: "pill-ok" },
};
const ORDEN = { atrasada: 0, en_curso: 1, completada: 2 };

const ok = ({ data, error }) => { if (error) throw error; return data; };

export default function Tracker({ user }) {
  const email = user.email.toLowerCase();
  const [tableros, setTableros] = useState(null);
  const [activo, setActivo] = useState(() => { try { return localStorage.getItem("lean-tablero"); } catch { return null; } });
  const [error, setError] = useState("");

  const leerTableros = async () => ok(await supabase.from("lean_tableros").select("id, nombre, creado_por").order("created_at"));
  const aplicarTableros = (t) => {
    setTableros(t);
    setActivo((a) => (t.some((x) => x.id === a) ? a : t[0]?.id ?? null));
  };
  const cargarTableros = async () => {
    try { aplicarTableros(await leerTableros()); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    leerTableros().then(aplicarTableros, (e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { if (activo) localStorage.setItem("lean-tablero", activo); } catch { /* sin almacenamiento */ } }, [activo]);

  const nuevoTablero = async () => {
    const nombre = prompt("Nombre del tablero (por ejemplo: Terra Mare + Sergio García)");
    if (!nombre?.trim()) return;
    try {
      const t = ok(await supabase.from("lean_tableros").insert({ nombre: nombre.trim() }).select("id").single());
      setActivo(t.id);
      await cargarTableros();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="lean">
      <div className="lean-head">
        <a className="lean-volver" href="#">← Portal de módulos</a>
        <div>
          <div className="i-label">Lean management</div>
          <h1 className="lean-title">Tracker de tareas</h1>
        </div>
      </div>

      {error && <div className="alert" role="alert"><div className="alert-label">Error</div><div className="alert-text">{error}</div></div>}

      {tableros && (
        <div className="lean-tabs" role="tablist">
          {tableros.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === activo}
              className={`lean-tab ${t.id === activo ? "is-active" : ""}`} onClick={() => setActivo(t.id)}>{t.nombre}</button>
          ))}
          <button type="button" className="btn btn-secondary lean-tab-nuevo" onClick={nuevoTablero}>+ Nuevo tablero</button>
        </div>
      )}

      {tableros && !tableros.length && (
        <div className="aside-empty">Todavía no sos miembro de ningún tablero. Creá uno o pedile a quien lo administra que te sume.</div>
      )}
      {activo && tableros?.some((t) => t.id === activo) && (
        <Tablero key={activo} tablero={tableros.find((t) => t.id === activo)} email={email} onCambioTableros={cargarTableros} />
      )}
    </div>
  );
}

function Tablero({ tablero, email, onCambioTableros }) {
  const [tareas, setTareas] = useState(null);
  const [miembros, setMiembros] = useState([]);
  const [filtroResp, setFiltroResp] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [verCompletadas, setVerCompletadas] = useState(false);
  const [editando, setEditando] = useState(null);
  const [verMiembros, setVerMiembros] = useState(false);
  const [error, setError] = useState("");
  const hoy = hoyIso();

  const leer = async () => {
    const [t, m] = await Promise.all([
      supabase.from("lean_tareas").select("*").eq("tablero_id", tablero.id).order("fin_tentativa", { ascending: true, nullsFirst: false }),
      supabase.from("lean_miembros").select("email, nombre, rol").eq("tablero_id", tablero.id).order("nombre"),
    ]);
    return [ok(t), ok(m)];
  };
  const aplicar = ([t, m]) => { setTareas(t); setMiembros(m); };
  const cargar = async () => {
    try { aplicar(await leer()); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    leer().then(aplicar, (e) => setError(e.message));
  }, [tablero.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const esAdmin = miembros.some((m) => m.email === email && m.rol === "admin");
  const accion = async (fn) => {
    setError("");
    try { await fn(); await cargar(); } catch (e) { setError(e.message); }
  };

  const conEstado = useMemo(() => (tareas ?? []).map((t) => ({ ...t, estado: estadoTarea(t, hoy) })), [tareas, hoy]);
  const cuenta = (e) => conEstado.filter((t) => t.estado === e).length;
  const responsables = [...new Set([...miembros.map((m) => m.nombre || m.email), ...conEstado.map((t) => t.responsable)].filter(Boolean))].sort();
  const proyectos = [...new Set(conEstado.map((t) => t.proyecto).filter(Boolean))].sort();

  const visibles = conEstado
    .filter((t) => !filtroResp || t.responsable === filtroResp)
    .filter((t) => (filtroEstado ? t.estado === filtroEstado : verCompletadas || t.estado !== "completada"))
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || (a.fin_tentativa ?? "9999").localeCompare(b.fin_tentativa ?? "9999"));
  const grupos = Object.entries(visibles.reduce((g, t) => ((g[t.proyecto || ""] ??= []).push(t), g), {}))
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  if (!tareas) return <div className="aside-empty">{error || "Cargando tareas…"}</div>;

  return (
    <section className="lean-tablero">
      <div className="lean-kpis">
        <Kpi estado="atrasada" n={cuenta("atrasada")} onClick={() => setFiltroEstado(filtroEstado === "atrasada" ? "" : "atrasada")} activo={filtroEstado === "atrasada"} />
        <Kpi estado="en_curso" n={cuenta("en_curso")} onClick={() => setFiltroEstado(filtroEstado === "en_curso" ? "" : "en_curso")} activo={filtroEstado === "en_curso"} />
        <Kpi estado="completada" n={cuenta("completada")} onClick={() => setFiltroEstado(filtroEstado === "completada" ? "" : "completada")} activo={filtroEstado === "completada"} />
        <div className="lean-kpi lean-kpi--total"><span className="lean-kpi-n">{conEstado.length}</span><span className="lean-kpi-l">Total</span></div>
      </div>

      {error && <div className="alert" role="alert"><div className="alert-label">Error</div><div className="alert-text">{error}</div></div>}

      <NuevaTarea responsables={responsables} proyectos={proyectos} hoy={hoy}
        onCrear={(t) => accion(async () => ok(await supabase.from("lean_tareas").insert({ ...t, tablero_id: tablero.id })))} />

      <div className="lean-filtros">
        <label className="lean-campo">
          <span>Responsable</span>
          <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)}>
            <option value="">Todos</option>
            {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="lean-check">
          <input type="checkbox" checked={verCompletadas} disabled={!!filtroEstado} onChange={(e) => setVerCompletadas(e.target.checked)} />
          Mostrar completadas
        </label>
        <button type="button" className="btn btn-secondary" onClick={() => setVerMiembros((v) => !v)}>
          Miembros ({miembros.length})
        </button>
      </div>

      {verMiembros && (
        <Miembros tablero={tablero} miembros={miembros} esAdmin={esAdmin} email={email}
          onCambio={() => accion(async () => { await onCambioTableros(); })} setError={setError} />
      )}

      {grupos.length === 0 ? (
        <div className="aside-empty">{conEstado.length ? "No hay tareas con estos filtros." : "Todavía no hay tareas en este tablero."}</div>
      ) : (
        <div className="lean-scroll">
          <table className="lean-tabla">
            <thead>
              <tr>
                <th>Estado</th><th>Tarea</th><th>Responsable</th><th>Inicio</th><th>Fin tentativa</th>
                <th className="n">Días</th><th>Impedimento / nota</th><th />
              </tr>
            </thead>
            {grupos.map(([proyecto, lista]) => (
              <tbody key={proyecto || "-"}>
                <tr className="lean-grupo"><td colSpan={8}>{proyecto || "Sin proyecto"}<span className="lean-grupo-n">{lista.length}</span></td></tr>
                {lista.map((t) => editando === t.id ? (
                  <FilaEdicion key={t.id} tarea={t} responsables={responsables} proyectos={proyectos}
                    onCancelar={() => setEditando(null)}
                    onGuardar={(c) => accion(async () => { ok(await supabase.from("lean_tareas").update(c).eq("id", t.id)); setEditando(null); })} />
                ) : (
                  <Fila key={t.id} t={t} hoy={hoy}
                    onEditar={() => setEditando(t.id)}
                    onCompletar={() => accion(async () => ok(await supabase.from("lean_tareas").update({ completada_el: t.completada_el ? null : hoy }).eq("id", t.id)))}
                    onBorrar={() => confirm(`¿Borrar la tarea "${t.titulo}"?`) && accion(async () => ok(await supabase.from("lean_tareas").delete().eq("id", t.id)))} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="lean-regla">
        Regla lean: una tarea en rojo siempre lleva su impedimento (la causa del atraso). Gris = en curso, rojo = pasó la fecha
        tentativa sin completarse, verde = completada.
      </p>
    </section>
  );
}

function Kpi({ estado, n, onClick, activo }) {
  return (
    <button type="button" className={`lean-kpi lean-kpi--${estado} ${activo ? "is-active" : ""}`} onClick={onClick} aria-pressed={activo}>
      <span className="lean-kpi-n">{n}</span>
      <span className="lean-kpi-l">{ESTADOS[estado].nombre}</span>
    </button>
  );
}

function Fila({ t, hoy, onEditar, onCompletar, onBorrar }) {
  const dias = t.estado === "completada" || !t.fin_tentativa ? null : diasEntre(hoy, t.fin_tentativa);
  const faltaImpedimento = t.estado === "atrasada" && !t.nota.trim();
  return (
    <tr className={`lean-fila lean-fila--${t.estado}`}>
      <td><span className={`pill ${ESTADOS[t.estado].clase}`}>{ESTADOS[t.estado].nombre}</span></td>
      <td className="lean-titulo">{t.titulo}</td>
      <td>{t.responsable || <span className="lean-vacio">Sin asignar</span>}</td>
      <td className="mono">{fmt(t.inicio)}</td>
      <td className="mono">{fmt(t.fin_tentativa)}{t.completada_el && <div className="lean-sub">Completada {fmt(t.completada_el)}</div>}</td>
      <td className={`n mono ${dias < 0 ? "lean-rojo" : ""}`}>{dias == null ? "—" : dias < 0 ? `${-dias} de atraso` : dias === 0 ? "hoy" : dias}</td>
      <td className="lean-nota">{faltaImpedimento ? <span className="lean-falta">Falta el impedimento</span> : t.nota || "—"}</td>
      <td className="lean-acciones">
        <button type="button" className="btn btn-secondary lean-chico" onClick={onCompletar}>{t.completada_el ? "Reabrir" : "Completar"}</button>
        <button type="button" className="btn btn-secondary lean-chico" onClick={onEditar}>Editar</button>
        <button type="button" className="lean-borrar" onClick={onBorrar} aria-label="Borrar tarea" title="Borrar">×</button>
      </td>
    </tr>
  );
}

function FilaEdicion({ tarea, responsables, proyectos, onGuardar, onCancelar }) {
  const [c, setC] = useState({
    proyecto: tarea.proyecto, titulo: tarea.titulo, responsable: tarea.responsable,
    inicio: tarea.inicio ?? "", fin_tentativa: tarea.fin_tentativa ?? "", completada_el: tarea.completada_el ?? "", nota: tarea.nota,
  });
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const guardar = () => onGuardar({ ...c, titulo: c.titulo.trim(), inicio: c.inicio || null, fin_tentativa: c.fin_tentativa || null, completada_el: c.completada_el || null });
  return (
    <tr className="lean-editando">
      <td colSpan={8}>
        <div className="lean-form">
          <CampoProyecto etiqueta="Proyecto" valor={c.proyecto} proyectos={proyectos} onCambio={(proyecto) => setC({ ...c, proyecto })} />
          <label className="lean-campo lean-ancho"><span>Tarea</span><input value={c.titulo} onChange={set("titulo")} /></label>
          <label className="lean-campo"><span>Responsable</span><input list="lean-responsables" value={c.responsable} onChange={set("responsable")} /></label>
          <label className="lean-campo"><span>Inicio</span><input type="date" value={c.inicio} onChange={set("inicio")} /></label>
          <label className="lean-campo"><span>Fin tentativa</span><input type="date" value={c.fin_tentativa} onChange={set("fin_tentativa")} /></label>
          <label className="lean-campo"><span>Completada el</span><input type="date" value={c.completada_el} onChange={set("completada_el")} /></label>
          <label className="lean-campo lean-ancho"><span>Impedimento / nota</span><input value={c.nota} onChange={set("nota")} /></label>
          <div className="lean-form-acciones">
            <button type="button" className="btn btn-primary" disabled={!c.titulo.trim()} onClick={guardar}>Guardar</button>
            <button type="button" className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          </div>
        </div>
        <Listas responsables={responsables} proyectos={proyectos} />
      </td>
    </tr>
  );
}

function NuevaTarea({ responsables, proyectos, hoy, onCrear }) {
  const vacia = { proyecto: "", titulo: "", responsable: "", inicio: hoy, fin_tentativa: "" };
  const [c, setC] = useState(vacia);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const crear = async (e) => {
    e.preventDefault();
    if (!c.titulo.trim()) return;
    await onCrear({ ...c, titulo: c.titulo.trim(), inicio: c.inicio || null, fin_tentativa: c.fin_tentativa || null });
    setC({ ...vacia, proyecto: c.proyecto, responsable: c.responsable });
  };
  return (
    <form className="lean-nueva" onSubmit={crear}>
      <div className="i-label">Nueva tarea</div>
      <div className="lean-form">
        <CampoProyecto etiqueta="Proyecto (opcional)" valor={c.proyecto} proyectos={proyectos} onCambio={(proyecto) => setC({ ...c, proyecto })} />
        <label className="lean-campo lean-ancho"><span>Tarea</span><input value={c.titulo} onChange={set("titulo")} required /></label>
        <label className="lean-campo"><span>Responsable</span><input list="lean-responsables" value={c.responsable} onChange={set("responsable")} /></label>
        <label className="lean-campo"><span>Inicio</span><input type="date" value={c.inicio} onChange={set("inicio")} /></label>
        <label className="lean-campo"><span>Fin tentativa</span><input type="date" value={c.fin_tentativa} onChange={set("fin_tentativa")} /></label>
        <div className="lean-form-acciones"><button className="btn btn-primary" disabled={!c.titulo.trim()}>Agregar</button></div>
      </div>
      <Listas responsables={responsables} proyectos={proyectos} />
    </form>
  );
}

// Proyecto: desplegable con todos los del tablero y la opción de escribir uno nuevo.
function CampoProyecto({ etiqueta, valor, proyectos, onCambio }) {
  const [nuevo, setNuevo] = useState(false);
  // Apenas el proyecto nuevo tiene su primera tarea, pasa a la lista y queda elegido.
  const enLista = proyectos.includes(valor);
  if ((nuevo && !enLista) || (valor && !enLista)) {
    return (
      <label className="lean-campo">
        <span>{etiqueta} · nuevo</span>
        <span className="lean-nuevo-proyecto">
          <input autoFocus value={valor} placeholder="Nombre del proyecto nuevo" onChange={(e) => onCambio(e.target.value)} />
          <button type="button" className="lean-borrar" title="Volver a la lista" aria-label="Volver a la lista de proyectos"
            onClick={() => { setNuevo(false); onCambio(""); }}>×</button>
        </span>
      </label>
    );
  }
  return (
    <label className="lean-campo">
      <span>{etiqueta}</span>
      <select value={valor} onChange={(e) => { setNuevo(e.target.value === "__nuevo"); onCambio(e.target.value === "__nuevo" ? "" : e.target.value); }}>
        <option value="">Sin proyecto</option>
        {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="__nuevo">+ Nuevo proyecto…</option>
      </select>
    </label>
  );
}

const Listas = ({ responsables, proyectos }) => (
  <>
    <datalist id="lean-responsables">{responsables.map((r) => <option key={r} value={r} />)}</datalist>
    <datalist id="lean-proyectos">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>
  </>
);

function Miembros({ tablero, miembros, esAdmin, email, onCambio, setError }) {
  const [nuevo, setNuevo] = useState({ email: "", nombre: "", rol: "miembro" });
  const agregar = async (e) => {
    e.preventDefault();
    const m = { ...nuevo, email: nuevo.email.trim().toLowerCase(), nombre: nuevo.nombre.trim(), tablero_id: tablero.id };
    const { error } = await supabase.from("lean_miembros").insert(m);
    if (error) return setError(error.message);
    setNuevo({ email: "", nombre: "", rol: "miembro" });
    onCambio();
  };
  const cambiar = async (m, cambios) => {
    const { error } = await supabase.from("lean_miembros").update(cambios).eq("tablero_id", tablero.id).eq("email", m.email);
    if (error) return setError(error.message);
    onCambio();
  };
  const quitar = async (m) => {
    if (!confirm(`¿Quitar a ${m.nombre || m.email} del tablero?`)) return;
    const { error } = await supabase.from("lean_miembros").delete().eq("tablero_id", tablero.id).eq("email", m.email);
    if (error) return setError(error.message);
    onCambio();
  };
  const renombrar = async () => {
    const nombre = prompt("Nuevo nombre del tablero", tablero.nombre);
    if (!nombre?.trim()) return;
    const { error } = await supabase.from("lean_tableros").update({ nombre: nombre.trim() }).eq("id", tablero.id);
    if (error) return setError(error.message);
    onCambio();
  };
  return (
    <div className="lean-miembros">
      <div className="lean-miembros-head">
        <div className="i-label">Miembros del tablero</div>
        {esAdmin && <button type="button" className="btn btn-secondary lean-chico" onClick={renombrar}>Renombrar tablero</button>}
      </div>
      <p className="lean-ayuda">Ven y editan las tareas de este tablero. Para entrar necesitan una cuenta del portal con ese mail.{!esAdmin && " Solo un admin del tablero puede sumar o quitar miembros."}</p>
      <div className="lean-scroll">
        <table className="lean-tabla">
          <thead><tr><th>Nombre</th><th>Mail</th><th>Rol</th><th /></tr></thead>
          <tbody>
            {miembros.map((m) => (
              <tr key={m.email}>
                <td>{esAdmin
                  ? <input className="lean-input-tabla" defaultValue={m.nombre} placeholder="Nombre a mostrar"
                      onBlur={(e) => e.target.value.trim() !== m.nombre && cambiar(m, { nombre: e.target.value.trim() })} />
                  : m.nombre || "—"}</td>
                <td className="mono">{m.email}</td>
                <td>{esAdmin && m.email !== email
                  ? <select value={m.rol} onChange={(e) => cambiar(m, { rol: e.target.value })}><option value="miembro">Miembro</option><option value="admin">Admin</option></select>
                  : m.rol === "admin" ? "Admin" : "Miembro"}</td>
                <td>{esAdmin && m.email !== email && <button type="button" className="lean-borrar" onClick={() => quitar(m)} aria-label={`Quitar a ${m.email}`} title="Quitar">×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {esAdmin && (
        <form className="lean-form" onSubmit={agregar}>
          <label className="lean-campo"><span>Nombre</span><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
          <label className="lean-campo lean-ancho"><span>Mail</span><input type="email" required value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></label>
          <label className="lean-campo"><span>Rol</span>
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}><option value="miembro">Miembro</option><option value="admin">Admin</option></select>
          </label>
          <div className="lean-form-acciones"><button className="btn btn-primary">Sumar miembro</button></div>
        </form>
      )}
    </div>
  );
}
