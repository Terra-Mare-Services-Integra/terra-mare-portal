import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import Mom from "./Mom";
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

// Nombres de proyecto comparables: sin mayúsculas, acentos ni espacios de más.
const clave = (p) => p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// Si el proyecto ya existe con otra escritura, se usa el nombre existente.
const estandarizar = (p, proyectos) => (p.trim() ? proyectos.find((x) => clave(x) === clave(p)) ?? p.trim() : "");

export default function Tracker({ user }) {
  const email = user.email.toLowerCase();
  const [tableros, setTableros] = useState(null);
  const [activo, setActivo] = useState(() => { try { return localStorage.getItem("lean-tablero"); } catch { return null; } });
  const [error, setError] = useState("");
  const [adminPortal, setAdminPortal] = useState(false);
  useEffect(() => { supabase.rpc("tm_es_admin").then(({ data }) => setAdminPortal(data === true)); }, []);

  // Cada tablero sabe si soy miembro: solo en esos puedo replicar tareas (salvo admin del portal o miembro del principal).
  const leerTableros = async () => {
    const [t, m] = await Promise.all([
      supabase.from("lean_tableros").select("id, nombre, creado_por, principal").order("created_at"),
      supabase.from("lean_miembros").select("tablero_id").eq("email", email),
    ]);
    const mios = new Set(ok(m).map((x) => x.tablero_id));
    return ok(t).map((x) => ({ ...x, soyMiembro: mios.has(x.id) })).sort((a, b) => Number(b.principal) - Number(a.principal));
  };
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
        <Tablero key={activo} tablero={tableros.find((t) => t.id === activo)} tableros={tableros} email={email} adminPortal={adminPortal} onCambioTableros={cargarTableros} />
      )}
    </div>
  );
}

