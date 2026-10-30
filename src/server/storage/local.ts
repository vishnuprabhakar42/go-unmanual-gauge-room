import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PutInput, Storage } from "./types";

/**
 * Dev fallback when no S3/MinIO is available: files under STORAGE_DIR (default ./storage), served by
 * /api/files/{key} only with a valid HMAC signature and unexpired timestamp.
 */
export class LocalStorage implements Storage {
  readonly driver = "local" as const;
  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly baseUrl: string,
  ) {}

  private file(key: string) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return resolved;
  }

  async put({ key, body }: PutInput) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body);
  }

  async get(key: string) {
    return fs.readFile(this.file(key));
  }

  sign(key: string, exp: number, fileName: string, contentType: string) {
    return createHmac("sha256", this.secret).update(`${key}\n${exp}\n${fileName}\n${contentType}`).digest("base64url");
  }

  verify(key: string, exp: number, fileName: string, contentType: string, sig: string, now = Date.now()) {
    if (!Number.isFinite(exp) || exp * 1000 < now) return false;
    const expected = Buffer.from(this.sign(key, exp, fileName, contentType));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async signedUrl(key: string, opts: { expiresInSec: number; fileName: string; contentType: string }) {
    const exp = Math.floor(Date.now() / 1000) + opts.expiresInSec;
    const q = new URLSearchParams({
      exp: String(exp),
      name: opts.fileName,
      type: opts.contentType,
      sig: this.sign(key, exp, opts.fileName, opts.contentType),
    });
    return `${this.baseUrl}/api/files/${key.split("/").map(encodeURIComponent).join("/")}?${q}`;
  }
}
