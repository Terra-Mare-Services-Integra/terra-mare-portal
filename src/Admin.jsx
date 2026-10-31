import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import "./tracker.css";

/* ─── ADMINISTRACIÓN DE TERRA MARE ───────────────────────────────────────────
   Una sola lista de cuentas (Supabase de Terra Mare): quién entra al portal, qué acceso tiene en
   Loading Masters, si ve el tracker y en qué tableros está. Un tablero que no es tuyo no aparece. */

const ok = ({ data, error }) => { if (error) throw error; return data; };
const ROLES_LM = [["", "Sin acceso"], ["lector", "Solo lectura"], ["editor", "Edición"]];

export default function AdminTerraMare() {
  const [usuarios, setUsuarios] = useState(null);
  const [tableros, setTableros] = useState([]);
  const [soloPortal, setSoloPortal] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [guardando, setGuardando] = useState("");
  const [error, setError] = useState("");

  const leer = async () => {
    const [u, t] = await Promise.all([
      supabase.rpc("tm_usuarios"),
      supabase.from("lean_tableros").select("id, nombre").order("created_at"),
    ]);
    return [ok(u), ok(t)];
  };
  const aplicar = ([u, t]) => { setUsuarios(u); setTableros(t); };
  useEffect(() => {
    leer().then(aplicar, (e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada cambio se guarda al instante; después se vuelve a leer lo que quedó en la base.
  const cambiar = async (u, fn) => {
    setGuardando(u.user_id);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(`No se pudo guardar el cambio de ${u.email}: ${e.message}`);
    }
    try { aplicar(await leer()); } catch (e) { setError(e.message); }
    setGuardando("");
  };

  const togglePortal = (u) => cambiar(u, async () => {
    if (u.portal) ok(await supabase.from("tm_accesos").delete().eq("user_id", u.user_id));
    else ok(await supabase.from("tm_accesos").insert({ user_id: u.user_id, modulos: [] }));
  });
  const toggleTracker = (u) => cambiar(u, async () => {
    const modulos = u.modulos.includes("tracker") ? u.modulos.filter((m) => m !== "tracker") : [...u.modulos, "tracker"];
    ok(await supabase.from("tm_accesos").update({ modulos, updated_at: new Date().toISOString() }).eq("user_id", u.user_id));
  });
  const cambiarLm = (u, rol) => cambiar(u, async () => {
    const email = u.email.toLowerCase();
    if (!rol) ok(await supabase.from("lm_accesos").delete().eq("email", email));
    else ok(await supabase.from("lm_accesos").upsert({ email, rol, updated_at: new Date().toISOString() }));
  });
  const toggleTablero = (u, t) => cambiar(u, async () => {
    const email = u.email.toLowerCase();
    if (u.tableros.includes(t.id)) ok(await supabase.from("lean_miembros").delete().eq("tablero_id", t.id).eq("email", email));
    else ok(await supabase.from("lean_miembros").insert({ tablero_id: t.id, email }));
  });

  if (!usuarios) return <div className="lean"><div className="aside-empty">{error || "Cargando usuarios…"}</div></div>;

  const visibles = usuarios
    .filter((u) => !soloPortal || u.portal)
    .filter((u) => !buscar || u.email.toLowerCase().includes(buscar.toLowerCase()));

  return (
    <div className="lean">
      <div className="lean-head">
        <a className="lean-volver" href="#">← Inicio de Terra Mare</a>
        <div>
          <div className="i-label">Administración</div>
          <h1 className="lean-title">Accesos de Terra Mare</h1>
        </div>
        <p className="lean-ayuda">
          Todas las cuentas de Terra Mare en un solo lugar. Los cambios se guardan al instante.
          Un tablero solo lo ven sus miembros: quien no está, ni siquiera ve que existe.
        </p>
      </div>

      {error && <div className="alert" role="alert"><div className="alert-label">Error</div><div className="alert-text">{error}</div></div>}

      <div className="lean-filtros">
        <label className="lean-campo"><span>Buscar mail</span><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="nombre@empresa.com" /></label>
        <label className="lean-check">
          <input type="checkbox" checked={soloPortal} onChange={(e) => setSoloPortal(e.target.checked)} />
          Solo cuentas con acceso al portal
        </label>
      </div>

      <div className="lean-scroll">
        <table className="lean-tabla admin-tabla">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Portal</th>
              <th>Loading Masters</th>
              <th>Tracker Lean</th>
              {tableros.map((t) => <th key={t.id} className="admin-tablero">Tablero<br />{t.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((u) => {
              const ocupado = guardando === u.user_id;
              const conTracker = u.portal && u.modulos.includes("tracker");
              return (
                <tr key={u.user_id} className={u.portal || u.lm ? "" : "admin-sin"}>
                  <td className="mono">{u.email}{ocupado && <div className="lean-sub">Guardando…</div>}</td>
                  <td>
                    <label className="lean-check admin-check">
                      <input type="checkbox" checked={u.portal} disabled={ocupado} onChange={() => togglePortal(u)} />
                      {u.portal ? "Con acceso" : "Sin acceso"}
                    </label>
                  </td>
                  <td>
                    <select className="admin-select" aria-label={`Loading Masters para ${u.email}`} value={u.lm ?? ""} disabled={ocupado}
                      onChange={(e) => cambiarLm(u, e.target.value)}>
                      {ROLES_LM.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`Tracker para ${u.email}`} checked={conTracker}
                      disabled={ocupado || !u.portal} onChange={() => toggleTracker(u)} title={u.portal ? "" : "Primero dale acceso al portal"} />
                  </td>
                  {tableros.map((t) => (
                    <td key={t.id}>
                      <input type="checkbox" aria-label={`Tablero ${t.nombre} para ${u.email}`} checked={u.tableros.includes(t.id)}
                        disabled={ocupado || !conTracker} onChange={() => toggleTablero(u, t)}
                        title={conTracker ? "" : "Primero habilitá el Tracker Lean"} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="lean-regla">
        Cuentas nuevas: se crean en el Supabase de Terra Mare (Authentication → Users → Add user, con "Auto Confirm User")
        y aparecen acá para habilitarlas. Loading Masters: "Edición" ve y carga todo (sueldos, márgenes, facturación);
        "Solo lectura" ve Resultado y Dashboards. El rol de cada miembro en un tablero se cambia desde el tablero, en "Miembros".
      </p>
    </div>
  );
}
