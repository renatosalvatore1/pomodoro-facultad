// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-blue; icon-glyph: train;

// Tren Mitre · ramal Retiro – J. L. Suárez
// Widget para Scriptable: próximos trenes de tu estación, con la demora en tiempo real
// y la hora a la que llegás a tu destino.
// Datos: api-trenes (no oficial, toma los datos de la app de Trenes Argentinos) a través de tu app en Vercel.
//
// Para cambiar el viaje sin tocar el código: mantené apretado el widget → Editar widget → Parameter:
//   "Miguelete > Belgrano R"   (tu estación > tu destino; puede ser cualquier estación del ramal)
//   "Drago"                    (solo la estación: muestra los dos sentidos)

const API = "__API__";
let ESTACION = "__ESTACION__";
let DESTINO = "__DESTINO__"; // cualquier estación del ramal, o "" para ver los dos sentidos

// Horario en que el widget busca trenes (hora del iPhone). Fuera de este horario no se conecta a internet
// ni hace cálculos: muestra "en pausa" y le pide a iOS volver a despertarlo recién a HORA_DESDE.
// Si los dos valores son iguales, busca todo el día. Al tocar el widget sí busca, a cualquier hora.
const HORA_DESDE = 4;
const HORA_HASTA = 10;

const param = String(args.widgetParameter || "").trim();
if (param) {
  const parts = param.split(/\s*(?:>|→|->|\/)\s*/);
  ESTACION = parts[0] || ESTACION;
  DESTINO = parts.length > 1 ? parts[1] : "";
}

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#0f172a")),
  text: Color.dynamic(new Color("#0f172a"), new Color("#f1f5f9")),
  dim: Color.dynamic(new Color("#64748b"), new Color("#94a3b8")),
  accent: Color.dynamic(new Color("#0369a1"), new Color("#38bdf8")),
  late: Color.dynamic(new Color("#b91c1c"), new Color("#f87171")),
  ok: Color.dynamic(new Color("#15803d"), new Color("#4ade80")),
};
const MIN = 60000;

// ---------- Datos ----------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "tren-mitre-cache.json");

// Último dato bueno de cada widget (cada uno puede tener otro viaje)
function readCache() {
  try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) || {} : {}; } catch (e) { return {}; }
}
// De un dato guardado solo sirven los trenes que todavía no pasaron
const fresh = (d) => (d ? { ...d, trenes: (d.trenes || []).filter((t) => Date.parse(t.llegada) > Date.now() - MIN) } : null);

async function load() {
  const url = `${API}?estacion=${encodeURIComponent(ESTACION)}&destino=${encodeURIComponent(DESTINO)}&cantidad=8`;
  let data = null, status = 0;
  try {
    const req = new Request(url);
    req.timeoutInterval = 12;
    data = await req.loadJSON();
    status = req.response ? req.response.statusCode : 200;
  } catch (e) {
    return { data: fresh(readCache()[url]), stale: true, error: "sin conexión" };
  }
  if (status === 404 || status === 400) return { data: null, stale: false, error: (data && data.mensaje) || "Estación no encontrada", badStation: true };
  if (status >= 400 || !data || data.error) {
    return { data: fresh(readCache()[url]), stale: true, error: (data && data.mensaje) || `Error ${status}` };
  }
  try {
    const all = readCache();
    all[url] = data;
    const keys = Object.keys(all);
    if (keys.length > 6) delete all[keys[0]];
    fm.writeString(cachePath, JSON.stringify(all));
  } catch (e) { /* sin caché */ }
  return { data, stale: false, error: null };
}

// ---------- Formato ----------
const df = new DateFormatter();
df.dateFormat = "HH:mm";
const hm = (iso) => df.string(new Date(iso));
const shortTo = (h) => (/su[aá]rez/i.test(h || "") ? "Suárez" : h || "");
const destName = (data) => (data.destino ? shortTo(data.destino.nombre) : data.hacia ? shortTo(data.hacia) : null);
// Hora de llegada a tu destino ("" si no hay destino elegido o no se sabe)
const llegas = (t) => (t.destino && t.destino.llegada ? hm(t.destino.llegada) : "");
const llegasProg = (t) => (t.destino && t.destino.llegada && !t.destino.enVivo ? " (prog.)" : "");

function estado(t) {
  if (t.cancelado) return { s: "Cancelado", c: C.late };
  if (!t.enVivo) return { s: "programado", c: C.dim };
  if (t.demoraMin > 0) return { s: `+${t.demoraMin} min`, c: C.late };
  if (t.demoraMin < 0) return { s: `${t.demoraMin} min`, c: C.ok };
  return { s: "a horario", c: C.ok };
}

