// Datos de la app de finanzas (/finanzas): un único archivo privado en el mismo Blob, con la misma clave del Pomodoro.
import { get, put, del, head, BlobPreconditionFailedError } from "@vercel/blob";
import { createHandler } from "../lib/handler.js";

export default createHandler({ get, put, del, head, BlobPreconditionFailedError }, { hot: "finanzas/datos.json", archives: false });
