// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-blue; icon-glyph: train;

// Tren Mitre · ramal Retiro – J. L. Suárez
// Widget para Scriptable: próximos trenes de tu estación, con la demora en tiempo real.
// Datos: api-trenes (no oficial, toma los datos de la app de Trenes Argentinos) a través de tu app en Vercel.
//
// Para cambiar de estación sin tocar el código: mantené apretado el widget → Editar widget → Parameter:
//   "Miguelete > Retiro"   (estación > hacia dónde vas)
//   "Drago"                (solo la estación: muestra los dos sentidos)

const API = "__API__";
let ESTACION = "__ESTACION__";
let HACIA = "__HACIA__"; // "Retiro", "J. L. Suárez" o "" para los dos sentidos

// Horario en que el widget busca trenes (hora del iPhone). Fuera de este horario no se conecta a internet
// ni hace cálculos: muestra "en pausa" y le pide a iOS volver a despertarlo recién a HORA_DESDE.
// Si los dos valores son iguales, busca todo el día. Al tocar el widget sí busca, a cualquier hora.
const HORA_DESDE = 4;
const HORA_HASTA = 10;

const param = String(args.widgetParameter || "").trim();
if (param) {
  const parts = param.split(/\s*(?:>|→|->|\/)\s*/);
  ESTACION = parts[0] || ESTACION;
  HACIA = parts.length > 1 ? parts[1] : "";
}

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#0f172a")),
  text: Color.dynamic(new Color("#0f172a"), new Color("#f1f5f9")),
  dim: Color.dynamic(new Color("#64748b"), new Color("#94a3b8")),
  accent: Color.dynamic(new Color("#0369a1"), new Color("#38bdf8")),
  late: Color.dynamic(new Color("#b91c1c"), new Color("#f87171")),
  ok: Color.dynamic(new Color("#15803d"), new Color("#4ade80")),
  line: Color.dynamic(new Color("#e2e8f0"), new Color("#1e293b")),
};

// ---------- Datos ----------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "tren-mitre-cache.json");

// Último dato bueno de cada widget (cada uno puede tener otra estación o sentido)
function readCache() {
  try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) || {} : {}; } catch (e) { return {}; }
}
// De un dato guardado solo sirven los trenes que todavía no pasaron
const fresh = (d) => (d ? { ...d, trenes: (d.trenes || []).filter((t) => Date.parse(t.llegada) > Date.now() - 60000) } : null);

