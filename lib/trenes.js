// Próximos trenes del ramal Retiro – J. L. Suárez (línea Mitre).
// Fuente: api-trenes (https://github.com/ariedro/api-trenes), intermediario no oficial de la API de la app
// de Trenes Argentinos. No es un servicio oficial: puede cambiar o dejar de andar sin aviso.
//
// GET /api/trenes?estacion=Miguelete&destino=Belgrano R   (también /api/trenes/Miguelete/Belgrano%20R)
//   estacion: nombre (sin importar tildes) o id numérico
//   destino:  cualquier estación del ramal; devuelve solo los trenes que te llevan ahí y a qué hora llegás
//   hacia:    (anterior) "Retiro" o "Suárez" para filtrar solo por sentido; vacío = los dos sentidos
// GET /api/trenes                                    → lista de estaciones del ramal

const UPSTREAM = () => (process.env.TRENES_API_URL || "https://ariedro.dev/api-trenes").replace(/\/$/, "");
export const RAMAL_SUAREZ = 9; // id del ramal Retiro – J.L. Suárez en la API (gerencia 5 = Mitre)

// Estaciones del ramal, de Retiro a J. L. Suárez. Se usan como respaldo si la búsqueda por ramal no responde.
export const ESTACIONES = [
  "Retiro", "3 de Febrero", "Ministro Carranza", "Colegiales", "Belgrano R", "Drago", "Urquiza", "Pueyrredón",
  "Miguelete", "San Martín", "San Andrés", "Malaver", "Villa Ballester", "Chilavert", "José León Suárez",
];