function Tablero({ tablero, tableros, email, adminPortal, onCambioTableros }) {
  const [tareas, setTareas] = useState(null);
  const [proyectosPrincipal, setProyectosPrincipal] = useState([]);
  const [filtroTablero, setFiltroTablero] = useState("");
  const [miembros, setMiembros] = useState([]);
  const [filtroResp, setFiltroResp] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [verCompletadas, setVerCompletadas] = useState(false);
  const [editando, setEditando] = useState(null);
  const [adjuntos, setAdjuntos] = useState([]);
  const [conAdjuntos, setConAdjuntos] = useState(null);
  const [notas, setNotas] = useState([]);
  const [notasAbiertas, setNotasAbiertas] = useState([]);   // se pueden desplegar varias tareas a la vez
  const [modoReunion, setModoReunion] = useState(false);
  const [reuniones, setReuniones] = useState([]);
  const [armandoMom, setArmandoMom] = useState(false);
  const [verMiembros, setVerMiembros] = useState(false);
  const [error, setError] = useState("");
  const hoy = hoyIso();

  const principal = tableros.find((t) => t.principal);
  const leer = async () => {
    const consulta = supabase.from("lean_tareas").select("*");
    const [t, m, p, a, n, r] = await Promise.all([
      (tablero.principal ? consulta : consulta.or(`tablero_id.eq.${tablero.id},compartida_con.cs.{${tablero.id}}`)).order("fin_tentativa", { ascending: true, nullsFirst: false }),
      supabase.from("lean_miembros").select("email, nombre, rol").eq("tablero_id", tablero.id).order("nombre"),
      principal && !tablero.principal ? supabase.from("lean_tareas").select("proyecto").eq("tablero_id", principal.id) : { data: [] },
      supabase.from("lean_adjuntos").select("*").order("created_at"),
      supabase.from("lean_notas").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("lean_reuniones").select("*").eq("tablero_id", tablero.id).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    return [ok(t), ok(m), ok(p), ok(a), ok(n), ok(r)];
  };
  const aplicar = ([t, m, p, a, n, r]) => {
    setReuniones(r);
    setTareas(t);
    setAdjuntos(a);
    setNotas(n);
    setMiembros(m);
    setProyectosPrincipal([...new Set(p.map((x) => x.proyecto).filter(Boolean))]);
  };
  const cargar = async () => {
    try { aplicar(await leer()); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    leer().then(aplicar, (e) => setError(e.message));
  }, [tablero.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const esAdmin = miembros.some((m) => m.email === email && m.rol === "admin");
  // Renombrar proyectos y editar notas: admin del tablero o admin del portal.
  const administra = esAdmin || adminPortal;
  const accion = async (fn) => {
    setError("");
    try { await fn(); await cargar(); } catch (e) { setError(e.message); }
  };

  const conEstado = useMemo(() => (tareas ?? []).map((t) => ({ ...t, estado: estadoTarea(t, hoy) })), [tareas, hoy]);
  const cuenta = (e) => conEstado.filter((t) => t.estado === e).length;
  const responsables = [...miembros.map((m) => m.nombre || m.email), ...conEstado.map((t) => t.responsable)]
    .filter(Boolean)
    .reduce((lista, p) => (lista.some((x) => clave(x) === clave(p)) ? lista : [...lista, p]), [])
    .sort((a, b) => a.localeCompare(b));
  const proyectos = [...proyectosPrincipal, ...conEstado.map((t) => t.proyecto)]
    .filter(Boolean)
    .reduce((lista, p) => (lista.some((x) => clave(x) === clave(p)) ? lista : [...lista, p]), [])
    .sort((a, b) => a.localeCompare(b));
  const nombreTablero = (id) => tableros.find((t) => t.id === id)?.nombre ?? "otro tablero";
  // Renombra el proyecto en todas las tareas del tablero que lo tienen (con cualquier escritura).
  // Si el nombre nuevo ya es otro proyecto, las tareas se suman a ese.
  const renombrarProyecto = (viejo) => {
    const nombre = prompt(`Nuevo nombre del proyecto "${viejo}"`, viejo)?.trim();
    if (!nombre || nombre === viejo) return;
    const existente = proyectos.find((x) => clave(x) === clave(nombre) && clave(x) !== clave(viejo));
    if (existente && !confirm(`Ya existe el proyecto "${existente}". ¿Pasar las tareas de "${viejo}" a ese proyecto?`)) return;
    const ids = conEstado.filter((t) => t.proyecto && clave(t.proyecto) === clave(viejo)).map((t) => t.id);
    accion(async () => ok(await supabase.from("lean_tareas").update({ proyecto: existente ?? nombre }).in("id", ids)));
  };
  // Tableros donde se puede replicar una tarea: nunca el principal (ya ve todo) ni el de origen o el actual.
  const replicaLibre = adminPortal || tableros.some((x) => x.principal && x.soyMiembro);
  const destinosDe = (origen) => tableros.filter((x) => !x.principal && x.id !== origen && x.id !== tablero.id)
    .map((x) => ({ ...x, puede: replicaLibre || x.soyMiembro }));
  const otrosTableros = tablero.principal ? [...new Set(conEstado.map((t) => t.tablero_id))].filter((id) => id !== tablero.id) : [];

  const visibles = conEstado
    .filter((t) => !filtroResp || clave(t.responsable ?? "") === clave(filtroResp))
    .filter((t) => !filtroTablero || t.tablero_id === filtroTablero)
    .filter((t) => (filtroEstado ? t.estado === filtroEstado : verCompletadas || t.estado !== "completada"))
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || (a.fin_tentativa ?? "9999").localeCompare(b.fin_tentativa ?? "9999"));
  const grupos = Object.entries(visibles.reduce((g, t) => ((g[t.proyecto || ""] ??= []).push(t), g), {}))
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  if (!tareas) return <div className="aside-empty">{error || "Cargando tareas…"}</div>;

  // Guardar la MoM: la reunión con el orden de las tareas y una nota por tarea en su bitácora.
  // Si fallan las notas, se borra la reunión para no dejar una minuta a medias.
  const guardarMom = async ({ titulo, fecha, asistentes, notas_desde, notas_hasta, items }) => {
    setError("");
    try {
      const r = ok(await supabase.from("lean_reuniones").insert({ tablero_id: tablero.id, titulo: titulo || "Reunión", fecha, asistentes, notas_desde, notas_hasta,
        tareas: items.map((i) => i.tareaId) }).select("id").single());
      const filas = items.filter((i) => i.texto).map((i) => ({ tarea_id: i.tareaId, fecha, texto: i.texto, reunion_id: r.id }));
      if (filas.length) {
        const { error: e } = await supabase.from("lean_notas").insert(filas);
        if (e) { await supabase.from("lean_reuniones").delete().eq("id", r.id); throw e; }
      }
      await cargar();
      return true;
    } catch (e) { setError(e.message); return false; }
  };
  const crearTareaMom = async (t) => {
    setError("");
    try {
      const nueva = ok(await supabase.from("lean_tareas").insert({ ...t, responsable: estandarizar(t.responsable ?? "", responsables), tablero_id: tablero.id }).select("id").single());
      await cargar();
      return nueva.id;
    } catch (e) { setError(e.message); return null; }
  };

  if (armandoMom) {
    return (
      <section className="lean-tablero">
        {error && <div className="alert" role="alert"><div className="alert-label">Error</div><div className="alert-text">{error}</div></div>}
        <Mom tablero={tablero} tareas={conEstado} notas={notas} reuniones={reuniones} ESTADOS={ESTADOS} responsables={responsables} email={email}
          onCrearTarea={crearTareaMom} onGuardar={guardarMom} onCerrar={() => setArmandoMom(false)}
          onBorrarReunion={(r) => confirm(`¿Borrar la minuta "${r.titulo}"? Las notas quedan en sus tareas.`)
            && accion(async () => ok(await supabase.from("lean_reuniones").delete().eq("id", r.id)))} />
      </section>
    );
  }

  return (
    <section className="lean-tablero">
      <div className="lean-kpis">
        <Kpi estado="atrasada" n={cuenta("atrasada")} onClick={() => setFiltroEstado(filtroEstado === "atrasada" ? "" : "atrasada")} activo={filtroEstado === "atrasada"} />
        <Kpi estado="en_curso" n={cuenta("en_curso")} onClick={() => setFiltroEstado(filtroEstado === "en_curso" ? "" : "en_curso")} activo={filtroEstado === "en_curso"} />
        <Kpi estado="completada" n={cuenta("completada")} onClick={() => setFiltroEstado(filtroEstado === "completada" ? "" : "completada")} activo={filtroEstado === "completada"} />
        <div className="lean-kpi lean-kpi--total"><span className="lean-kpi-n">{conEstado.length}</span><span className="lean-kpi-l">Total</span></div>
      </div>

      {error && <div className="alert" role="alert"><div className="alert-label">Error</div><div className="alert-text">{error}</div></div>}

      <NuevaTarea responsables={responsables} proyectos={proyectos} hoy={hoy} destinos={destinosDe(tablero.id).filter((d) => d.puede)}
        onCrear={(t) => accion(async () => ok(await supabase.from("lean_tareas").insert({ ...t, proyecto: estandarizar(t.proyecto, proyectos), responsable: estandarizar(t.responsable, responsables), tablero_id: tablero.id })))} />

      <div className="lean-filtros">
        <label className="lean-campo">
          <span>Responsable</span>
          <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)}>
            <option value="">Todos</option>
            {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {otrosTableros.length > 0 && (
          <label className="lean-campo">
            <span>Creada en</span>
            <select value={filtroTablero} onChange={(e) => setFiltroTablero(e.target.value)}>
              <option value="">Todos los tableros</option>
              <option value={tablero.id}>{tablero.nombre}</option>
              {otrosTableros.map((id) => <option key={id} value={id}>{nombreTablero(id)}</option>)}
            </select>
          </label>
        )}
        <label className="lean-check">
          <input type="checkbox" checked={verCompletadas} disabled={!!filtroEstado} onChange={(e) => setVerCompletadas(e.target.checked)} />
          Mostrar completadas
        </label>
        <label className="lean-check" title="Abre la carga de notas debajo de cada tarea, para anotar en vivo durante una reunión">
          <input type="checkbox" checked={modoReunion} onChange={(e) => setModoReunion(e.target.checked)} />
          Modo reunión
        </label>
        <button type="button" className="btn btn-primary" onClick={() => setArmandoMom(true)}
          title="Minuta de reunión: arrastrá tareas, anotá cada una y copiala para un mail">Armar MoM</button>
        <button type="button" className="btn btn-secondary lean-miembros-btn" onClick={() => setVerMiembros((v) => !v)}>
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
                <tr className="lean-grupo"><td colSpan={8}>{proyecto || "Sin proyecto"}<span className="lean-grupo-n">{lista.length}</span>
                  {administra && proyecto && (
                    <button type="button" className="lean-grupo-editar" onClick={() => renombrarProyecto(proyecto)}
                      title="Cambiar el nombre del proyecto en todas sus tareas">Renombrar</button>
                  )}</td></tr>
                {lista.map((t) => editando === t.id ? (
                  <FilaEdicion key={t.id} tarea={t} responsables={responsables} proyectos={proyectos} destinos={destinosDe(t.tablero_id)}
                    onCancelar={() => setEditando(null)}
                    onGuardar={(c) => accion(async () => { ok(await supabase.from("lean_tareas").update({ ...c, proyecto: estandarizar(c.proyecto, proyectos), responsable: estandarizar(c.responsable, responsables) }).eq("id", t.id)); setEditando(null); })} />
                ) : (
                  <Fila key={t.id} t={t} hoy={hoy}
                    origen={t.tablero_id !== tablero.id ? nombreTablero(t.tablero_id) : null}
                    compartidaCon={(t.compartida_con ?? []).filter((id) => id !== tablero.id).map(nombreTablero)}
                    adjuntos={adjuntos.filter((a) => a.tarea_id === t.id)}
                    verAdjuntos={conAdjuntos === t.id}
                    onAbrirAdjuntos={() => setConAdjuntos(conAdjuntos === t.id ? null : t.id)}
                    onAgregarLink={(nombre, url) => accion(async () => ok(await supabase.from("lean_adjuntos").insert({ tarea_id: t.id, tipo: "link", nombre, url })))}
                    onSubirArchivo={(archivo) => accion(async () => {
                      const ruta = `tareas/${t.id}/${Date.now()}-${archivo.name.replace(/[^\w.\- ]+/g, "_")}`;
                      ok(await supabase.storage.from("tracker").upload(ruta, archivo));
                      ok(await supabase.from("lean_adjuntos").insert({ tarea_id: t.id, tipo: "archivo", nombre: archivo.name, ruta }));
                    })}
                    notas={notas.filter((n) => n.tarea_id === t.id)}
                    verNotas={modoReunion ? "reunion" : notasAbiertas.includes(t.id) ? "completo" : null}
                    onAbrirNotas={() => setNotasAbiertas((a) => (a.includes(t.id) ? a.filter((x) => x !== t.id) : [...a, t.id]))}
                    reunionDe={(id) => reuniones.find((r) => r.id === id)?.titulo}
                    autorDe={(e) => miembros.find((m) => m.email === e)?.nombre || e.replace(/@.*$/, "")}
                    email={email}
                    puedeEditarNotas={administra}
                    onEditarNota={(n, cambios) => accion(async () => {
                      if (!ok(await supabase.from("lean_notas").update(cambios).eq("id", n.id).select("id")).length)
                        throw new Error("No se pudo editar la nota: solo un administrador del tablero puede hacerlo.");
                    })}
                    onAgregarNota={(fecha, texto) => accion(async () => ok(await supabase.from("lean_notas").insert({ tarea_id: t.id, fecha, texto })))}
                    onBorrarNota={(n) => confirm("¿Borrar esta nota?") && accion(async () => {
                      // La base solo deja borrar notas propias de los últimos 15 minutos: si no borró nada, avisar.
                      if (!ok(await supabase.from("lean_notas").delete().eq("id", n.id).select("id")).length)
                        throw new Error("Esa nota ya no se puede borrar: pasaron más de 15 minutos desde que se cargó.");
                    })}
                    onAbrirArchivo={(a) => abrirArchivo(a).catch((e) => setError(e.message))}
                    onQuitarAdjunto={(a) => confirm(`¿Quitar "${a.nombre}" de la tarea?`) && accion(async () => {
                      if (a.ruta) ok(await supabase.storage.from("tracker").remove([a.ruta]));
                      ok(await supabase.from("lean_adjuntos").delete().eq("id", a.id));
                    })}
                    onEditar={() => setEditando(t.id)}
                    onCompletar={() => accion(async () => ok(await supabase.from("lean_tareas").update({ completada_el: t.completada_el ? null : hoy }).eq("id", t.id)))}
                    replicada={(t.compartida_con ?? []).includes(tablero.id)}
                    onBorrar={() => ((t.compartida_con ?? []).includes(tablero.id)
                      // Replicada acá desde otro tablero: solo se quita de este; en su tablero de origen sigue igual.
                      ? confirm(`¿Quitar "${t.titulo}" de este tablero? Sigue en ${nombreTablero(t.tablero_id)}.`)
                        && accion(async () => ok(await supabase.rpc("lean_quitar_de_tablero", { tarea: t.id, tablero: tablero.id })))
                      : confirm(`¿Borrar la tarea "${t.titulo}"?${t.compartida_con?.length ? " También desaparece de los otros tableros donde está." : ""}`)
                        && accion(async () => ok(await supabase.from("lean_tareas").delete().eq("id", t.id))))} />
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

// Los archivos del bucket son privados: se abren con un link firmado que vence al minuto.
async function abrirArchivo(a) {
  const ventana = window.open("", "_blank");
  try {
    const { signedUrl } = ok(await supabase.storage.from("tracker").createSignedUrl(a.ruta, 60));
    ventana.location = signedUrl;
  } catch (e) { ventana?.close(); throw e; }
}

function Kpi({ estado, n, onClick, activo }) {
  return (
    <button type="button" className={`lean-kpi lean-kpi--${estado} ${activo ? "is-active" : ""}`} onClick={onClick} aria-pressed={activo}>
      <span className="lean-kpi-n">{n}</span>
      <span className="lean-kpi-l">{ESTADOS[estado].nombre}</span>
    </button>
  );
}

// Señales: de qué tablero viene la tarea y en qué otros tableros está replicada.
function Fila({ t, hoy, origen, compartidaCon = [], replicada,
  adjuntos, verAdjuntos, onAbrirAdjuntos, onAgregarLink, onSubirArchivo, onAbrirArchivo, onQuitarAdjunto, onEditar, onCompletar, onBorrar,
  notas, verNotas, onAbrirNotas, onAgregarNota, onBorrarNota, onEditarNota, puedeEditarNotas, autorDe, reunionDe, email }) {
  const dias = t.estado === "completada" || !t.fin_tentativa ? null : diasEntre(hoy, t.fin_tentativa);
  const faltaImpedimento = t.estado === "atrasada" && !t.nota.trim();
  return (
    <>
    <tr className={`lean-fila lean-fila--${t.estado}`}>
      <td className="lean-c-estado"><span className={`pill ${ESTADOS[t.estado].clase}`}>{ESTADOS[t.estado].nombre}</span></td>
      <td className="lean-titulo">
        {notas.length > 0 && verNotas !== "reunion" ? (
          <button type="button" className={`lean-desplegar ${verNotas ? "is-abierta" : ""}`} onClick={onAbrirNotas}
            aria-expanded={!!verNotas} title={verNotas ? "Ocultar notas" : `Ver ${notas.length} ${notas.length === 1 ? "nota" : "notas"}`}>
            <svg className="lean-flecha" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>{t.titulo}
          </button>
        ) : t.titulo}
        {(origen || compartidaCon.length > 0) && (
          <div className="lean-senales">
            {origen && <span className="lean-chip lean-chip--origen" title="La tarea se creó en otro tablero">↙ De {origen}</span>}
            {compartidaCon.map((n) => <span key={n} className="lean-chip lean-chip--compartida" title="También aparece en ese tablero">↗ En {n}</span>)}
          </div>
        )}
        {adjuntos.length > 0 && (
          <div className="lean-adjuntos">
            {adjuntos.map((a) => <Adjunto key={a.id} a={a} onAbrirArchivo={onAbrirArchivo} />)}
          </div>
        )}
      </td>
      <td className="lean-c-resp" data-l="Responsable">{t.responsable || <span className="lean-vacio">Sin asignar</span>}</td>
      <td className="mono lean-c-inicio" data-l="Inicio">{fmt(t.inicio)}</td>
      <td className="mono lean-c-fin" data-l="Fin tentativa">{fmt(t.fin_tentativa)}{t.completada_el && <div className="lean-sub">Completada {fmt(t.completada_el)}</div>}</td>
      <td className={`n mono lean-c-dias ${dias < 0 ? "lean-rojo" : ""}`}>{dias == null ? "—" : dias < 0 ? `${-dias} de atraso` : dias === 0 ? "hoy" : dias}</td>
      <td className="lean-nota" data-l="Impedimento / nota">{faltaImpedimento ? <span className="lean-falta">Falta el impedimento</span> : t.nota || "—"}</td>
      <td className="lean-acciones"><div className="lean-acc-btns">
        <button type="button" className="btn btn-secondary lean-chico" onClick={onCompletar}>{t.completada_el ? "Reabrir" : "Completar"}</button>
        <button type="button" className="btn btn-secondary lean-chico" onClick={onEditar}>Editar</button>
        <button type="button" className={`btn btn-secondary lean-chico ${verNotas === "completo" ? "is-active" : ""}`} onClick={onAbrirNotas}
          aria-expanded={verNotas === "completo"} title="Bitácora por fecha de lo que se fue hablando">Notas{notas.length ? ` (${notas.length})` : ""}</button>
        <button type="button" className={`btn btn-secondary lean-chico ${verAdjuntos ? "is-active" : ""}`} onClick={onAbrirAdjuntos}
          aria-expanded={verAdjuntos} title="Links (por ejemplo, carpetas de SharePoint) y archivos">Adjuntos{adjuntos.length ? ` (${adjuntos.length})` : ""}</button>
        <button type="button" className="lean-borrar" onClick={onBorrar} aria-label={replicada ? "Quitar de este tablero" : "Borrar tarea"}
          title={replicada ? "Quitar de este tablero" : "Borrar"}>×</button>
      </div></td>
    </tr>
    {verNotas && (
      <PanelNotas notas={notas} compacto={verNotas === "reunion"} hoy={hoy} email={email} autorDe={autorDe} reunionDe={reunionDe}
        onAgregar={onAgregarNota} onBorrar={onBorrarNota} onVerTodas={onAbrirNotas}
        puedeEditar={puedeEditarNotas} onEditar={onEditarNota} />
    )}
    {verAdjuntos && (
      <PanelAdjuntos adjuntos={adjuntos} onAgregarLink={onAgregarLink} onSubirArchivo={onSubirArchivo}
        onAbrirArchivo={onAbrirArchivo} onQuitar={onQuitarAdjunto} />
    )}
    </>
  );
}

// Bitácora de la tarea: notas por fecha, la más nueva arriba. Enter guarda y deja el cursor listo para la
// siguiente (para anotar en vivo en una call); Shift+Enter hace un salto de línea. En modo reunión se
// muestra compacta: la carga y las últimas tres notas.
const fmtCorta = (iso) => iso.slice(5, 10).split("-").reverse().join("/");
const BORRABLE_MS = 15 * 60 * 1000;
const cargada = (ts) => {
  const d = new Date(ts);
  const dd = (n) => String(n).padStart(2, "0");
  return `${dd(d.getDate())}.${dd(d.getMonth() + 1)}.${d.getFullYear()} ${dd(d.getHours())}:${dd(d.getMinutes())}`;
};

function PanelNotas({ notas, compacto, hoy, email, autorDe, reunionDe, onAgregar, onBorrar, onVerTodas, puedeEditar, onEditar }) {
  const [fecha, setFecha] = useState(hoy);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const caja = useRef(null);
  const [editando, setEditando] = useState(null);   // { id, fecha, texto } de la nota que corrige un admin
  const guardarEdicion = async () => {
    const n = notas.find((x) => x.id === editando.id);
    const texto = editando.texto.trim();
    if (!texto) return;
    if (texto !== n.texto || editando.fecha !== n.fecha) await onEditar(n, { texto, fecha: editando.fecha || n.fecha });
    setEditando(null);
  };
  const visibles = compacto ? notas.slice(0, 3) : notas;
  // Reloj para saber qué notas propias todavía se pueden borrar; se actualiza cada 30 segundos.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const guardar = async (e) => {
    e?.preventDefault();
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    await onAgregar(fecha || hoy, texto.trim());
    setTexto("");
    setGuardando(false);
    caja.current?.focus();
  };

  return (
    <tr className={`lean-panel-notas ${compacto ? "is-compacto" : ""}`}>
      <td colSpan={8}>
        <form className="lean-nota-form" onSubmit={guardar}>
          <input type="date" className="lean-nota-fecha" aria-label="Fecha de la nota" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <textarea ref={caja} className="lean-nota-texto" rows={1} value={texto} placeholder="Escribí la nota y Enter para guardar"
            aria-label="Nueva nota" onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) guardar(e); }} />
          <button className="btn btn-primary lean-chico" disabled={!texto.trim() || guardando}>{guardando ? "Guardando…" : "Agregar"}</button>
        </form>
        {visibles.length > 0 ? (
          <ol className="lean-notas">
            {visibles.map((n) => {
              const borrable = n.autor === email && ahora - Date.parse(n.created_at) < BORRABLE_MS;
              if (editando?.id === n.id) {
                return (
                  <li key={n.id} className="lean-nota-editando">
                    <input type="date" className="lean-nota-fecha" aria-label="Fecha de la nota" value={editando.fecha}
                      onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} />
                    <textarea className="lean-nota-texto" rows={2} autoFocus aria-label="Texto de la nota" value={editando.texto}
                      onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditando(null);
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); guardarEdicion(); }
                      }} />
                    <button type="button" className="btn btn-primary lean-chico" disabled={!editando.texto.trim()} onClick={guardarEdicion}>Guardar</button>
                    <button type="button" className="btn btn-secondary lean-chico" onClick={() => setEditando(null)}>Cancelar</button>
                  </li>
                );
              }
              return (
                <li key={n.id}>
                  <span className="lean-nota-dia mono">{fmtCorta(n.fecha)}</span>
                  <span className="lean-nota-cuerpo">
                    {n.texto}
                    <span className="lean-nota-meta">{autorDe(n.autor)} · cargada {cargada(n.created_at)}{n.reunion_id && reunionDe(n.reunion_id) ? ` · MoM “${reunionDe(n.reunion_id)}”` : ""}{n.editada_el ? ` · editada por ${autorDe(n.editada_por)} el ${cargada(n.editada_el)}` : ""}</span>
                  </span>
                  {puedeEditar && !compacto && (
                    <button type="button" className="lean-nota-editar" onClick={() => setEditando({ id: n.id, fecha: n.fecha, texto: n.texto })}
                      aria-label="Editar nota" title="Editar (administrador)">Editar</button>
                  )}
                  {borrable && <button type="button" className="lean-borrar" onClick={() => onBorrar(n)} aria-label="Borrar nota" title="Borrar (solo en los primeros 15 minutos)">×</button>}
                </li>
              );
            })}
          </ol>
        ) : !compacto && <p className="lean-ayuda">Todavía no hay notas en esta tarea.</p>}
        {compacto && notas.length > 3 && (
          <button type="button" className="lean-adjunto" onClick={onVerTodas}>Ver las {notas.length} notas</button>
        )}
        {!compacto && notas.length > 0 && (
          <p className="lean-ayuda">{puedeEditar
            ? "Como administrador podés corregir cualquier nota: queda registrado quién la editó y cuándo."
            : "Las notas quedan como historia y solo las corrige un administrador. Una nota tuya se puede borrar en los primeros 15 minutos."}</p>
        )}
      </td>
    </tr>
  );
}

