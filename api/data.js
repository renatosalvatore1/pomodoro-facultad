import { get, put, del, head, BlobPreconditionFailedError } from "@vercel/blob";
import { createHandler } from "../lib/handler.js";

export default createHandler({ get, put, del, head, BlobPreconditionFailedError });