async function load() {
  const url = `${API}?estacion=${encodeURIComponent(ESTACION)}&hacia=${encodeURIComponent(HACIA)}&cantidad=8`;
  let data = null, status = 0;
  try {
    const req = new Request(url);
    req.timeoutInterval = 12;
    data = await req.loadJSON();
    status = req.response ? req.response.statusCode : 200;
  } catch (e) {
    return { data: fresh(readCache()[url]), stale: true, error: "sin conexión" };
  }
  if (status === 404) return { data: null, stale: false, error: (data && data.mensaje) || "Estación no encontrada", badStation: true };
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

function header(w, data, title) {
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

// ---------- Diseños ----------
function small(w, res) {
  const data = res.data, trenes = data.trenes;
  const dir = data.hacia;
  header(w, data, data.estacion.nombre);
  w.addSpacer(2);
  if (dir) {
    text(w, `→ ${shortTo(dir)}`, Font.semiboldSystemFont(13), C.accent);
    w.addSpacer();
    if (!trenes.length) { text(w, "Sin trenes próximos", Font.mediumSystemFont(13), C.dim, { lines: 2 }); }
    else {
      const { main: t, rest } = split(trenes), e = estado(t);
      countdown(w, t, 30, C.text);
      const r = w.addStack();
      text(r, hm(t.llegada), Font.semiboldSystemFont(13), C.text);
      r.addSpacer(4);
      text(r, e.s, Font.mediumSystemFont(12), e.c);
      w.addSpacer(4);
      const after = rest.filter((x) => Date.parse(x.llegada) > Date.parse(t.llegada)).slice(0, 2);
      if (after.length) text(w, `Después ${after.map((x) => hm(x.llegada) + (x.cancelado ? " ✕" : "")).join(" · ")}`, Font.systemFont(11), C.dim, { scale: 0.8 });
    }
  } else {
    w.addSpacer(4);
    [2, 1].forEach((sentido, i) => {
      const t = split(byDir(trenes, sentido)).main;
      const row = w.addStack();
      row.layoutVertically();
      text(row, `→ ${sentido === 2 ? "Retiro" : "Suárez"}`, Font.semiboldSystemFont(11), C.accent);
      if (!t) { text(row, "sin trenes", Font.systemFont(12), C.dim); }
      else {
        const line = row.addStack();
        line.centerAlignContent();
        countdown(line, t, 20, C.text);
        line.addSpacer(4);
        const e = estado(t);
        text(line, `${hm(t.llegada)} ${e.s === "a horario" ? "" : e.s}`.trim(), Font.mediumSystemFont(11), e.c, { scale: 0.7 });
      }
      if (i === 0) w.addSpacer(6);
    });
    w.addSpacer();
  }
  footer(w, res, true);
}

function trainRow(stack, t, opts = {}) {
  const r = stack.addStack();
  r.centerAlignContent();
  const e = estado(t);
  const left = r.addStack();
  left.size = new Size(opts.timeWidth || 44, 0);
  text(left, hm(t.llegada), Font.semiboldSystemFont(opts.size || 14), t.cancelado ? C.late : C.text);
  if (opts.showDir) { text(r, shortTo(t.hacia), Font.systemFont(12), C.dim); r.addSpacer(6); }
  text(r, e.s, Font.mediumSystemFont(12), e.c);
  r.addSpacer();
  if (!t.cancelado) {
    const ms = Date.parse(t.llegada) - Date.now();
    if (ms > 30000) {
      const d = r.addDate(new Date(t.llegada));
      d.applyRelativeStyle();
      d.font = Font.systemFont(11);
      d.textColor = C.dim;
      d.lineLimit = 1;
      d.rightAlignText();
    }
  }
  return r;
}

function medium(w, res) {
  const data = res.data, trenes = data.trenes;
  const dir = data.hacia;
  const top = header(w, data, dir ? `${data.estacion.nombre} → ${shortTo(dir)}` : data.estacion.nombre);
  top.addSpacer();
  w.addSpacer(6);
  if (!trenes.length) {
    text(w, "No hay trenes próximos informados.", Font.mediumSystemFont(13), C.dim, { lines: 2 });
    w.addSpacer();
  } else if (dir) {
    const { main: t, rest } = split(trenes), e = estado(t);
    const main = w.addStack();
    main.centerAlignContent();
    countdown(main, t, 34, C.text);
    main.addSpacer(10);
    const info = main.addStack();
    info.layoutVertically();
    text(info, `llega ${hm(t.llegada)}`, Font.semiboldSystemFont(14), C.text);
    text(info, t.anden ? `${e.s} · andén ${t.anden}` : e.s, Font.mediumSystemFont(12), e.c);
    main.addSpacer();
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
  const dir = data.hacia;
  header(w, data, dir ? `${data.estacion.nombre} → ${shortTo(dir)}` : data.estacion.nombre);
  w.addSpacer(10);
  if (!trenes.length) text(w, "No hay trenes próximos informados.", Font.mediumSystemFont(14), C.dim, { lines: 2 });
  else {
    const { main: t, rest } = split(trenes), e = estado(t);
    const main = w.addStack();
    main.centerAlignContent();
    countdown(main, t, 40, C.text);
    main.addSpacer(12);
    const info = main.addStack();
    info.layoutVertically();
    text(info, `${hm(t.llegada)}${dir ? "" : ` → ${shortTo(t.hacia)}`}`, Font.semiboldSystemFont(16), C.text);
    text(info, t.anden ? `${e.s} · andén ${t.anden}` : e.s, Font.mediumSystemFont(13), e.c);
    w.addSpacer(12);
    rest.slice(0, 7).forEach((x) => { trainRow(w, x, { showDir: !dir, size: 15, timeWidth: 50 }); w.addSpacer(6); });
  }
  w.addSpacer();
  footer(w, res, false);
}

function rectangular(w, res) {
  const data = res.data, t = data.trenes.length ? split(data.trenes).main : null;
  text(w, `${data.estacion.nombre}${data.hacia ? ` → ${shortTo(data.hacia)}` : ""}`, Font.semiboldSystemFont(12), Color.white());
  if (!t) { text(w, "Sin trenes próximos", Font.systemFont(12), Color.white()); return; }
  const e = estado(t);
  text(w, `${hm(t.llegada)} · ${e.s}${data.hacia ? "" : ` · ${shortTo(t.hacia)}`}`, Font.systemFont(12), Color.white());
  countdown(w, t, 16, Color.white());
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
  const titulo = `${ESTACION}${HACIA ? ` → ${shortTo(HACIA)}` : ""}`;
  if (family === "accessoryInline" || family === "accessoryCircular") { text(w, `Tren: desde las ${vuelve}`, Font.systemFont(12), Color.white()); return; }
  if (family === "accessoryRectangular") {
    text(w, titulo, Font.semiboldSystemFont(12), Color.white());
    text(w, `En pausa hasta las ${vuelve}`, Font.systemFont(12), Color.white());
    return;
  }
  header(w, null, titulo);
  w.addSpacer();
  text(w, `Vuelve a las ${vuelve}`, Font.semiboldSystemFont(family === "small" ? 15 : 17), C.text, { scale: 0.7 });
  text(w, `Busca trenes de ${HORA_DESDE} a ${HORA_HASTA} h para ahorrar batería.`, Font.systemFont(11), C.dim, { lines: 2, scale: 0.8 });
  w.addSpacer();
}

function message(w, title, body) {
  header(w, null, title);
  w.addSpacer(6);
  text(w, body, Font.systemFont(12), C.dim, { lines: 5, scale: 0.8 });
  w.addSpacer();
}

// ---------- Armado ----------
const family = config.widgetFamily || "large";
const w = new ListWidget();
w.backgroundColor = C.bg;
w.setPadding(12, 14, 12, 14);
const MIN = 60000;
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
    else if (res.badStation) message(w, "Tren Mitre", `${res.error} Revisá el nombre en el parámetro del widget, por ejemplo "Miguelete > Retiro".`);
    else message(w, "Tren Mitre", `No pude traer los datos (${res.error}). Se reintenta solo en unos minutos.`);
    w.refreshAfterDate = new Date(Math.min(Date.now() + 10 * MIN, cierre));
  } else {
    if (family === "small") small(w, res);
    else if (family === "medium") medium(w, res);
    else if (family === "accessoryRectangular") rectangular(w, res);
    else if (family === "accessoryInline" || family === "accessoryCircular") {
      const t = res.data.trenes.length ? split(res.data.trenes).main : null;
      text(w, t ? `${hm(t.llegada)} ${estado(t).s} → ${shortTo(t.hacia)}` : "Sin trenes", Font.systemFont(12), Color.white());
    } else large(w, res);
    // Próxima actualización: cuando pase el próximo tren, pero nunca antes de 5 min ni después de 10
    // (Apple recomienda no pedir menos de 5 min; la cuenta regresiva igual avanza sola mientras tanto)
    const next = res.data.trenes.length ? split(res.data.trenes).main : null;
    const now = Date.now();
    const pasa = next ? Date.parse(next.llegada) + 30000 : now + 10 * MIN;
    const pedido = Math.min(Math.max(pasa, now + 5 * MIN), now + 10 * MIN);
    w.refreshAfterDate = new Date(Math.min(pedido, cierre));
  }
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentLarge();
Script.complete();