export const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\bjose leon\b/g, "j l").replace(/\bj\.?\s*l\.?\s/g, "j l ").replace(/[^a-z0-9]+/g, " ").trim();
const iso = (v) => { if (!v) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const cabecera = (s) => { const n = norm(s); if (n.startsWith("retiro")) return "Retiro"; if (n.includes("suarez")) return "J. L. Suárez"; return String(s || "").trim(); };
// Nombre para mostrar: las cabeceras abreviadas y el resto como en la lista del ramal ("V. Ballester" → "Villa Ballester")
export function lindo(nombre) {
  const n = norm(nombre);
  if (n.startsWith("retiro") || n.includes("suarez")) return cabecera(nombre);
  let best = null, score = 0;
  for (const e of ESTACIONES) { const sc = parecido(nombre, e); if (sc > score) { best = e; score = sc; } }
  return score >= 40 ? best : String(nombre || "").trim();
}
// Posición de una estación en el ramal (0 = Retiro), para saber el sentido entre dos estaciones
export function posicion(nombre) {
  let idx = -1, score = 0;
  ESTACIONES.forEach((e, i) => { const sc = parecido(nombre, e); if (sc > score) { idx = i; score = sc; } });
  return score >= 40 ? idx : -1;
}
const hora = (o, keys) => { for (const k of keys) { const v = o && iso(o[k]); if (v) return v; } return null; };

// "Retiro" → 2, "Suárez" → 1 (así numera la API los sentidos de este ramal)
export function sentidoDe(text) {
  const n = norm(text);
  if (!n) return null;
  if (n === "2" || n.includes("retiro")) return 2;
  if (n === "1" || n.includes("suarez") || n.includes("j l")) return 1;
  return null;
}

// Puntaje de parecido entre lo que escribió la persona y el nombre de una estación
export function parecido(query, nombre) {
  const q = norm(query), n = norm(nombre);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 80;
  if (n.includes(q) || q.includes(n)) return 60;
  const tq = q.split(" ").filter((w) => w.length >= 4), tn = new Set(n.split(" "));
  return tq.some((w) => tn.has(w)) ? 40 : 0;
}

export function elegirEstacion(query, lista) {
  let best = null, bestScore = 0;
  for (const e of lista) {
    const s = parecido(query, e.nombre) + (e.enRamal ? 5 : 0);
    if (s > bestScore) { best = e; bestScore = s; }
  }
  return bestScore >= 40 ? best : null;
}

// Convierte la respuesta de /arribos/estacion/{id} en una lista simple de próximos trenes
export function parseArribos(json, { sentido = null, destino = null, ramal = RAMAL_SUAREZ, now = Date.now(), max = 6 } = {}) {
  const results = Array.isArray(json && json.results) ? json.results : [];
  const base = json && Number(json.timestamp) ? Number(json.timestamp) * 1000 : now;
  const trenes = [];
  for (const r of results) {
    const a = (r && r.arribo) || {}, s = (r && r.servicio) || {};
    if (ramal && s.ramal && s.ramal.id != null && Number(s.ramal.id) !== ramal) continue;
    if (s.oculto) continue;
    const sent = Number(s.sentido) || null;
    if (sentido && sent !== sentido) continue;
    const prog = iso(a.llegada && a.llegada.programada) || iso(a.salida && a.salida.programada);
    const est = iso(a.llegada && a.llegada.estimada) || iso(a.salida && a.salida.estimada);
    let llegada = est || prog;
    if (!llegada && typeof a.segundos === "number") llegada = new Date(base + a.segundos * 1000).toISOString();
    if (!llegada) continue;
    const demora = est && prog ? Math.round((Date.parse(est) - Date.parse(prog)) / 60000) : null;

    // Destino: buscar la parada en el recorrido de este tren; tiene que estar después de tu estación
    let llegaDestino = null;
    if (destino) {
      const stops = Array.isArray(s.estaciones) ? s.estaciones : null;
      if (stops && stops.length) {
        let stop = null, best = 0;
        for (const x of stops) {
          const sc = destino.id && Number(x.idElemento) === destino.id ? 1000 : parecido(destino.nombre, x.nombre);
          if (sc > best) { stop = x; best = sc; }
        }
        let ordenOrigen = Number(a.orden);
        if (!Number.isFinite(ordenOrigen)) {
          const o = stops.find((x) => Number(x.idElemento) === Number(a.idElemento));
          ordenOrigen = o ? Number(o.orden) : NaN;
        }
        if (!stop || best < 40 || stop.parada === false) continue;
        if (Number.isFinite(ordenOrigen) && !(Number(stop.orden) > ordenOrigen)) continue;
        const dProg = hora(stop.llegada, ["programada"]) || hora(stop.salida, ["programada"]);
        const dEst = hora(stop.llegada, ["estimada", "real"]) || hora(stop.salida, ["estimada", "real"]);
        llegaDestino = { llegada: dEst || dProg, programada: dProg, estimada: dEst, enVivo: !!dEst };
      } else if (destino.sentido && sent && sent !== destino.sentido) {
        continue; // sin recorrido: al menos el sentido tiene que coincidir
      }
    }
    const hasta = (s.hasta && (s.hasta.nombre || (s.hasta.estacion && s.hasta.estacion.nombre))) || (sent === 2 ? "Retiro" : sent === 1 ? "J. L. Suárez" : "");
    const estado = s.desde && s.desde.estado && s.desde.estado.nombre ? String(s.desde.estado.nombre) : null;
    trenes.push({
      numero: s.numero != null ? s.numero : null,
      sentido: sent,
      hacia: cabecera(hasta),
      llegada,
      programada: prog,
      estimada: est,
      demoraMin: demora,
      enVivo: !!est,
      anden: a.anden && a.anden.nombre != null ? String(a.anden.nombre) : null,
      cancelado: !!s.cancelacion,
      estado,
      formacion: (a.equipo && a.equipo.nombre) || (s.equipo && s.equipo.nombre) || null,
      tipo: s.tipo && s.tipo.nombre && s.tipo.nombre !== "Normal" ? String(s.tipo.nombre) : null,
      leyenda: typeof s.leyenda === "string" && s.leyenda ? s.leyenda : null,
      ...(destino ? { destino: llegaDestino } : {}),
    });
  }
  trenes.sort((x, y) => Date.parse(x.llegada) - Date.parse(y.llegada));
  return {
    actualizado: new Date(base).toISOString(),
    trenes: trenes.filter((t) => Date.parse(t.llegada) > now - 60000).slice(0, max),
  };
}

export function createTrenesHandler({ fetchFn = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  let estacionesCache = null, estacionesAt = 0;

  async function getJSON(path) {
    const res = await fetchFn(UPSTREAM() + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) { const e = new Error(`upstream_${res.status}`); e.code = "upstream"; throw e; }
    return res.json();
  }
  const mapEst = (e) => ({
    id: Number(e.id_estacion),
    nombre: String(e.nombre || "").trim(),
    enRamal: Array.isArray(e.incluida_en_ramales) && e.incluida_en_ramales.map(Number).includes(RAMAL_SUAREZ),
  });

  async function estacionesDelRamal() {
    if (estacionesCache && now() - estacionesAt < 12 * 3600 * 1000) return estacionesCache;
    const list = await getJSON(`/infraestructura/estaciones?idRamal=${RAMAL_SUAREZ}`);
    const out = (Array.isArray(list) ? list : []).map(mapEst).filter((e) => e.id && e.nombre);
    if (out.length) { estacionesCache = out; estacionesAt = now(); }
    return out;
  }
  // Respaldo: buscar por nombre probando algunas variantes (la API busca por el comienzo del nombre)
  async function buscar(nombre) {
    const n = norm(nombre);
    const words = n.split(" ").filter((w) => w.length >= 3);
    const terms = [...new Set([
      ...(n.includes("suarez") ? ["J. L. Suarez", "J.L. Suarez", "Jose Leon Suarez"] : []),
      String(nombre).trim(), words[0], words[words.length - 1],
    ].filter(Boolean))];
    for (const term of terms.slice(0, 4)) {
      const list = await getJSON(`/infraestructura/estaciones?nombre=${encodeURIComponent(term)}`);
      const found = (Array.isArray(list) ? list : []).map(mapEst).filter((e) => e.id && e.nombre);
      const e = elegirEstacion(nombre, found);
      if (e) return e;
    }
    return null;
  }
  const resueltas = new Map();
  async function resolver(q) {
    if (/^\d+$/.test(String(q).trim())) return { id: Number(q), nombre: null };
    const key = norm(q);
    if (resueltas.has(key)) return resueltas.get(key);
    let list = [];
    try { list = await estacionesDelRamal(); } catch (e) { list = []; }
    let e = elegirEstacion(q, list);
    if (!e) e = await buscar(ESTACIONES.find((n) => parecido(q, n) >= 40) || q);
    if (e) resueltas.set(key, e);
    return e;
  }
  // En Retiro paran los tres ramales del Mitre: se pide filtrado por ramal y, si no viene nada, sin filtrar
  async function arribos(id, sentido, max, destino) {
    let json = await getJSON(`/arribos/estacion/${id}?ramal=${RAMAL_SUAREZ}`);
    let parsed = parseArribos(json, { sentido, destino, now: now(), max });
    if (!parsed.trenes.length) {
      json = await getJSON(`/arribos/estacion/${id}`);
      parsed = parseArribos(json, { sentido, destino, now: now(), max });
    }
    return { json, parsed };
  }

  function send(res, status, payload, cacheSeconds) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", cacheSeconds ? `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}` : "no-store");
    res.end(JSON.stringify(payload));
  }

  return async function handler(req, res) {
    const q = req.query || {};
    const estacionQ = String(q.estacion || "").trim();
    const hacia = String(q.hacia || "").trim();
    const destinoQ = String(q.destino || "").trim();
    const max = Math.min(10, Math.max(1, parseInt(q.cantidad, 10) || 6));
    try {
      if (!estacionQ) {
        let list = [];
        try { list = await estacionesDelRamal(); } catch (e) { list = []; }
        return send(res, 200, { ramal: "Retiro – J. L. Suárez", estaciones: list.length ? list.map(({ id, nombre }) => ({ id, nombre })) : ESTACIONES.map((nombre) => ({ id: null, nombre })) }, 3600);
      }
      const est = await resolver(estacionQ);
      if (!est) return send(res, 404, { error: "estacion_no_encontrada", mensaje: `No encontré la estación "${estacionQ}" en el ramal Retiro – J. L. Suárez.`, estaciones: ESTACIONES }, 0);
      let destino = null;
      if (destinoQ) {
        const d = await resolver(destinoQ);
        if (!d) return send(res, 404, { error: "estacion_no_encontrada", mensaje: `No encontré la estación de destino "${destinoQ}" en el ramal Retiro – J. L. Suárez.`, estaciones: ESTACIONES }, 0);
        const po = posicion(est.nombre || estacionQ), pd = posicion(d.nombre || destinoQ);
        destino = { id: d.id, nombre: d.nombre || destinoQ, sentido: po >= 0 && pd >= 0 && po !== pd ? (pd < po ? 2 : 1) : null };
        if (destino.id === est.id) return send(res, 400, { error: "mismo_destino", mensaje: "La estación de destino es la misma que la de origen." }, 0);
      }
      const sentido = destino ? destino.sentido : sentidoDe(hacia);
      const { json, parsed } = await arribos(est.id, sentido, max, destino);
      let nombre = est.nombre;
      if (!nombre) {
        const r0 = (json.results || [])[0];
        nombre = (r0 && r0.arribo && r0.arribo.nombre) || `Estación ${est.id}`;
      }
      return send(res, 200, {
        estacion: { id: est.id, nombre: lindo(nombre) },
        ...(destino ? { destino: { id: destino.id, nombre: lindo(destino.nombre) } } : {}),
        hacia: sentido === 2 ? "Retiro" : sentido === 1 ? "J. L. Suárez" : null,
        ...parsed,
        fuente: "api-trenes (no oficial) · datos de Trenes Argentinos",
      }, 20);
    } catch (e) {
      console.error("trenes", e);
      return send(res, 502, { error: "fuente_no_disponible", mensaje: "La fuente de datos de trenes no respondió. Probá de nuevo en un rato." }, 0);
    }
  };
}
