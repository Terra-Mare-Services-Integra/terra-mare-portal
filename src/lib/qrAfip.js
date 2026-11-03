import jsQR from "jsqr";

/* ─── QR DE FACTURA ELECTRÓNICA (AFIP / ARCA) ────────────────────────────────
   Toda factura electrónica lleva un QR con https://www.afip.gob.ar/fe/qr/?p=<base64 de un JSON>
   (fecha, CUIT emisor, punto de venta, tipo y número, importe, moneda, receptor y CAE).
   Se lee de la foto del comprobante para completar el gasto solo. */

// Tipo de comprobante AFIP → tipo del gasto. Facturas, notas y tiques de cada letra.
const LETRA = { 1: "a", 2: "a", 3: "a", 4: "a", 5: "a", 81: "a", 6: "b", 7: "b", 8: "b", 9: "b", 10: "b", 82: "b",
  11: "c", 12: "c", 13: "c", 15: "c", 111: "c" };

export function leerUrlAfip(texto) {
  let p;
  try { p = new URL(texto).searchParams.get("p"); } catch { return null; }
  if (!p || !/afip|arca/i.test(texto)) return null;
  try {
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    const d = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    const letra = LETRA[d.tipoCmp];
    return {
      fecha: d.fecha,
      cuit_proveedor: String(d.cuit ?? ""),
      punto_venta: d.ptoVta ?? null,
      numero: d.nroCmp ?? null,
      comprobante: letra ? `factura_${letra}` : "ticket",
      moneda: d.moneda === "DOL" ? "USD" : "ARS",
      importe: Number(d.importe) || 0,
      cae: d.codAut ? String(d.codAut) : "",
      receptor: d.tipoDocRec === 80 ? String(d.nroDocRec) : "",
    };
  } catch {
    return null;
  }
}

// Busca un QR de AFIP en una imagen o en el cuadro actual de un video, a la escala pedida.
function buscarQr(fuente, ancho, alto, lado) {
  const k = Math.min(1, lado / Math.max(ancho, alto));
  const w = Math.round(ancho * k), h = Math.round(alto * k);
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(fuente, 0, 0, w, h);
  const qr = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
  return qr && leerUrlAfip(qr.data);
}

// Foto: a dos escalas, porque las del celular son grandes y el QR, chico.
export async function leerQrDeImagen(archivo) {
  if (!archivo.type.startsWith("image/")) return null;
  let bmp;
  try { bmp = await createImageBitmap(archivo); } catch { return null; }
  return buscarQr(bmp, bmp.width, bmp.height, 1800) ?? buscarQr(bmp, bmp.width, bmp.height, 900);
}

// Cámara en vivo: un cuadro por llamada, a resolución media para que no trabe el celular.
export const leerQrDeVideo = (video) => buscarQr(video, video.videoWidth, video.videoHeight, 1000);
