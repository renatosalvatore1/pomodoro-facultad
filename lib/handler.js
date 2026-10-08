// Lógica de la API de datos del Pomodoro. Guarda todo en un Blob privado de Vercel.
//
//   pomodoro/actual.json          ajustes + timer + historial del mes en curso (se reescribe seguido)
//   pomodoro/historial/h-AAAA-MM  historial de meses anteriores (casi nunca cambia)
//
// GET  /api/data                 → { body, etag } del archivo actual (304 si no cambió desde If-None-Match)
// GET  /api/data?archive=h-...   → { body, etag } de un mes anterior
// PUT  /api/data                 → { hot, baseEtag } y/o { archives: { "h-AAAA-MM": cuerpo | null } }
//                                  409 con la versión actual si otro dispositivo guardó antes
//
// Todas las llamadas necesitan el encabezado x-pomodoro-key igual a la variable POMODORO_KEY.

import { createHash, timingSafeEqual } from "node:crypto";

const HOT = "pomodoro/actual.json";
const ARCHIVE_RE = /^h-\d{4}-\d{2}$/;
const archivePath = (id) => `pomodoro/historial/${id}.json`;
const MAX_BODY = 3 * 1024 * 1024;

const digest = (s) => createHash("sha256").update(String(s)).digest();
const sameKey = (given, expected) => typeof given === "string" && given.length > 0 && timingSafeEqual(digest(given), digest(expected));

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function createHandler(blob) {
  const isPrecondition = (e) =>
    (blob.BlobPreconditionFailedError && e instanceof blob.BlobPreconditionFailedError) ||
    /precondition/i.test(String(e && e.message));

  async function read(path, ifNoneMatch) {
    const r = await blob.get(path, { access: "private", useCache: false, ...(ifNoneMatch ? { ifNoneMatch } : {}) });
    if (!r) return null;
    if (r.statusCode === 304) return { notModified: true, etag: r.blob.etag };
    const text = await new Response(r.stream).text();
    return { body: JSON.parse(text), etag: r.blob.etag };
  }

  const write = (path, body, ifMatch) => blob.put(path, JSON.stringify(body), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    ...(ifMatch ? { ifMatch } : {}),
  });

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const key = process.env.POMODORO_KEY;
    if (!key) return send(res, 500, { error: "missing_key_config" });
    if (!sameKey(req.headers["x-pomodoro-key"], key)) return send(res, 401, { error: "unauthorized" });

    try {
      if (req.method === "GET") {
        const archive = req.query && req.query.archive;
        if (archive) {
          if (!ARCHIVE_RE.test(archive)) return send(res, 400, { error: "bad_archive_id" });
          const r = await read(archivePath(archive));
          return send(res, 200, r ? { body: r.body, etag: r.etag } : { body: null, etag: null });
        }
        const r = await read(HOT, req.headers["if-none-match"]);
        if (r && r.notModified) { res.statusCode = 304; res.setHeader("ETag", r.etag); res.end(); return; }
        return send(res, 200, r ? { body: r.body, etag: r.etag } : { body: null, etag: null });
      }

      if (req.method === "PUT") {
        let payload = req.body;
        if (typeof payload === "string") payload = JSON.parse(payload);
        if (!isPlainObject(payload)) return send(res, 400, { error: "bad_body" });
        if (JSON.stringify(payload).length > MAX_BODY) return send(res, 413, { error: "too_large" });

        const archives = payload.archives || {};
        if (!isPlainObject(archives)) return send(res, 400, { error: "bad_archives" });
        for (const id of Object.keys(archives)) {
          if (!ARCHIVE_RE.test(id)) return send(res, 400, { error: "bad_archive_id" });
          const body = archives[id];
          if (body !== null && !isPlainObject(body)) return send(res, 400, { error: "bad_archive_body" });
        }
        let puts = 0;
        for (const id of Object.keys(archives)) {
          if (archives[id] === null) await blob.del(archivePath(id));
          else { await write(archivePath(id), archives[id]); puts++; }
        }

        if (payload.hot !== undefined) {
          if (!isPlainObject(payload.hot)) return send(res, 400, { error: "bad_hot" });
          try {
            const r = await write(HOT, payload.hot, typeof payload.baseEtag === "string" ? payload.baseEtag : null);
            return send(res, 200, { etag: r.etag, puts: puts + 1 });
          } catch (e) {
            if (!isPrecondition(e)) throw e;
            const cur = await read(HOT);
            // El intento rechazado también cuenta como escritura en el plan de Vercel
            return send(res, 409, { error: "conflict", body: cur ? cur.body : null, etag: cur ? cur.etag : null, puts: puts + 1 });
          }
        }
        return send(res, 200, { puts });
      }

      res.setHeader("Allow", "GET, PUT");
      return send(res, 405, { error: "method_not_allowed" });
    } catch (e) {
      console.error("pomodoro api", e);
      const msg = String(e && e.message);
      const code = /credentials|store does not exist|store ID|access denied/i.test(msg) ? "storage_not_connected" : "storage_error";
      return send(res, 502, { error: code });
    }
  };
}