function text(stack, s, font, color, opts = {}) {
  const t = stack.addText(String(s));
  t.font = font;
  t.textColor = color;
  t.lineLimit = opts.lines || 1;
  if (opts.scale) t.minimumScaleFactor = opts.scale;
  return t;
}

// Cuenta regresiva que avanza sola (la dibuja iOS, no hace falta refrescar el widget)
function countdown(stack, t, size, color) {
  const ms = Date.parse(t.llegada) - Date.now();
  if (t.cancelado) return text(stack, "—", Font.boldSystemFont(size), C.late);
  if (ms < 30000) return text(stack, "Llegando", Font.boldSystemFont(size * 0.8), color, { scale: 0.6 });
  const d = stack.addDate(new Date(t.llegada));
  d.applyTimerStyle();
  d.font = Font.boldMonospacedSystemFont(size);
  d.textColor = color;
  d.lineLimit = 1;
  d.minimumScaleFactor = 0.6;
  return d;
}

function header(w, title) {
  const h = w.addStack();
  h.centerAlignContent();
  const sym = SFSymbol.named("tram.fill");
  if (sym) {
    const img = h.addImage(sym.image);
    img.imageSize = new Size(12, 12);
    img.tintColor = C.accent;
    h.addSpacer(4);
  }
  text(h, title, Font.semiboldSystemFont(12), C.text, { scale: 0.7 });
  return h;
}

function footer(w, res, compact) {
  const f = w.addStack();
  const when = res.data && res.data.actualizado ? hm(res.data.actualizado) : "—";
  const s = res.stale ? `Sin conexión · datos de ${when}` : compact ? `Act. ${when}` : `Actualizado ${when} · Mitre`;
  text(f, s, Font.systemFont(9), res.stale ? C.late : C.dim);
}

const byDir = (trenes, sentido) => trenes.filter((t) => t.sentido === sentido);
// El tren destacado es el primero que no está cancelado; el resto va en la lista, en orden de llegada
function split(trenes) {
  const main = trenes.find((t) => !t.cancelado) || trenes[0];
  return { main, rest: trenes.filter((t) => t !== main) };
}
const titulo = (data) => { const d = destName(data); return d ? `${data.estacion.nombre} → ${d}` : data.estacion.nombre; };

// ---------- Diseños ----------
function small(w, res) {
  const data = res.data, trenes = data.trenes;
  if (destName(data)) {
    header(w, data.estacion.nombre);
    text(w, `→ ${destName(data)}`, Font.semiboldSystemFont(13), C.accent, { scale: 0.7 });
    w.addSpacer();
    if (!trenes.length) text(w, "Sin trenes próximos", Font.mediumSystemFont(13), C.dim, { lines: 2 });
    else {
      const { main: t, rest } = split(trenes), e = estado(t);
      countdown(w, t, 30, C.text);
      const r = w.addStack();
      text(r, hm(t.llegada), Font.semiboldSystemFont(13), C.text);
      r.addSpacer(4);
      text(r, e.s, Font.mediumSystemFont(12), e.c, { scale: 0.8 });
      if (llegas(t)) text(w, `Llegás ${llegas(t)}`, Font.mediumSystemFont(12), C.accent);
      const after = rest.filter((x) => Date.parse(x.llegada) > Date.parse(t.llegada)).slice(0, 2);
      if (after.length) text(w, `Después ${after.map((x) => hm(x.llegada) + (x.cancelado ? " ✕" : "")).join(" · ")}`, Font.systemFont(11), C.dim, { scale: 0.8 });
    }
  } else {
    header(w, data.estacion.nombre);
    w.addSpacer(4);
    [2, 1].forEach((sentido, i) => {
      const list = byDir(trenes, sentido);
      const row = w.addStack();
      row.layoutVertically();
      text(row, `→ ${sentido === 2 ? "Retiro" : "Suárez"}`, Font.semiboldSystemFont(11), C.accent);
      if (!list.length) text(row, "sin trenes", Font.systemFont(12), C.dim);
      else {
        const t = split(list).main, e = estado(t);
        const line = row.addStack();
        line.centerAlignContent();
        countdown(line, t, 20, C.text);
        line.addSpacer(4);
        text(line, `${hm(t.llegada)} ${e.s === "a horario" ? "" : e.s}`.trim(), Font.mediumSystemFont(11), e.c, { scale: 0.7 });
      }
      if (i === 0) w.addSpacer(6);
    });
    w.addSpacer();
  }
  footer(w, res, true);
}

