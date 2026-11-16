import { useEffect, useMemo, useState } from "react";

/* ─── ARMAR MoM (minuta de reunión) ──────────────────────────────────────────
   Se arrastran tareas del tablero (o se crean ahí mismo) a la minuta y se anota cada una. Al guardar,
   cada nota queda en la bitácora de su tarea (lean_notas, con la fecha de la reunión) y la reunión
   (lean_reuniones) guarda el orden, para volver a copiar la minuta para un mail.
   El borrador se guarda en el navegador mientras se arma, por si se recarga la página en plena call.
   "Traer notas": con un período (desde/hasta, por la fecha de la nota) cada tarea de la minuta muestra las
   notas de su bitácora de esas fechas, y entran en el mail. Esas notas ya están guardadas: no se duplican. */

const fmt = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");
const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const lineas = (texto) => texto.split("\n").map((l) => l.trim()).filter(Boolean);
const fmtCorta = (iso) => iso.slice(5, 10).split("-").reverse().join("/");
// Notas de la bitácora en el período: si "hasta" está vacío o es igual a "desde", es ese día.
const enPeriodo = (n, desde, hasta) => !!desde && n.fecha >= desde && n.fecha <= (hasta || desde);
const ordenFecha = (a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at);
const textoPeriodo = (desde, hasta) => (!desde ? "" : !hasta || hasta === desde ? `del ${fmt(desde)}` : `del ${fmt(desde)} al ${fmt(hasta)}`);
// En el mail, cada renglón de una nota del período lleva su fecha adelante.
const lineasConFecha = (lista) => lista.flatMap((n) => lineas(n.texto).map((l) => `(${fmtCorta(n.fecha)}) ${l}`));

// Minuta en dos formatos: HTML (pega con formato en Outlook) y texto plano.
function armarMinuta({ titulo, fecha, asistentes, items, periodo }, ESTADOS) {
  const meta = (t) => [t.responsable && `Resp.: ${t.responsable}`, t.fin_tentativa && `Fin: ${fmt(t.fin_tentativa)}`,
    ESTADOS[t.estado]?.nombre].filter(Boolean).join(" · ");
  const texto = [
    `MoM — ${titulo}`, `Fecha: ${fmt(fecha)}`, asistentes ? `Asistentes: ${asistentes}` : null, periodo ? `Notas: ${periodo}` : null, "",
    ...items.flatMap(({ tarea, notas }, i) => [
      `${i + 1}. ${tarea.titulo}${meta(tarea) ? ` (${meta(tarea)})` : ""}`,
      ...(notas.length ? notas.map((n) => `   - ${n}`) : ["   - Sin novedades"]),
    ]),
  ].filter((l) => l !== null).join("\n");
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">`
    + `<p><b>MoM — ${escapar(titulo)}</b><br>Fecha: ${fmt(fecha)}${asistentes ? `<br>Asistentes: ${escapar(asistentes)}` : ""}${periodo ? `<br>Notas: ${escapar(periodo)}` : ""}</p><ol>`
    + items.map(({ tarea, notas }) => `<li><b>${escapar(tarea.titulo)}</b>${meta(tarea) ? ` <span style="color:#666">(${escapar(meta(tarea))})</span>` : ""}`
      + `<ul>${(notas.length ? notas : ["Sin novedades"]).map((n) => `<li>${escapar(n)}</li>`).join("")}</ul></li>`).join("")
    + `</ol></div>`;
  return { texto, html };
}

async function copiar({ texto, html }) {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([texto], { type: "text/plain" }),
    })]);
  } catch {
    await navigator.clipboard.writeText(texto);
  }
}

const VACIO = () => ({ titulo: "", fecha: hoyIso(), asistentes: "", desde: "", hasta: "", items: [] });

