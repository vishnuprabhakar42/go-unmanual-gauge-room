export type PutInput = { key: string; body: Buffer; contentType: string };

/** Object storage. Keys are opaque, org-prefixed paths; files are only ever served via short-lived signed URLs. */
export interface Storage {
  readonly driver: "local" | "s3";
  put(input: PutInput): Promise<void>;
  get(key: string): Promise<Buffer>;
  signedUrl(key: string, opts: { expiresInSec: number; fileName: string; contentType: string }): Promise<string>;
}
