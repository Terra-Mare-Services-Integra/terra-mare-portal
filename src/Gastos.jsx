import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { supabase } from "./lib/supabase";
import { leerQrDeImagen } from "./lib/qrAfip";
import "./tracker.css";
import "./gastos.css";

/* ─── RENDICIÓN DE GASTOS ────────────────────────────────────────────────────
   Facturas, tickets y reembolsos con su comprobante, en lugar de mails.
   Cada gasto responde con qué se pagó (tarjeta de la empresa, plata propia o cuenta corriente del
   proveedor) y qué comprobante hay. Circuito: borrador → enviado → aprobado / rechazado; tesorería
   concilia los consumos de tarjeta contra el resumen y paga los reembolsos los viernes.
   Las reglas de quién cambia qué están en la base (trigger rg_reglas). */

const ok = ({ data, error }) => { if (error) throw error; return data; };
const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");
const fmtMes = (iso) => (iso ? `${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");
const dinero = (n, moneda = "ARS") =>
  `${moneda === "USD" ? "USD " : "$ "}${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const persona = (email) => email.replace(/@.*$/, "");

const MEDIOS = {
  tarjeta_empresa:  "Tarjeta de la empresa",
  propio:           "Tarjeta o efectivo propio",
  cuenta_corriente: "Cuenta corriente del proveedor",
};
const COMPROBANTES = {
  factura_a:       "Factura A",
  factura_b:       "Factura B",
  factura_c:       "Factura C",
  ticket:          "Ticket",
  sin_comprobante: "Sin comprobante",
};
const ESTADOS = {
  borrador:  { nombre: "Borrador",  clase: "pill-draft" },
  enviado:   { nombre: "Enviado",   clase: "pill-warn" },
  aprobado:  { nombre: "Aprobado",  clase: "pill-ok" },
  rechazado: { nombre: "Rechazado", clase: "pill-error" },
};
const CATEGORIAS = ["Comidas y representación", "Ropa técnica y EPP", "Combustible", "Peajes y estacionamiento",
  "Taxi, remís y pasajes", "Alojamiento", "Insumos y materiales", "Herramientas", "Comunicaciones", "Otros"];
const COMIDAS = CATEGORIAS[0];
const CENTROS = ["VMOS - Loading Masters", "Estructura Terra Mare"];

const Estado = ({ e }) => <span className={`pill ${ESTADOS[e].clase}`}>{ESTADOS[e].nombre}</span>;

export default function Gastos({ user, permisos }) {
  const email = user.email.toLowerCase();
  const admin = permisos.admin;
  const consolida = admin || permisos.modulos.includes("gastos-consolida");
  const vistas = [["mis", "Mis gastos"], admin && ["aprobar", "Aprobar"], consolida && ["consolidar", "Tesorería"],
    admin && ["tarjetas", "Tarjetas"]].filter(Boolean);
  const [vista, setVista] = useState("mis");
  const [gastos, setGastos] = useState(null);
  const [tarjetas, setTarjetas] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState("");

  const leer = async () => {
    const [g, t, a] = await Promise.all([
      supabase.from("rg_gastos").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("rg_tarjetas").select("*").order("nombre"),
      supabase.from("rg_archivos").select("*").order("created_at"),
    ]);
    return [ok(g), ok(t), ok(a)];
  };
  const aplicar = ([g, t, a]) => { setGastos(g); setTarjetas(t); setArchivos(a); };
  const cargar = async () => { try { aplicar(await leer()); } catch (e) { setError(e.message); } };
  useEffect(() => { leer().then(aplicar, (e) => setError(e.message)); }, []);

  const accion = async (fn) => {
    setError("");
    try { await fn(); } catch (e) { setError(e.message); }
    await cargar();
  };
  const archivosDe = (id) => archivos.filter((a) => a.gasto_id === id);
  const enviados = gastos?.filter((g) => g.estado === "enviado").length ?? 0;
  const comun = { gastos: gastos ?? [], tarjetas, archivosDe, accion, email };

  return (
    <div className="lean">
      <div className="lean-head">
        <a className="lean-volver" href="#">← Portal de módulos</a>
        <div>
          <div className="i-label">Administración</div>
          <h1 className="lean-title">Gastos y reembolsos</h1>
        </div>
        <p className="lean-ayuda">
          Cargá cada gasto con la foto del comprobante. Si es factura electrónica, el QR completa los datos.
          No hace falta mandar mail: tesorería lo ve acá.
        </p>
      </div>

      {error && <div className="alert" role="alert"><div className="alert-label">Error</div><div className="alert-text">{error}</div></div>}

      {vistas.length > 1 && (
        <div className="lean-tabs" role="tablist">
          {vistas.map(([id, nombre]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id}
              className={`lean-tab ${vista === id ? "is-active" : ""}`} onClick={() => setVista(id)}>
              {nombre}{id === "aprobar" && enviados > 0 && <span className="rg-badge">{enviados}</span>}
            </button>
          ))}
        </div>
      )}

      {!gastos ? <div className="aside-empty">Cargando gastos…</div> :
       vista === "aprobar" ? <Aprobar {...comun} /> :
       vista === "consolidar" ? <Consolidar {...comun} /> :
       vista === "tarjetas" ? <Tarjetas tarjetas={tarjetas} accion={accion} /> :
       <MisGastos {...comun} onError={setError} />}
    </div>
  );
}

/* ─── MIS GASTOS ─────────────────────────────────────────────────────────── */
function MisGastos({ gastos, tarjetas, archivosDe, accion, email, onError }) {
  const mios = gastos.filter((g) => g.email === email);
  const [editando, setEditando] = useState(null);   // null | "nuevo" | gasto
  const [abierto, setAbierto] = useState(null);

  const pendienteCobro = mios.filter((g) => g.estado === "aprobado" && !g.pagado_el && g.a_reembolsar > 0)
    .reduce((s, g) => s + Number(g.a_reembolsar), 0);
  const cuenta = (e) => mios.filter((g) => g.estado === e).length;

  if (editando) {
    return <Editor gasto={editando === "nuevo" ? null : editando} tarjetas={tarjetas} gastos={gastos}
      archivos={editando === "nuevo" ? [] : archivosDe(editando.id)} onError={onError}
      onListo={async () => { setEditando(null); await accion(async () => {}); }} onCancelar={() => setEditando(null)} />;
  }

  return (
    <div className="lean-tablero">
      <div className="lean-kpis">
        <div className="lean-kpi lean-kpi--total"><span className="lean-kpi-n">{cuenta("borrador")}</span><span className="lean-kpi-l">Borradores</span></div>
        <div className="lean-kpi lean-kpi--en_curso"><span className="lean-kpi-n">{cuenta("enviado")}</span><span className="lean-kpi-l">Esperando aprobación</span></div>
        <div className="lean-kpi lean-kpi--atrasada"><span className="lean-kpi-n">{cuenta("rechazado")}</span><span className="lean-kpi-l">Rechazados</span></div>
        <div className="lean-kpi lean-kpi--completada"><span className="lean-kpi-n rg-kpi-dinero">{dinero(pendienteCobro)}</span><span className="lean-kpi-l">A cobrar</span></div>
      </div>

      <div className="lean-filtros">
        <button type="button" className="btn btn-primary" onClick={() => setEditando("nuevo")}>+ Cargar gasto</button>
      </div>

      {!mios.length ? <div className="aside-empty">Todavía no cargaste gastos.</div> : (
        <ListaGastos gastos={mios} archivosDe={archivosDe} abierto={abierto} setAbierto={setAbierto} tarjetas={tarjetas}
          acciones={(g) => ["borrador", "rechazado"].includes(g.estado) && <>
            <button type="button" className="btn btn-secondary lean-chico" onClick={() => setEditando(g)}>Editar</button>
            <button type="button" className="lean-borrar" title="Borrar" aria-label="Borrar gasto"
              onClick={() => confirm("¿Borrar este gasto y sus comprobantes?") && accion(async () => {
                const rutas = archivosDe(g.id).map((a) => a.ruta);
                if (rutas.length) ok(await supabase.storage.from("gastos").remove(rutas));
                ok(await supabase.from("rg_gastos").delete().eq("id", g.id));
              })}>×</button>
          </>} />
      )}
    </div>
  );
}

/* ─── LISTA COMÚN ────────────────────────────────────────────────────────── */
function ListaGastos({ gastos, archivosDe, abierto, setAbierto, tarjetas, acciones, conPersona, seleccion }) {
  const tarjeta = (id) => tarjetas.find((t) => t.id === id);
  return (
    <div className="lean-scroll">
      <table className="lean-tabla rg-tabla">
        <thead>
          <tr>
            {seleccion && <th>{seleccion.titulo}</th>}
            <th>Fecha</th>
            {conPersona && <th>Persona</th>}
            <th>Proveedor</th>
            <th>Pagado con</th>
            <th>Comprobante</th>
            <th className="n">Importe</th>
            <th className="n">Reembolso</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {gastos.map((g) => (
            <FilaGasto key={g.id} g={g} archivos={archivosDe(g.id)} tarjeta={tarjeta(g.tarjeta_id)} conPersona={conPersona}
              abierto={abierto === g.id} onAbrir={() => setAbierto(abierto === g.id ? null : g.id)}
              acciones={acciones?.(g)} seleccion={seleccion} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaGasto({ g, archivos, tarjeta, conPersona, abierto, onAbrir, acciones, seleccion }) {
  const columnas = 9 + (conPersona ? 1 : 0) + (seleccion ? 1 : 0);
  return (
    <>
      <tr className={`lean-fila rg-fila--${g.estado}`}>
        {seleccion && <td className="rg-c-sel" data-l={seleccion.titulo}>{seleccion.celda(g)}</td>}
        <td className="mono rg-c-fecha" data-l="Fecha">{fmt(g.fecha)}</td>
        {conPersona && <td className="rg-c-persona" data-l="Persona">{persona(g.email)}</td>}
        <td className="lean-titulo rg-c-prov">
          {g.proveedor || <span className="lean-vacio">Sin proveedor</span>}
          <div className="lean-origen">{[g.categoria, g.centro_costo].filter(Boolean).join(" · ")}</div>
        </td>
        <td className="rg-c-medio" data-l="Pagado con">{g.medio === "tarjeta_empresa" && tarjeta ? nombreTarjeta(tarjeta) : MEDIOS[g.medio]}</td>
        <td className="rg-c-comp" data-l="Comprobante">
          {COMPROBANTES[g.comprobante]}
          {!archivos.length && g.comprobante !== "sin_comprobante" && <div className="lean-falta rg-chico">Falta el archivo</div>}
        </td>
        <td className="n mono rg-c-importe" data-l="Importe">{dinero(g.importe, g.moneda)}</td>
        <td className="n mono rg-c-reemb" data-l="Reembolso">
          {Number(g.a_reembolsar) === 0 ? "—" : g.a_reembolsar < 0
            ? <span className="lean-rojo">Devuelve {dinero(-g.a_reembolsar, g.moneda)}</span> : dinero(g.a_reembolsar, g.moneda)}
          {g.pagado_el && <div className="lean-sub">Pagado {fmt(g.pagado_el)}</div>}
        </td>
        <td className="rg-c-estado" data-l="Estado"><Estado e={g.estado} /></td>
        <td className="lean-acciones rg-c-acc">
          <button type="button" className={`btn btn-secondary lean-chico ${abierto ? "is-active" : ""}`} onClick={onAbrir}>
            {abierto ? "Cerrar" : "Ver"}{archivos.length > 0 && ` · ${archivos.length}`}
          </button>
          {acciones}
        </td>
      </tr>
      {abierto && <tr className="lean-panel-adjuntos"><td colSpan={columnas}><Detalle g={g} archivos={archivos} tarjeta={tarjeta} /></td></tr>}
    </>
  );
}

const nombreTarjeta = (t) => `${t.nombre}${t.ultimos4 ? ` ·${t.ultimos4}` : ""}`;

async function abrirArchivo(a) {
  const { signedUrl } = ok(await supabase.storage.from("gastos").createSignedUrl(a.ruta, 120));
  window.open(signedUrl, "_blank", "noopener");
}

function Detalle({ g, archivos, tarjeta }) {
  const asistentes = g.asistentes ?? [];
  const personas = 1 + asistentes.length;
  const datos = [
    ["Cargado por", g.email],
    ["Pagado con", g.medio === "tarjeta_empresa" && tarjeta ? `${MEDIOS[g.medio]} — ${nombreTarjeta(tarjeta)}` : MEDIOS[g.medio]],
    ["Comprobante", [COMPROBANTES[g.comprobante], g.punto_venta && g.numero ? `${String(g.punto_venta).padStart(5, "0")}-${String(g.numero).padStart(8, "0")}` : ""].filter(Boolean).join(" ")],
    g.cuit_proveedor && ["CUIT proveedor", g.cuit_proveedor],
    g.cae && ["CAE", g.cae],
    g.iva > 0 && ["IVA", dinero(g.iva, g.moneda)],
    g.propina > 0 && ["Propina", `${dinero(g.propina, g.moneda)}${g.propina_propia ? " (plata propia)" : ""}`],
    g.parte_personal > 0 && ["Parte personal", `${dinero(g.parte_personal, g.moneda)} (a devolver)`],
    g.cliente && ["Cliente", `${g.cliente}${g.reembolsable_cliente ? " — se le factura" : ""}`],
    g.motivo && ["Motivo", g.motivo],
    g.resumen_mes && ["Resumen de la tarjeta", fmtMes(g.resumen_mes)],
    g.conciliado_el && ["Conciliado", `${fmt(g.conciliado_el)} por ${persona(g.conciliado_por)}`],
    g.revisado_el && [g.estado === "rechazado" ? "Rechazado" : "Revisado", `${fmt(g.revisado_el)} por ${persona(g.revisado_por)}`],
  ].filter(Boolean);
  return (
    <div className="rg-detalle">
      {g.estado === "rechazado" && g.revision_nota && <div className="rg-rechazo"><strong>Motivo del rechazo:</strong> {g.revision_nota}</div>}
      <dl className="rg-datos">{datos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {asistentes.length > 0 && (
        <div>
          <div className="rg-subtitulo">Asistentes ({personas} personas · {dinero(g.importe / personas, g.moneda)} por persona)</div>
          <ul className="lean-adjuntos-lista">
            {asistentes.map((a, i) => <li key={i}>{a.nombre}{a.empresa && ` — ${a.empresa}`} <span className="lean-chip lean-chip--compartida">{a.interno ? "Interno" : "Externo"}</span></li>)}
          </ul>
        </div>
      )}
      <div>
        <div className="rg-subtitulo">Comprobantes</div>
        {archivos.length ? (
          <div className="lean-adjuntos">
            {archivos.map((a) => <button key={a.id} type="button" className="lean-adjunto" onClick={() => abrirArchivo(a)}>{a.nombre}</button>)}
          </div>
        ) : <span className="lean-vacio">{g.comprobante === "sin_comprobante" ? "Sin comprobante (declarado)" : "No se subió ningún archivo"}</span>}
      </div>
    </div>
  );
}

/* ─── CARGA Y EDICIÓN ────────────────────────────────────────────────────── */
const VACIO = {
  fecha: hoyIso(), proveedor: "", cuit_proveedor: "", categoria: "", centro_costo: "", motivo: "",
  medio: "tarjeta_empresa", tarjeta_id: "", comprobante: "factura_a", punto_venta: "", numero: "", cae: "",
  moneda: "ARS", importe: "", iva: "", propina: "", propina_propia: false, parte_personal: "",
  asistentes: [], cliente: "", reembolsable_cliente: false,
};
const num = (v) => (v === "" || v == null ? 0 : Number(String(v).replace(",", ".")));

function Editor({ gasto, tarjetas, gastos, archivos, onListo, onCancelar, onError }) {
  const [c, setC] = useState(() => {
    if (!gasto) {
      const activas = tarjetas.filter((t) => t.activa);
      return { ...VACIO, tarjeta_id: activas.length === 1 ? activas[0].id : "", medio: activas.length ? "tarjeta_empresa" : "propio" };
    }
    return Object.fromEntries(Object.keys(VACIO).map((k) => [k, gasto[k] ?? VACIO[k]]));
  });
  const [nuevos, setNuevos] = useState([]);        // archivos todavía no subidos
  const [quitados, setQuitados] = useState([]);    // archivos ya subidos que se van a borrar
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const centros = useMemo(() => [...new Set([...CENTROS, ...gastos.map((g) => g.centro_costo).filter(Boolean)])], [gastos]);
  const clientes = useMemo(() => [...new Set(gastos.map((g) => g.cliente).filter(Boolean))], [gastos]);
  const proveedores = useMemo(() => [...new Set(gastos.map((g) => g.proveedor).filter(Boolean))], [gastos]);
  const activas = tarjetas.filter((t) => t.activa || t.id === c.tarjeta_id);
  const existentes = archivos.filter((a) => !quitados.includes(a.id));
  const esComida = c.categoria === COMIDAS;

  const agregarArchivos = async (lista) => {
    const files = [...lista];
    if (!files.length) return;
    setNuevos((n) => [...n, ...files]);
    setLeyendo(true);
    setAviso("");
    for (const f of files) {
      const qr = await leerQrDeImagen(f);
      if (qr) {
        // El proveedor por CUIT: si ya se le compró antes, se reutiliza el nombre.
        const previo = gastos.find((g) => g.cuit_proveedor === qr.cuit_proveedor && g.proveedor);
        setC((x) => ({ ...x, fecha: qr.fecha || x.fecha, cuit_proveedor: qr.cuit_proveedor, punto_venta: qr.punto_venta ?? "",
          numero: qr.numero ?? "", comprobante: qr.comprobante, moneda: qr.moneda, importe: qr.importe || x.importe, cae: qr.cae,
          proveedor: x.proveedor || previo?.proveedor || "" }));
        setAviso(`Datos leídos del QR de AFIP${qr.receptor ? ` · receptor CUIT ${qr.receptor}` : " · sin CUIT de receptor (no es Factura A a nombre de la empresa)"}. Revisalos.`);
        break;
      }
    }
    setLeyendo(false);
  };

  const total = num(c.importe), propina = num(c.propina), personal = num(c.parte_personal);
  const reembolso = (c.medio === "propio" ? total + propina : c.propina_propia ? propina : 0) - (c.medio === "tarjeta_empresa" ? personal : 0);
  const faltan = [
    !c.fecha && "fecha", !(total > 0) && "importe", !c.proveedor.trim() && "proveedor", !c.categoria && "categoría",
    !c.centro_costo.trim() && "centro de costo", c.medio === "tarjeta_empresa" && !c.tarjeta_id && "tarjeta",
    c.comprobante !== "sin_comprobante" && !existentes.length && !nuevos.length && "foto o PDF del comprobante",
    (c.comprobante === "sin_comprobante" || esComida) && !c.motivo.trim() && "motivo",
    personal > total && "parte personal mayor al total",
  ].filter(Boolean);

  const guardar = async (estado) => {
    setGuardando(true);
    onError("");
    try {
      const fila = {
        ...c, estado,
        tarjeta_id: c.medio === "tarjeta_empresa" ? c.tarjeta_id || null : null,
        punto_venta: c.punto_venta === "" ? null : Number(c.punto_venta), numero: c.numero === "" ? null : Number(c.numero),
        cuit_proveedor: String(c.cuit_proveedor).replace(/\D/g, ""),
        importe: total, iva: c.comprobante === "factura_a" ? num(c.iva) : 0, propina,
        propina_propia: c.medio === "propio" ? false : c.propina_propia,
        parte_personal: c.medio === "tarjeta_empresa" ? personal : 0,
        asistentes: esComida ? c.asistentes.filter((a) => a.nombre.trim()) : [],
      };
      // Los archivos se suben con el gasto en borrador; recién después se envía (las reglas no dejan tocar un enviado).
      const id = gasto
        ? (ok(await supabase.from("rg_gastos").update({ ...fila, estado: "borrador" }).eq("id", gasto.id)), gasto.id)
        : ok(await supabase.from("rg_gastos").insert({ ...fila, estado: "borrador" }).select("id").single()).id;
      for (const a of archivos.filter((a) => quitados.includes(a.id))) {
        ok(await supabase.storage.from("gastos").remove([a.ruta]));
        ok(await supabase.from("rg_archivos").delete().eq("id", a.id));
      }
      for (const f of nuevos) {
        const limpio = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
        const ruta = `${id}/${Date.now()}-${limpio}`;
        ok(await supabase.storage.from("gastos").upload(ruta, f, { contentType: f.type || undefined }));
        ok(await supabase.from("rg_archivos").insert({ gasto_id: id, ruta, nombre: f.name }));
      }
      if (estado === "enviado") ok(await supabase.from("rg_gastos").update({ estado: "enviado" }).eq("id", id));
      await onListo();
    } catch (e) {
      onError(e.message);
      setGuardando(false);
    }
  };

  const setAsistente = (i, k, v) => setC({ ...c, asistentes: c.asistentes.map((a, j) => (j === i ? { ...a, [k]: v } : a)) });

  return (
    <div className="lean-nueva rg-editor">
      <div className="lean-miembros-head">
        <h2 className="rg-h2">{gasto ? "Editar gasto" : "Cargar gasto"}</h2>
        <button type="button" className="btn btn-secondary lean-chico" onClick={onCancelar}>Cancelar</button>
      </div>
      {gasto?.estado === "rechazado" && gasto.revision_nota && (
        <div className="rg-rechazo"><strong>Motivo del rechazo:</strong> {gasto.revision_nota}</div>
      )}

      <section className="rg-seccion">
        <div className="rg-subtitulo">1 · Comprobante</div>
        <div className="lean-form-acciones">
          <label className="btn btn-primary lean-subir">
            Sacar foto
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ""; }} />
          </label>
          <label className="btn btn-secondary lean-subir">
            Subir foto o PDF
            <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {leyendo && <div className="lean-ayuda">Buscando el QR de AFIP…</div>}
        {aviso && <div className="rg-aviso">{aviso}</div>}
        {(existentes.length > 0 || nuevos.length > 0) && (
          <ul className="lean-adjuntos-lista">
            {existentes.map((a) => (
              <li key={a.id}>
                <button type="button" className="lean-adjunto" onClick={() => abrirArchivo(a)}>{a.nombre}</button>
                <button type="button" className="lean-borrar" aria-label={`Quitar ${a.nombre}`} onClick={() => setQuitados([...quitados, a.id])}>×</button>
              </li>
            ))}
            {nuevos.map((f, i) => (
              <li key={`n${i}`}>
                <span className="rg-archivo-nuevo">{f.name}</span>
                <button type="button" className="lean-borrar" aria-label={`Quitar ${f.name}`} onClick={() => setNuevos(nuevos.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="lean-form">
          <label className="lean-campo"><span>Tipo</span>
            <select value={c.comprobante} onChange={set("comprobante")}>
              {Object.entries(COMPROBANTES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </label>
          <label className="lean-campo"><span>Fecha</span><input type="date" value={c.fecha} onChange={set("fecha")} max={hoyIso()} /></label>
          <label className="lean-campo lean-ancho"><span>Proveedor</span><input list="rg-proveedores" value={c.proveedor} onChange={set("proveedor")} placeholder="Razón social o comercio" /></label>
          <label className="lean-campo"><span>CUIT</span><input inputMode="numeric" value={c.cuit_proveedor} onChange={set("cuit_proveedor")} placeholder="Opcional" /></label>
        </div>
        <div className="lean-form">
          <label className="lean-campo rg-moneda"><span>Moneda</span>
            <select value={c.moneda} onChange={set("moneda")}><option>ARS</option><option>USD</option></select>
          </label>
          <label className="lean-campo"><span>Importe total</span><input inputMode="decimal" value={c.importe} onChange={set("importe")} placeholder="0,00" /></label>
          {c.comprobante === "factura_a" && <label className="lean-campo"><span>IVA (opcional)</span><input inputMode="decimal" value={c.iva} onChange={set("iva")} /></label>}
          {c.comprobante.startsWith("factura") && <>
            <label className="lean-campo rg-corto"><span>Punto de venta</span><input inputMode="numeric" value={c.punto_venta} onChange={set("punto_venta")} /></label>
            <label className="lean-campo"><span>Número</span><input inputMode="numeric" value={c.numero} onChange={set("numero")} /></label>
          </>}
        </div>
        {c.comprobante === "sin_comprobante" && (
          <p className="rg-aviso">Sin comprobante: el motivo funciona como declaración jurada del gasto. No genera crédito fiscal.</p>
        )}
      </section>

      <section className="rg-seccion">
        <div className="rg-subtitulo">2 · ¿Con qué pagaste?</div>
        <div className="rg-opciones" role="radiogroup">
          {Object.entries(MEDIOS).map(([k, n]) => (
            <label key={k} className={`rg-opcion ${c.medio === k ? "is-active" : ""}`}>
              <input type="radio" name="medio" value={k} checked={c.medio === k} onChange={set("medio")} />{n}
            </label>
          ))}
        </div>
        <div className="lean-form">
          {c.medio === "tarjeta_empresa" && (
            <label className="lean-campo"><span>Tarjeta</span>
              <select value={c.tarjeta_id} onChange={set("tarjeta_id")}>
                <option value="">Elegí la tarjeta</option>
                {activas.map((t) => <option key={t.id} value={t.id}>{nombreTarjeta(t)}{t.titular && ` — ${t.titular}`}</option>)}
              </select>
            </label>
          )}
          <label className="lean-campo"><span>Propina (fuera del comprobante)</span><input inputMode="decimal" value={c.propina} onChange={set("propina")} placeholder="0,00" /></label>
          {c.medio !== "propio" && num(c.propina) > 0 && (
            <label className="lean-check"><input type="checkbox" checked={c.propina_propia} onChange={set("propina_propia")} />La propina la pagué con plata propia</label>
          )}
          {c.medio === "tarjeta_empresa" && (
            <label className="lean-campo"><span>Parte personal (a devolver)</span><input inputMode="decimal" value={c.parte_personal} onChange={set("parte_personal")} placeholder="0,00" /></label>
          )}
        </div>
        {c.medio === "cuenta_corriente" && <p className="lean-ayuda">El proveedor factura a Terra Mare y tesorería le paga los viernes.</p>}
      </section>

      <section className="rg-seccion">
        <div className="rg-subtitulo">3 · ¿Para qué fue?</div>
        <div className="lean-form">
          <label className="lean-campo"><span>Categoría</span>
            <select value={c.categoria} onChange={set("categoria")}>
              <option value="">Elegí</option>
              {CATEGORIAS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="lean-campo"><span>Centro de costo</span><input list="rg-centros" value={c.centro_costo} onChange={set("centro_costo")} /></label>
          <label className="lean-campo"><span>Cliente (opcional)</span><input list="rg-clientes" value={c.cliente} onChange={set("cliente")} /></label>
          <label className="lean-check"><input type="checkbox" checked={c.reembolsable_cliente} onChange={set("reembolsable_cliente")} />Se le factura al cliente</label>
          <label className="lean-campo lean-ancho"><span>Motivo{esComida || c.comprobante === "sin_comprobante" ? "" : " (opcional)"}</span>
            <input value={c.motivo} onChange={set("motivo")} placeholder={esComida ? "Reunión con…, visita a…" : ""} /></label>
        </div>

        {esComida && (
          <div className="rg-asistentes">
            <div className="rg-opciones" role="radiogroup">
              <label className={`rg-opcion ${!c.asistentes.length ? "is-active" : ""}`}>
                <input type="radio" checked={!c.asistentes.length} onChange={() => setC({ ...c, asistentes: [] })} />Solo para mí
              </label>
              <label className={`rg-opcion ${c.asistentes.length ? "is-active" : ""}`}>
                <input type="radio" checked={c.asistentes.length > 0}
                  onChange={() => c.asistentes.length || setC({ ...c, asistentes: [{ nombre: "", empresa: "", interno: false }] })} />Con otras personas
              </label>
            </div>
            {c.asistentes.map((a, i) => (
              <div key={i} className="lean-form rg-asistente">
                <label className="lean-campo"><span>Nombre</span><input value={a.nombre} onChange={(e) => setAsistente(i, "nombre", e.target.value)} /></label>
                <label className="lean-campo"><span>Empresa</span><input value={a.empresa} onChange={(e) => setAsistente(i, "empresa", e.target.value)} placeholder={a.interno ? "Terra Mare" : ""} /></label>
                <label className="lean-check"><input type="checkbox" checked={a.interno} onChange={(e) => setAsistente(i, "interno", e.target.checked)} />Interno</label>
                <button type="button" className="lean-borrar" aria-label="Quitar asistente"
                  onClick={() => setC({ ...c, asistentes: c.asistentes.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            {c.asistentes.length > 0 && (
              <div className="lean-form-acciones">
                <button type="button" className="btn btn-secondary lean-chico"
                  onClick={() => setC({ ...c, asistentes: [...c.asistentes, { nombre: "", empresa: "", interno: false }] })}>+ Asistente</button>
                {total > 0 && <span className="lean-ayuda">{1 + c.asistentes.length} personas · {dinero(total / (1 + c.asistentes.length), c.moneda)} por persona</span>}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="rg-resumen">
        <div>
          {reembolso > 0 ? <>Te reembolsan <strong>{dinero(reembolso, c.moneda)}</strong></>
            : reembolso < 0 ? <>Tenés que devolver <strong>{dinero(-reembolso, c.moneda)}</strong></>
            : "Sin reembolso: lo paga la empresa directamente."}
          {faltan.length > 0 && <div className="lean-falta rg-chico">Para enviar falta: {faltan.join(", ")}</div>}
        </div>
        <div className="lean-form-acciones">
          <button type="button" className="btn btn-secondary" disabled={guardando} onClick={() => guardar("borrador")}>Guardar borrador</button>
          <button type="button" className="btn btn-primary" disabled={guardando || faltan.length > 0} onClick={() => guardar("enviado")}>
            {guardando ? "Guardando…" : "Enviar a aprobación"}
          </button>
        </div>
      </div>

      <datalist id="rg-centros">{centros.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rg-clientes">{clientes.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rg-proveedores">{proveedores.map((x) => <option key={x} value={x} />)}</datalist>
    </div>
  );
}

/* ─── APROBAR (aprobador único) ──────────────────────────────────────────── */
function Aprobar({ gastos, tarjetas, archivosDe, accion }) {
  const [abierto, setAbierto] = useState(null);
  const [verRevisados, setVerRevisados] = useState(false);
  const pendientes = gastos.filter((g) => g.estado === "enviado")
    .sort((a, b) => (a.enviado_el ?? "").localeCompare(b.enviado_el ?? ""));
  const revisados = gastos.filter((g) => ["aprobado", "rechazado"].includes(g.estado)).slice(0, 50);

  const revisar = (g, estado) => accion(async () => {
    let revision_nota = "";
    if (estado === "rechazado") {
      revision_nota = prompt(`Motivo del rechazo para ${persona(g.email)} (lo va a ver para corregirlo):`) ?? "";
      if (!revision_nota.trim()) return;
    }
    ok(await supabase.from("rg_gastos").update({ estado, revision_nota }).eq("id", g.id));
  });

  return (
    <div className="lean-tablero">
      {!pendientes.length ? <div className="aside-empty">No hay gastos esperando aprobación.</div> : (
        <ListaGastos gastos={pendientes} archivosDe={archivosDe} abierto={abierto} setAbierto={setAbierto} tarjetas={tarjetas} conPersona
          acciones={(g) => <>
            <button type="button" className="btn btn-primary lean-chico" onClick={() => revisar(g, "aprobado")}>Aprobar</button>
            <button type="button" className="btn btn-secondary lean-chico" onClick={() => revisar(g, "rechazado")}>Rechazar</button>
          </>} />
      )}
      <label className="lean-check"><input type="checkbox" checked={verRevisados} onChange={(e) => setVerRevisados(e.target.checked)} />Ver los últimos revisados</label>
      {verRevisados && <ListaGastos gastos={revisados} archivosDe={archivosDe} abierto={abierto} setAbierto={setAbierto} tarjetas={tarjetas} conPersona />}
    </div>
  );
}

/* ─── TESORERÍA: conciliación de tarjetas y reembolsos ───────────────────── */
const mesActual = () => hoyIso().slice(0, 7);

function Consolidar({ gastos, tarjetas, archivosDe, accion }) {
  const [tarjetaId, setTarjetaId] = useState(() => tarjetas.find((t) => t.activa)?.id ?? "");
  const [mes, setMes] = useState(mesActual);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [bajando, setBajando] = useState("");
  const [verPagados, setVerPagados] = useState(false);

  const enviadosAlgunaVez = gastos.filter((g) => g.estado !== "borrador");
  const delResumen = enviadosAlgunaVez.filter((g) => g.medio === "tarjeta_empresa" && g.tarjeta_id === tarjetaId && g.resumen_mes?.slice(0, 7) === mes);
  const visibles = soloPendientes ? delResumen.filter((g) => !g.conciliado_el) : delResumen;
  const suma = (lista) => lista.reduce((s, g) => s + Number(g.importe), 0);
  const conciliados = delResumen.filter((g) => g.conciliado_el);

  const conciliar = (g) => accion(async () => {
    ok(await supabase.from("rg_gastos").update({ conciliado_el: g.conciliado_el ? null : new Date().toISOString() }).eq("id", g.id));
  });
  const moverResumen = (g) => {
    const nuevo = prompt("¿En qué resumen entró este consumo? (AAAA-MM)", g.resumen_mes?.slice(0, 7) ?? mes);
    if (!nuevo || !/^\d{4}-\d{2}$/.test(nuevo)) return;
    accion(async () => ok(await supabase.from("rg_gastos").update({ resumen_mes: `${nuevo}-01` }).eq("id", g.id)));
  };

  // Todos los comprobantes del resumen en un .zip, con fecha y proveedor en el nombre.
  const descargar = async (lista, nombreZip) => {
    setBajando(nombreZip);
    try {
      const zip = new JSZip();
      for (const g of lista) {
        for (const a of archivosDe(g.id)) {
          const blob = ok(await supabase.storage.from("gastos").download(a.ruta));
          const base = `${g.fecha}_${persona(g.email)}_${(g.proveedor || "sin-proveedor").replace(/[^\w.-]+/g, "-")}`;
          zip.file(`${base}_${a.nombre}`, blob);
        }
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: `${nombreZip}.zip` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      alert(`No se pudo armar el .zip: ${e.message}`);
    }
    setBajando("");
  };

  // Reembolsos: aprobados con saldo, por persona. Negativo = la persona le devuelve a la empresa.
  const aPagar = gastos.filter((g) => g.estado === "aprobado" && Number(g.a_reembolsar) !== 0 && !g.pagado_el);
  const porPersona = Object.entries(aPagar.reduce((acc, g) => {
    const k = `${g.email}|${g.moneda}`;
    (acc[k] ??= []).push(g);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  const pagados = gastos.filter((g) => g.pagado_el).sort((a, b) => b.pagado_el.localeCompare(a.pagado_el)).slice(0, 50);
  const pagar = (lista) => {
    const fecha = prompt("Fecha de pago (AAAA-MM-DD)", hoyIso());
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    accion(async () => {
      ok(await supabase.from("rg_gastos").update({ pagado_el: fecha }).in("id", lista.map((g) => g.id)));
    });
  };
  const tarjeta = tarjetas.find((t) => t.id === tarjetaId);

  return (
    <div className="lean-tablero">
      <section className="rg-bloque">
        <h2 className="rg-h2">Resumen de tarjeta</h2>
        {!tarjetas.length ? <div className="aside-empty">No hay tarjetas cargadas. El aprobador las agrega en la pestaña Tarjetas.</div> : <>
          <div className="lean-filtros">
            <label className="lean-campo"><span>Tarjeta</span>
              <select value={tarjetaId} onChange={(e) => setTarjetaId(e.target.value)}>
                {tarjetas.map((t) => <option key={t.id} value={t.id}>{nombreTarjeta(t)}{t.titular && ` — ${t.titular}`}{!t.activa && " (inactiva)"}</option>)}
              </select>
            </label>
            <label className="lean-campo"><span>Mes del resumen</span><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></label>
            <label className="lean-check"><input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />Solo sin conciliar</label>
            <button type="button" className="btn btn-secondary" disabled={!!bajando || !delResumen.length}
              onClick={() => descargar(delResumen, `${tarjeta ? nombreTarjeta(tarjeta).replace(/[^\w]+/g, "-") : "tarjeta"}_${mes}`)}>
              {bajando ? "Armando .zip…" : "Descargar comprobantes (.zip)"}
            </button>
          </div>
          <div className="rg-totales">
            <span>{delResumen.length} consumos · <strong>{dinero(suma(delResumen.filter((g) => g.moneda === "ARS")))}</strong>
              {delResumen.some((g) => g.moneda === "USD") && <> + <strong>{dinero(suma(delResumen.filter((g) => g.moneda === "USD")), "USD")}</strong></>}</span>
            <span>Conciliados {conciliados.length} de {delResumen.length}</span>
          </div>
          {!visibles.length ? <div className="aside-empty">No hay consumos cargados para esa tarjeta y ese mes.</div> : (
            <ListaGastos gastos={visibles} archivosDe={archivosDe} abierto={abierto} setAbierto={setAbierto} tarjetas={tarjetas} conPersona
              seleccion={{
                titulo: "Conciliado",
                celda: (g) => (
                  <input type="checkbox" className="rg-conciliar" checked={!!g.conciliado_el} disabled={g.estado !== "aprobado"}
                    title={g.estado === "aprobado" ? "Está en el resumen" : "Se concilia una vez aprobado"}
                    aria-label={`Conciliar ${g.proveedor}`} onChange={() => conciliar(g)} />
                ),
              }}
              acciones={(g) => g.estado === "aprobado" && (
                <button type="button" className="btn btn-secondary lean-chico" onClick={() => moverResumen(g)}>Cambiar mes</button>
              )} />
          )}
        </>}
      </section>

      <section className="rg-bloque">
        <h2 className="rg-h2">Reembolsos a pagar</h2>
        <p className="lean-ayuda">Gastos aprobados pagados con plata propia (o propinas). En negativo, lo que la persona tiene que devolver por consumos personales con la tarjeta.</p>
        {!porPersona.length ? <div className="aside-empty">No hay reembolsos pendientes.</div> : (
          <div className="lean-scroll">
            <table className="lean-tabla rg-reembolsos">
              <thead><tr><th>Persona</th><th className="n">Gastos</th><th className="n">Saldo</th><th /></tr></thead>
              <tbody>
                {porPersona.map(([k, lista]) => {
                  const [quien, moneda] = k.split("|");
                  const saldo = lista.reduce((s, g) => s + Number(g.a_reembolsar), 0);
                  return (
                    <tr key={k} className="lean-fila">
                      <td className="lean-titulo">{quien}</td>
                      <td className="n mono" data-l="Gastos">{lista.length}</td>
                      <td className={`n mono ${saldo < 0 ? "lean-rojo" : ""}`} data-l={saldo < 0 ? "Devuelve" : "A pagar"}>{dinero(saldo, moneda)}</td>
                      <td className="lean-acciones">
                        <button type="button" className="btn btn-secondary lean-chico" disabled={!!bajando}
                          onClick={() => descargar(lista, `reembolso_${persona(quien)}_${hoyIso()}`)}>Comprobantes</button>
                        <button type="button" className="btn btn-primary lean-chico" onClick={() => pagar(lista)}>{saldo < 0 ? "Marcar devuelto" : "Marcar pagado"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <label className="lean-check"><input type="checkbox" checked={verPagados} onChange={(e) => setVerPagados(e.target.checked)} />Ver los últimos pagados</label>
        {verPagados && <ListaGastos gastos={pagados} archivosDe={archivosDe} abierto={abierto} setAbierto={setAbierto} tarjetas={tarjetas} conPersona
          acciones={(g) => <button type="button" className="btn btn-secondary lean-chico"
            onClick={() => confirm("¿Deshacer el pago?") && accion(async () => ok(await supabase.from("rg_gastos").update({ pagado_el: null }).eq("id", g.id)))}>Deshacer pago</button>} />}
      </section>
    </div>
  );
}

/* ─── TARJETAS DE LA EMPRESA ─────────────────────────────────────────────── */
function Tarjetas({ tarjetas, accion }) {
  const [n, setN] = useState({ nombre: "", ultimos4: "", titular: "" });
  const agregar = (e) => {
    e.preventDefault();
    accion(async () => {
      ok(await supabase.from("rg_tarjetas").insert({ ...n, nombre: n.nombre.trim(), titular: n.titular.trim() }));
      setN({ nombre: "", ultimos4: "", titular: "" });
    });
  };
  return (
    <div className="lean-tablero">
      <form className="lean-nueva" onSubmit={agregar}>
        <div className="rg-subtitulo">Agregar tarjeta</div>
        <div className="lean-form">
          <label className="lean-campo"><span>Nombre</span><input required value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} placeholder="Visa Galicia" /></label>
          <label className="lean-campo rg-corto"><span>Últimos 4</span><input inputMode="numeric" maxLength={4} pattern="[0-9]{0,4}" value={n.ultimos4} onChange={(e) => setN({ ...n, ultimos4: e.target.value })} /></label>
          <label className="lean-campo"><span>Titular</span><input value={n.titular} onChange={(e) => setN({ ...n, titular: e.target.value })} /></label>
          <div className="lean-form-acciones"><button className="btn btn-primary" disabled={!n.nombre.trim()}>Agregar</button></div>
        </div>
      </form>
      {!tarjetas.length ? <div className="aside-empty">Todavía no hay tarjetas.</div> : (
        <div className="lean-scroll">
          <table className="lean-tabla rg-reembolsos">
            <thead><tr><th>Tarjeta</th><th>Titular</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {tarjetas.map((t) => (
                <tr key={t.id} className="lean-fila">
                  <td className="lean-titulo">{nombreTarjeta(t)}</td>
                  <td data-l="Titular">{t.titular || "—"}</td>
                  <td data-l="Estado">{t.activa ? <span className="pill pill-ok">Activa</span> : <span className="pill pill-draft">Inactiva</span>}</td>
                  <td className="lean-acciones">
                    <button type="button" className="btn btn-secondary lean-chico"
                      onClick={() => accion(async () => ok(await supabase.from("rg_tarjetas").update({ activa: !t.activa }).eq("id", t.id)))}>
                      {t.activa ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="lean-regla">Una tarjeta desactivada ya no aparece al cargar gastos, pero sus consumos siguen en Tesorería.</p>
    </div>
  );
}