export default function Mom({ tablero, tareas, notas, reuniones, ESTADOS, responsables, onCrearTarea, onGuardar, onBorrarReunion, onCerrar, email }) {
  const clave = `mom-${tablero.id}`;
  const [m, setM] = useState(() => {
    try { return JSON.parse(localStorage.getItem(clave)) ?? VACIO(); } catch { return VACIO(); }
  });
  useEffect(() => { try { localStorage.setItem(clave, JSON.stringify(m)); } catch { /* sin almacenamiento */ } }, [clave, m]);

  const [buscar, setBuscar] = useState("");
  const [conCompletadas, setConCompletadas] = useState(false);
  const [nueva, setNueva] = useState({ titulo: "", responsable: "", fin_tentativa: "" });
  const [arrastrando, setArrastrando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);

  const porId = useMemo(() => Object.fromEntries(tareas.map((t) => [t.id, t])), [tareas]);
  const enMinuta = new Set(m.items.map((i) => i.tareaId));
  const items = m.items.filter((i) => porId[i.tareaId]);   // si una tarea se borró, sale de la minuta
  const disponibles = tareas
    .filter((t) => !enMinuta.has(t.id))
    .filter((t) => conCompletadas || t.estado !== "completada")
    .filter((t) => !buscar || `${t.titulo} ${t.responsable} ${t.proyecto}`.toLowerCase().includes(buscar.toLowerCase()));

  const desde = m.desde ?? "";
  const hasta = m.hasta ?? "";
  const periodoInvalido = desde && hasta && hasta < desde;
  const notasPeriodo = (tareaId) => (periodoInvalido ? [] : notas.filter((n) => n.tarea_id === tareaId && enPeriodo(n, desde, hasta)).sort(ordenFecha));
  const conNotasEnPeriodo = periodoInvalido || !desde ? [] : tareas.filter((t) => !enMinuta.has(t.id) && notasPeriodo(t.id).length);
  const periodo = periodoInvalido ? "" : textoPeriodo(desde, hasta);

  const set = (k, v) => setM((x) => ({ ...x, [k]: v }));
  const agregar = (tareaId, en = items.length) => setM((x) => {
    const sin = x.items.filter((i) => i.tareaId !== tareaId);
    const previo = x.items.find((i) => i.tareaId === tareaId);
    const pos = Math.min(en, sin.length);
    return { ...x, items: [...sin.slice(0, pos), previo ?? { tareaId, texto: "" }, ...sin.slice(pos)] };
  });
  const quitar = (tareaId) => setM((x) => ({ ...x, items: x.items.filter((i) => i.tareaId !== tareaId) }));
  const mover = (tareaId, d) => {
    const i = items.findIndex((x) => x.tareaId === tareaId);
    if (i + d < 0 || i + d >= items.length) return;
    agregar(tareaId, i + d);
  };
  const setTexto = (tareaId, texto) => setM((x) => ({ ...x, items: x.items.map((i) => (i.tareaId === tareaId ? { ...i, texto } : i)) }));

  // Arrastrar: desde la lista de tareas o dentro de la minuta para reordenar.
  const alArrastrar = (tareaId) => (e) => { e.dataTransfer.setData("text/plain", tareaId); e.dataTransfer.effectAllowed = "move"; setArrastrando(true); };
  const soltarEn = (pos) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(false);
    const id = e.dataTransfer.getData("text/plain");
    if (porId[id]) agregar(id, pos);
  };

  const crearTarea = async (e) => {
    e.preventDefault();
    if (!nueva.titulo.trim()) return;
    const id = await onCrearTarea({ titulo: nueva.titulo.trim(), responsable: nueva.responsable.trim(), fin_tentativa: nueva.fin_tentativa || null, inicio: m.fecha });
    if (id) { agregar(id); setNueva({ titulo: "", responsable: "", fin_tentativa: "" }); }
  };

  const agregarConNotas = () => setM((x) => ({ ...x, items: [...x.items, ...conNotasEnPeriodo.map((t) => ({ tareaId: t.id, texto: "" }))] }));
  // En el mail: primero las notas del período (con su fecha), después lo anotado en la reunión.
  const minuta = () => armarMinuta({ ...m, periodo, titulo: m.titulo.trim() || "Reunión", items: items.map((i) => ({ tarea: porId[i.tareaId],
    notas: [...lineasConFecha(notasPeriodo(i.tareaId)), ...lineas(i.texto)] })) }, ESTADOS);
  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(""), 3000); };
  const copiarBorrador = async () => { await copiar(minuta()); avisar("Minuta copiada: pegala en el mail."); };

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar({ titulo: m.titulo.trim(), fecha: m.fecha, asistentes: m.asistentes.trim(),
      notas_desde: desde && !periodoInvalido ? desde : null, notas_hasta: desde && !periodoInvalido ? hasta || desde : null,
      items: items.map((i) => ({ tareaId: i.tareaId, texto: i.texto.trim() })) });
    setGuardando(false);
    if (ok) {
      await copiar(minuta()).catch(() => {});
      setM(VACIO());
      avisar("Guardada: las notas quedaron en cada tarea y la minuta se copió para el mail.");
    }
  };
  const descartar = () => confirm("¿Descartar esta minuta? Lo anotado no se guarda.") && setM(VACIO());

  const meta = (t) => [t.responsable, t.fin_tentativa && `fin ${fmt(t.fin_tentativa)}`].filter(Boolean).join(" · ");
  const conNotas = items.filter((i) => i.texto.trim()).length;

  return (
    <section className="mom">
      <div className="mom-head">
        <button type="button" className="lean-volver mom-volver" onClick={onCerrar}>← Volver al tablero</button>
        <h2 className="mom-titulo">Armar MoM · {tablero.nombre}</h2>
      </div>

      <div className="lean-nueva">
        <div className="lean-form">
          <label className="lean-campo lean-ancho"><span>Reunión</span>
            <input value={m.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Seguimiento semanal VMOS" /></label>
          <label className="lean-campo"><span>Fecha</span><input type="date" value={m.fecha} onChange={(e) => set("fecha", e.target.value)} /></label>
          <label className="lean-campo lean-ancho"><span>Asistentes</span>
            <input value={m.asistentes} onChange={(e) => set("asistentes", e.target.value)} placeholder="Federico, Sergio, Juan" /></label>
        </div>
        <div className="lean-form mom-periodo">
          <label className="lean-campo"><span>Traer notas desde</span>
            <input type="date" value={desde} onChange={(e) => set("desde", e.target.value)} /></label>
          <label className="lean-campo"><span>Hasta</span>
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => set("hasta", e.target.value)} /></label>
          {conNotasEnPeriodo.length > 0 && (
            <div className="lean-form-acciones">
              <button type="button" className="btn btn-secondary" onClick={agregarConNotas}>
                Agregar {conNotasEnPeriodo.length === 1 ? "la tarea" : `las ${conNotasEnPeriodo.length} tareas`} con notas en el período
              </button>
            </div>
          )}
          {(desde || hasta) && (
            <div className="lean-form-acciones">
              <button type="button" className="btn btn-secondary" onClick={() => setM((x) => ({ ...x, desde: "", hasta: "" }))}>Sin notas anteriores</button>
            </div>
          )}
          <p className="lean-ayuda mom-periodo-ayuda">
            {periodoInvalido ? "La fecha \"hasta\" es anterior a \"desde\"."
              : desde ? `Cada tarea de la minuta muestra sus notas ${periodo} y entran en el mail. Si "hasta" queda vacío o igual, es ese día.`
              : "Elegí un período para traer a la minuta las notas que ya están cargadas en las tareas."}
          </p>
        </div>
      </div>

      <div className="mom-cuerpo">
        <aside className="mom-fuente">
          <div className="rg-subtitulo">Tareas del tablero</div>
          <input className="mom-buscar" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar tarea o responsable" aria-label="Buscar tarea" />
          <label className="lean-check mom-check"><input type="checkbox" checked={conCompletadas} onChange={(e) => setConCompletadas(e.target.checked)} />Incluir completadas</label>
          <ul className="mom-lista">
            {disponibles.map((t) => (
              <li key={t.id} className={`mom-tarea mom-tarea--${t.estado}`} draggable onDragStart={alArrastrar(t.id)} onDragEnd={() => setArrastrando(false)}>
                <span className="mom-asa" aria-hidden="true">⋮⋮</span>
                <span className="mom-tarea-txt">{t.titulo}<span className="mom-meta">{meta(t)}</span></span>
                <button type="button" className="btn btn-secondary lean-chico" onClick={() => agregar(t.id)} aria-label={`Agregar ${t.titulo} a la minuta`}>+</button>
              </li>
            ))}
            {!disponibles.length && <li className="lean-ayuda">{tareas.length ? "No quedan tareas con este filtro." : "El tablero no tiene tareas."}</li>}
          </ul>
          <form className="mom-nueva" onSubmit={crearTarea}>
            <div className="rg-subtitulo">Nueva tarea</div>
            <input value={nueva.titulo} onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })} placeholder="Qué hay que hacer" aria-label="Nueva tarea" />
            <div className="mom-nueva-fila">
              <input list="mom-responsables" value={nueva.responsable} onChange={(e) => setNueva({ ...nueva, responsable: e.target.value })} placeholder="Responsable" aria-label="Responsable" />
              <input type="date" value={nueva.fin_tentativa} onChange={(e) => setNueva({ ...nueva, fin_tentativa: e.target.value })} aria-label="Fin tentativa" title="Fin tentativa" />
            </div>
            <button className="btn btn-secondary lean-chico" disabled={!nueva.titulo.trim()}>Crear y agregar a la minuta</button>
            <datalist id="mom-responsables">{responsables.map((r) => <option key={r} value={r} />)}</datalist>
          </form>
        </aside>

        <div className={`mom-minuta ${arrastrando ? "is-destino" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={soltarEn(items.length)}>
          <div className="rg-subtitulo">Minuta</div>
          {!items.length ? (
            <div className="mom-vacia">Arrastrá tareas acá (o tocá “+”) y anotá lo que se habló de cada una.</div>
          ) : (
            <ol className="mom-items">
              {items.map((i, n) => {
                const t = porId[i.tareaId];
                return (
                  <li key={i.tareaId} className="mom-item" onDragOver={(e) => e.preventDefault()} onDrop={soltarEn(n)}>
                    <div className="mom-item-head" draggable onDragStart={alArrastrar(i.tareaId)} onDragEnd={() => setArrastrando(false)}>
                      <span className="mom-asa" aria-hidden="true">⋮⋮</span>
                      <span className="mom-num">{n + 1}.</span>
                      <span className="mom-tarea-txt"><strong>{t.titulo}</strong><span className="mom-meta">{meta(t)}</span></span>
                      <span className="mom-botones">
                        <button type="button" className="lean-borrar" onClick={() => mover(i.tareaId, -1)} aria-label="Subir" title="Subir">↑</button>
                        <button type="button" className="lean-borrar" onClick={() => mover(i.tareaId, 1)} aria-label="Bajar" title="Bajar">↓</button>
                        <button type="button" className="lean-borrar" onClick={() => quitar(i.tareaId)} aria-label="Quitar de la minuta" title="Quitar">×</button>
                      </span>
                    </div>
                    {notasPeriodo(i.tareaId).length > 0 && (
                      <ol className="lean-notas mom-previas">
                        {notasPeriodo(i.tareaId).map((n) => (
                          <li key={n.id}>
                            <span className="lean-nota-dia mono">{fmtCorta(n.fecha)}</span>
                            <span className="lean-nota-cuerpo">{n.texto}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <textarea className="lean-nota-texto mom-texto" value={i.texto} rows={2} onChange={(e) => setTexto(i.tareaId, e.target.value)}
                      placeholder="Notas (cada renglón es un punto en el mail)" aria-label={`Notas de ${t.titulo}`} />
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mom-acciones">
            {aviso && <span className="mom-aviso" role="status">{aviso}</span>}
            <button type="button" className="btn btn-secondary" disabled={!items.length} onClick={copiarBorrador}>Copiar para mail</button>
            <button type="button" className="btn btn-primary" disabled={!items.length || guardando} onClick={guardar}
              title="Guarda cada nota en la bitácora de su tarea y copia la minuta">
              {guardando ? "Guardando…" : `Guardar en las tareas${conNotas ? ` (${conNotas})` : ""}`}
            </button>
            {(items.length > 0 || m.titulo) && <button type="button" className="btn btn-secondary" onClick={descartar}>Descartar</button>}
          </div>
        </div>
      </div>

      <Anteriores reuniones={reuniones} porId={porId} notas={notas} ESTADOS={ESTADOS} email={email} onBorrar={onBorrarReunion} />
    </section>
  );
}

function Anteriores({ reuniones, porId, notas, ESTADOS, email, onBorrar }) {
  const [copiada, setCopiada] = useState(null);
  if (!reuniones.length) return null;
  const copiarReunion = async (r) => {
    // Notas del período que se trajo: las de la bitácora en esas fechas, cargadas hasta que se guardó la reunión
    // (sin las de la propia reunión, que van después).
    const delPeriodo = (id) => notas.filter((n) => n.tarea_id === id && n.reunion_id !== r.id && enPeriodo(n, r.notas_desde, r.notas_hasta)
      && n.created_at <= r.created_at).sort(ordenFecha);
    const items = r.tareas.filter((id) => porId[id]).map((id) => ({
      tarea: porId[id],
      notas: [...lineasConFecha(delPeriodo(id)), ...notas.filter((n) => n.reunion_id === r.id && n.tarea_id === id).flatMap((n) => lineas(n.texto))],
    }));
    await copiar(armarMinuta({ ...r, items, periodo: textoPeriodo(r.notas_desde, r.notas_hasta) }, ESTADOS));
    setCopiada(r.id);
    setTimeout(() => setCopiada(null), 2000);
  };
  return (
    <div className="mom-anteriores">
      <div className="rg-subtitulo">MoM anteriores</div>
      <ul className="lean-adjuntos-lista">
        {reuniones.map((r) => (
          <li key={r.id}>
            <span className="mono">{fmt(r.fecha)}</span>
            <span>{r.titulo}</span>
            <span className="lean-ayuda">{r.tareas.length} {r.tareas.length === 1 ? "tarea" : "tareas"}
              {r.notas_desde ? ` · notas ${textoPeriodo(r.notas_desde, r.notas_hasta)}` : ""}</span>
            <button type="button" className="lean-adjunto" onClick={() => copiarReunion(r)}>{copiada === r.id ? "Copiada" : "Copiar para mail"}</button>
            {r.creado_por === email && (
              <button type="button" className="lean-borrar" onClick={() => onBorrar(r)} aria-label={`Borrar la minuta ${r.titulo}`}
                title="Borrar la minuta (las notas quedan en sus tareas)">×</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