const esSharePoint = (url) => /sharepoint\.com|onedrive|1drv\.ms/i.test(url);

function Adjunto({ a, onAbrirArchivo }) {
  if (a.tipo === "link") {
    return (
      <a className="lean-adjunto" href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>
        {esSharePoint(a.url) ? "📁" : "🔗"} {a.nombre}
      </a>
    );
  }
  return <button type="button" className="lean-adjunto" onClick={() => onAbrirArchivo(a)} title="Abrir archivo">📎 {a.nombre}</button>;
}

// Links (carpetas de SharePoint u otros) y archivos subidos al bucket privado del tracker.
function PanelAdjuntos({ adjuntos, onAgregarLink, onSubirArchivo, onAbrirArchivo, onQuitar }) {
  const [link, setLink] = useState({ nombre: "", url: "" });
  const [subiendo, setSubiendo] = useState(false);
  const url = link.url.trim();
  const valido = /^https?:\/\/\S+$/i.test(url);
  const agregar = async (e) => {
    e.preventDefault();
    if (!valido) return;
    await onAgregarLink(link.nombre.trim() || (esSharePoint(url) ? "Carpeta de SharePoint" : "Link"), url);
    setLink({ nombre: "", url: "" });
  };
  const subir = async (e) => {
    const archivos = [...e.target.files];
    e.target.value = "";
    setSubiendo(true);
    for (const archivo of archivos) await onSubirArchivo(archivo);
    setSubiendo(false);
  };
  return (
    <tr className="lean-panel-adjuntos">
      <td colSpan={8}>
        {adjuntos.length > 0 && (
          <ul className="lean-adjuntos-lista">
            {adjuntos.map((a) => (
              <li key={a.id}>
                <Adjunto a={a} onAbrirArchivo={onAbrirArchivo} />
                <span className="lean-sub">{a.creado_por} · {fmt(a.created_at.slice(0, 10))}</span>
                <button type="button" className="lean-borrar" onClick={() => onQuitar(a)} aria-label={`Quitar ${a.nombre}`} title="Quitar">×</button>
              </li>
            ))}
          </ul>
        )}
        <form className="lean-form" onSubmit={agregar}>
          <label className="lean-campo lean-ancho"><span>Link (carpeta de SharePoint u otro)</span>
            <input type="url" value={link.url} placeholder="https://…sharepoint.com/…" onChange={(e) => setLink({ ...link, url: e.target.value })} />
          </label>
          <label className="lean-campo"><span>Nombre (opcional)</span>
            <input value={link.nombre} placeholder="Carpeta de SharePoint" onChange={(e) => setLink({ ...link, nombre: e.target.value })} />
          </label>
          <div className="lean-form-acciones">
            <button className="btn btn-primary" disabled={!valido}>Agregar link</button>
            <label className={`btn btn-secondary lean-subir ${subiendo ? "is-disabled" : ""}`}>
              {subiendo ? "Subiendo…" : "Subir archivo"}
              <input type="file" multiple hidden disabled={subiendo} onChange={subir} />
            </label>
          </div>
        </form>
        <p className="lean-ayuda">En SharePoint, sobre la carpeta: "Copiar vínculo", y pegalo acá. Archivos de hasta 25 MB.</p>
      </td>
    </tr>
  );
}