// Fila de la lista: hora en tu estación, estado, hora de llegada al destino y "en X min"
function trainRow(stack, t, opts = {}) {
  const r = stack.addStack();
  r.centerAlignContent();
  const e = estado(t);
  const left = r.addStack();
  left.size = new Size(opts.timeWidth || 44, 0);
  text(left, hm(t.llegada), Font.semiboldSystemFont(opts.size || 14), t.cancelado ? C.late : C.text);
  if (opts.showDir) { text(r, shortTo(t.hacia), Font.systemFont(12), C.dim); r.addSpacer(6); }
  text(r, e.s, Font.mediumSystemFont(12), e.c);
  if (llegas(t) && !t.cancelado) { r.addSpacer(6); text(r, `→ ${llegas(t)}`, Font.mediumSystemFont(12), C.accent); }
  r.addSpacer();
  if (!t.cancelado && Date.parse(t.llegada) - Date.now() > 30000) {
    const d = r.addDate(new Date(t.llegada));
    d.applyRelativeStyle();
    d.font = Font.systemFont(11);
    d.textColor = C.dim;
    d.lineLimit = 1;
    d.rightAlignText();
  }
  return r;
}

// Bloque del próximo tren: cuenta regresiva grande + a qué hora pasa + a qué hora llegás
function mainBlock(w, data, t, size) {
  const e = estado(t);
  const main = w.addStack();
  main.centerAlignContent();
  countdown(main, t, size, C.text);
  main.addSpacer(10);
  const info = main.addStack();
  info.layoutVertically();
  text(info, `pasa ${hm(t.llegada)}${destName(data) ? "" : ` → ${shortTo(t.hacia)}`}`, Font.semiboldSystemFont(size >= 40 ? 16 : 14), C.text);
  text(info, t.anden ? `${e.s} · andén ${t.anden}` : e.s, Font.mediumSystemFont(12), e.c);
  if (llegas(t) && !t.cancelado) text(info, `llegás a ${shortTo(data.destino.nombre)} ${llegas(t)}${llegasProg(t)}`, Font.mediumSystemFont(12), C.accent, { scale: 0.7 });
  main.addSpacer();
}

function medium(w, res) {
  const data = res.data, trenes = data.trenes;
  header(w, titulo(data));
  w.addSpacer(6);
  if (!trenes.length) {
    text(w, "No hay trenes próximos informados.", Font.mediumSystemFont(13), C.dim, { lines: 2 });
    w.addSpacer();
  } else if (destName(data)) {
    const { main: t, rest } = split(trenes);
    mainBlock(w, data, t, 34);
    w.addSpacer(6);
    rest.slice(0, 2).forEach((x) => { trainRow(w, x); w.addSpacer(2); });
    w.addSpacer();
  } else {
    const cols = w.addStack();
    [2, 1].forEach((sentido, i) => {
      const col = cols.addStack();
      col.layoutVertically();
      text(col, `→ ${sentido === 2 ? "Retiro" : "Suárez"}`, Font.semiboldSystemFont(12), C.accent);
      const list = byDir(trenes, sentido);
      if (!list.length) text(col, "sin trenes", Font.systemFont(12), C.dim);
      else {
        const { main: t, rest } = split(list), e = estado(t);
        countdown(col, t, 24, C.text);
        text(col, `${hm(t.llegada)} · ${e.s}`, Font.mediumSystemFont(11), e.c, { scale: 0.7 });
        const after = rest.find((x) => Date.parse(x.llegada) > Date.parse(t.llegada));
        if (after) text(col, `después ${hm(after.llegada)}${after.cancelado ? " (cancelado)" : ""}`, Font.systemFont(11), C.dim, { scale: 0.8 });
      }
      if (i === 0) cols.addSpacer(12);
    });
    w.addSpacer();
  }
  footer(w, res, false);
}

function large(w, res) {
  const data = res.data, trenes = data.trenes;
  header(w, titulo(data));
  w.addSpacer(10);
  if (!trenes.length) text(w, "No hay trenes próximos informados.", Font.mediumSystemFont(14), C.dim, { lines: 2 });
  else {
    const { main: t, rest } = split(trenes);
    mainBlock(w, data, t, 40);
    w.addSpacer(12);
    if (destName(data)) { text(w, `Siguientes · hora en ${data.estacion.nombre} → llegada a ${destName(data)}`, Font.systemFont(10), C.dim, { scale: 0.7 }); w.addSpacer(4); }
    rest.slice(0, 7).forEach((x) => { trainRow(w, x, { showDir: !destName(data), size: 15, timeWidth: 50 }); w.addSpacer(6); });
  }
  w.addSpacer();
  footer(w, res, false);
}

