import path from "node:path";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { Storage } from "./types";

export type { Storage } from "./types";
export { LocalStorage } from "./local";

let instance: Storage | undefined;

/** STORAGE_DRIVER=s3 uses S3_* settings (MinIO in docker-compose); default "local" writes to STORAGE_DIR. */
export function storage(): Storage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    instance = new S3Storage(process.env.S3_BUCKET ?? "gauge-room", {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "ap-south-1",
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    });
  } else {
    instance = new LocalStorage(
      path.resolve(process.env.STORAGE_DIR ?? "storage"),
      process.env.AUTH_SECRET ?? "dev-storage-secret",
      process.env.APP_URL ?? "http://localhost:3000",
    );
  }
  return instance;
}

/** For tests. */
export function setStorage(s: Storage | undefined) {
  instance = s;
}

/** Org-prefixed, collision-free object key. */
export function objectKey(organizationId: string, folder: string, fileName: string, id: string) {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120);
  return `${organizationId}/${folder}/${id}-${safe}`;
}