function FilaEdicion({ tarea, responsables, proyectos, destinos, onGuardar, onCancelar }) {
  const [replicar, setReplicar] = useState(tarea.compartida_con ?? []);
  const [c, setC] = useState({
    proyecto: tarea.proyecto, titulo: tarea.titulo, responsable: tarea.responsable,
    inicio: tarea.inicio ?? "", fin_tentativa: tarea.fin_tentativa ?? "", completada_el: tarea.completada_el ?? "", nota: tarea.nota,
  });
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const guardar = () => onGuardar({ ...c, compartida_con: replicar, titulo: c.titulo.trim(), inicio: c.inicio || null, fin_tentativa: c.fin_tentativa || null, completada_el: c.completada_el || null });
  return (
    <tr className="lean-editando">
      <td colSpan={8}>
        <div className="lean-form">
          <CampoLista etiqueta="Proyecto" valor={c.proyecto} opciones={proyectos} onCambio={(proyecto) => setC({ ...c, proyecto })} />
          <label className="lean-campo lean-ancho"><span>Tarea</span><input value={c.titulo} onChange={set("titulo")} /></label>
          <CampoLista etiqueta="Responsable" valor={c.responsable} opciones={responsables} vacio="Sin asignar" nuevo="+ Nuevo responsable…"
            placeholder="Nombre del responsable" onCambio={(responsable) => setC({ ...c, responsable })} />
          <label className="lean-campo"><span>Inicio</span><input type="date" value={c.inicio} onChange={set("inicio")} /></label>
          <label className="lean-campo"><span>Fin tentativa</span><input type="date" value={c.fin_tentativa} onChange={set("fin_tentativa")} /></label>
          <label className="lean-campo"><span>Completada el</span><input type="date" value={c.completada_el} onChange={set("completada_el")} /></label>
          <label className="lean-campo lean-ancho"><span>Impedimento / nota</span><input value={c.nota} onChange={set("nota")} /></label>
          <Replicar destinos={destinos} elegidos={replicar} onCambio={setReplicar} />
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

function NuevaTarea({ responsables, proyectos, hoy, destinos, onCrear }) {
  const vacia = { proyecto: "", titulo: "", responsable: "", inicio: hoy, fin_tentativa: "", compartida_con: [] };
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
        <CampoLista etiqueta="Proyecto (opcional)" valor={c.proyecto} opciones={proyectos} onCambio={(proyecto) => setC({ ...c, proyecto })} />
        <label className="lean-campo lean-ancho"><span>Tarea</span><input value={c.titulo} onChange={set("titulo")} required /></label>
        <CampoLista etiqueta="Responsable" valor={c.responsable} opciones={responsables} vacio="Sin asignar" nuevo="+ Nuevo responsable…"
            placeholder="Nombre del responsable" onCambio={(responsable) => setC({ ...c, responsable })} />
        <label className="lean-campo"><span>Inicio</span><input type="date" value={c.inicio} onChange={set("inicio")} /></label>
        <label className="lean-campo"><span>Fin tentativa</span><input type="date" value={c.fin_tentativa} onChange={set("fin_tentativa")} /></label>
        <div className="lean-form-acciones"><button className="btn btn-primary" disabled={!c.titulo.trim()}>Agregar</button></div>
        <Replicar destinos={destinos} elegidos={c.compartida_con} onCambio={(compartida_con) => setC({ ...c, compartida_con })} />
      </div>
      <Listas responsables={responsables} proyectos={proyectos} />
    </form>
  );
}

// Otros tableros donde también aparece la tarea (es la misma tarea: lo que se cambie se ve en todos).
// Los que no se pueden tocar (tableros de los que no sos miembro) se ven pero no se cambian.
function Replicar({ destinos, elegidos, onCambio }) {
  if (!destinos.length) return null;
  return (
    <div className="lean-replicar">
      <span className="lean-replicar-l">Mostrar también en:</span>
      {destinos.map((d) => (
        <label key={d.id} className="lean-check" title={d.puede ? undefined : "Solo lo cambian los miembros de ese tablero"}>
          <input type="checkbox" checked={elegidos.includes(d.id)} disabled={!d.puede}
            onChange={() => onCambio(elegidos.includes(d.id) ? elegidos.filter((x) => x !== d.id) : [...elegidos, d.id])} />
          {d.nombre}
        </label>
      ))}
    </div>
  );
}

// Proyecto o responsable: desplegable con todos los ya usados en el tablero y la opción de escribir uno nuevo,
// que después de guardarse queda en la lista.
function CampoLista({ etiqueta, valor, opciones, onCambio, vacio = "Sin proyecto", nuevo: textoNuevo = "+ Nuevo proyecto…",
  placeholder = "Nombre del proyecto nuevo" }) {
  const [nuevo, setNuevo] = useState(false);
  // Apenas el nuevo tiene su primera tarea, pasa a la lista y queda elegido.
  // Si ya existe con otra escritura (mayúsculas, acentos), se muestra la de la lista.
  const enLista = opciones.includes(valor);
  const enListaComo = valor && !enLista ? opciones.find((x) => clave(x) === clave(valor)) : null;
  const elegido = enListaComo && !nuevo ? enListaComo : valor;
  if ((nuevo && !enLista) || (valor && !enLista && !enListaComo)) {
    return (
      <label className="lean-campo">
        <span>{etiqueta} · nuevo</span>
        <span className="lean-nuevo-proyecto">
          <input autoFocus value={valor} placeholder={placeholder} onChange={(e) => onCambio(e.target.value)} />
          <button type="button" className="lean-borrar" title="Volver a la lista" aria-label="Volver a la lista"
            onClick={() => { setNuevo(false); onCambio(""); }}>×</button>
        </span>
      </label>
    );
  }
  return (
    <label className="lean-campo">
      <span>{etiqueta}</span>
      <select value={elegido} onChange={(e) => { setNuevo(e.target.value === "__nuevo"); onCambio(e.target.value === "__nuevo" ? "" : e.target.value); }}>
        <option value="">{vacio}</option>
        {opciones.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="__nuevo">{textoNuevo}</option>
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