function rectangular(w, res) {
  const data = res.data, t = data.trenes.length ? split(data.trenes).main : null;
  text(w, titulo(data), Font.semiboldSystemFont(12), Color.white(), { scale: 0.7 });
  if (!t) { text(w, "Sin trenes próximos", Font.systemFont(12), Color.white()); return; }
  const e = estado(t);
  text(w, `${hm(t.llegada)} · ${e.s}${llegas(t) ? ` · llegás ${llegas(t)}` : destName(data) ? "" : ` · ${shortTo(t.hacia)}`}`, Font.systemFont(12), Color.white(), { scale: 0.7 });
  countdown(w, t, 16, Color.white());
}

function message(w, title, body) {
  header(w, title);
  w.addSpacer(6);
  text(w, body, Font.systemFont(12), C.dim, { lines: 5, scale: 0.8 });
  w.addSpacer();
}

// ---------- Horario ----------
function enHorario(d) {
  if (HORA_DESDE === HORA_HASTA) return true;
  const h = d.getHours() + d.getMinutes() / 60;
  return HORA_DESDE < HORA_HASTA ? h >= HORA_DESDE && h < HORA_HASTA : h >= HORA_DESDE || h < HORA_HASTA;
}
// Próxima vez que el reloj marque esa hora en punto (hoy o mañana)
function proxima(hora) {
  const d = new Date();
  d.setHours(hora, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function pausa(w, family) {
  const vuelve = `${HORA_DESDE}:00`;
  const tit = `${ESTACION}${DESTINO ? ` → ${shortTo(DESTINO)}` : ""}`;
  if (family === "accessoryInline" || family === "accessoryCircular") { text(w, `Tren: desde las ${vuelve}`, Font.systemFont(12), Color.white()); return; }
  if (family === "accessoryRectangular") {
    text(w, tit, Font.semiboldSystemFont(12), Color.white(), { scale: 0.7 });
    text(w, `En pausa hasta las ${vuelve}`, Font.systemFont(12), Color.white());
    return;
  }
  header(w, tit);
  w.addSpacer();
  text(w, `Vuelve a las ${vuelve}`, Font.semiboldSystemFont(family === "small" ? 15 : 17), C.text, { scale: 0.7 });
  text(w, `Busca trenes de ${HORA_DESDE} a ${HORA_HASTA} h para ahorrar batería.`, Font.systemFont(11), C.dim, { lines: 2, scale: 0.8 });
  w.addSpacer();
}

// ---------- Armado ----------
const family = config.widgetFamily || "large";
const w = new ListWidget();
w.backgroundColor = C.bg;
w.setPadding(12, 14, 12, 14);
// Para pasar a "en pausa" apenas termina el horario
const cierre = HORA_DESDE === HORA_HASTA ? Infinity : proxima(HORA_HASTA).getTime() + 15000;

if (config.runsInWidget && !enHorario(new Date())) {
  // Fuera de horario: no se conecta ni lee nada; iOS lo vuelve a despertar a HORA_DESDE
  pausa(w, family);
  w.refreshAfterDate = proxima(HORA_DESDE);
} else {
  const res = await load();
  if (!res.data) {
    if (family === "accessoryInline" || family === "accessoryRectangular" || family === "accessoryCircular") text(w, "Tren: sin datos", Font.systemFont(12), Color.white());
    else if (res.badStation) message(w, "Tren Mitre", `${res.error} Revisá el viaje en el parámetro del widget, por ejemplo "Miguelete > Belgrano R".`);
    else message(w, "Tren Mitre", `No pude traer los datos (${res.error}). Se reintenta solo en unos minutos.`);
  } else {
    if (family === "small") small(w, res);
    else if (family === "medium") medium(w, res);
    else if (family === "accessoryRectangular") rectangular(w, res);
    else if (family === "accessoryInline" || family === "accessoryCircular") {
      const t = res.data.trenes.length ? split(res.data.trenes).main : null;
      text(w, t ? `${hm(t.llegada)} ${estado(t).s}${llegas(t) ? ` → ${llegas(t)}` : ` → ${shortTo(t.hacia)}`}` : "Sin trenes", Font.systemFont(12), Color.white());
    } else large(w, res);
  }
  // Próxima actualización: en 5 minutos (el mínimo que recomienda Apple; iOS decide el momento exacto).
  // La cuenta regresiva avanza sola mientras tanto.
  w.refreshAfterDate = new Date(Math.min(Date.now() + 5 * MIN, cierre));
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentLarge();
Script.complete();
