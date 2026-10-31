import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import "./tracker.css";

/* ─── ADMINISTRACIÓN DE TERRA MARE ───────────────────────────────────────────
   Quién entra a la instancia, qué módulos ve y en qué tableros del tracker está.
   Un tablero que no es tuyo no aparece: ni siquiera se ve que existe. */

const ok = ({ data, error }) => { if (error) throw error; return data; };

export default function AdminTerraMare({ modulos }) {
  const [usuarios, setUsuarios] = useState(null);
  const [tableros, setTableros] = useState([]);
  const [soloTm, setSoloTm] = useState(true);
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

  // Cada cambio se guarda al instante; si falla, se vuelve a leer lo que quedó en la base.
  const cambiar = async (u, clave, fn) => {
    setGuardando(`${u.user_id}:${clave}`);
    setError("");
    try {
      await fn();
      aplicar(await leer());
    } catch (e) {
      setError(`No se pudo guardar el cambio de ${u.email}: ${e.message}`);
      aplicar(await leer().catch(() => [usuarios, tableros]));
    } finally {
      setGuardando("");
    }
  };

  const toggleEmpresa = (u) => cambiar(u, "tm", async () =>
    ok(await supabase.rpc("tm_set_acceso_empresa", { p_user: u.user_id, p_acceso: !u.terramare })));
  const toggleModulo = (u, id) => cambiar(u, id, async () => {
    const nuevos = u.modulos.includes(id) ? u.modulos.filter((m) => m !== id) : [...u.modulos, id];
    ok(await supabase.from("tm_accesos").upsert({ user_id: u.user_id, modulos: nuevos, updated_at: new Date().toISOString() }));
  });
  const toggleTablero = (u, t) => cambiar(u, t.id, async () => {
    const email = u.email.toLowerCase();
    if (u.tableros.includes(t.id)) {
      ok(await supabase.from("lean_miembros").delete().eq("tablero_id", t.id).eq("email", email));
    } else {
      ok(await supabase.from("lean_miembros").insert({ tablero_id: t.id, email }));
    }
  });

  if (!usuarios) return <div className="lean"><div className="aside-empty">{error || "Cargando usuarios…"}</div></div>;

  const visibles = usuarios
    .filter((u) => !soloTm || u.terramare)
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
          Habilitá la instancia, los módulos y los tableros del tracker para cada cuenta. Los cambios se guardan al instante.
          Un tablero solo lo ven sus miembros: quien no está, ni siquiera ve que existe.
        </p>
      </div>

      {error && <div className="alert" role="alert"><div className="alert-label">Error</div><div className="alert-text">{error}</div></div>}

      <div className="lean-filtros">
        <label className="lean-campo"><span>Buscar mail</span><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="nombre@empresa.com" /></label>
        <label className="lean-check">
          <input type="checkbox" checked={soloTm} onChange={(e) => setSoloTm(e.target.checked)} />
          Solo cuentas con acceso a Terra Mare
        </label>
      </div>

      <div className="lean-scroll">
        <table className="lean-tabla admin-tabla">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Terra Mare</th>
              {modulos.map((m) => <th key={m.id}>{m.nombre}</th>)}
              {tableros.map((t) => <th key={t.id} className="admin-tablero">Tablero<br />{t.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((u) => {
              const ocupado = guardando.startsWith(`${u.user_id}:`);
              const conTracker = u.modulos.includes("tracker");
              return (
                <tr key={u.user_id} className={u.terramare ? "" : "admin-sin"}>
                  <td className="mono">{u.email}{ocupado && <div className="lean-sub">Guardando…</div>}</td>
                  <td>
                    <label className="lean-check admin-check">
                      <input type="checkbox" checked={u.terramare} disabled={ocupado} onChange={() => toggleEmpresa(u)} />
                      {u.terramare ? "Con acceso" : "Sin acceso"}
                    </label>
                  </td>
                  {modulos.map((m) => (
                    <td key={m.id}>
                      <input type="checkbox" aria-label={`${m.nombre} para ${u.email}`} checked={u.modulos.includes(m.id)}
                        disabled={ocupado || !u.terramare} onChange={() => toggleModulo(u, m.id)} />
                    </td>
                  ))}
                  {tableros.map((t) => (
                    <td key={t.id}>
                      <input type="checkbox" aria-label={`Tablero ${t.nombre} para ${u.email}`} checked={u.tableros.includes(t.id)}
                        disabled={ocupado || !u.terramare || !conTracker} onChange={() => toggleTablero(u, t)}
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
        Cuentas nuevas: se crean en Supabase (Authentication → Users → Add user, con "Auto Confirm User") y después se habilitan acá.
        Loading Masters tiene su propio ingreso: esta casilla muestra la tarjeta en el portal; el permiso dentro de la app se maneja en Loading Masters.
        El rol de cada miembro en un tablero (admin o miembro) se cambia desde el tablero, en "Miembros".
      </p>
    </div>
  );
}
