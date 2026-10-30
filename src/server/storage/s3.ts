import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PutInput, Storage } from "./types";

/** S3-compatible storage (MinIO in docker-compose, AWS S3 / R2 etc. in production). */
export class S3Storage implements Storage {
  readonly driver = "s3" as const;
  private client: S3Client;
  constructor(
    private readonly bucket: string,
    cfg: { endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint || undefined,
      forcePathStyle: !!cfg.endpoint, // MinIO
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async put({ key, body, contentType }: PutInput) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async signedUrl(key: string, opts: { expiresInSec: number; fileName: string; contentType: string }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: `inline; filename="${opts.fileName.replace(/"/g, "")}"`,
      }),
      { expiresIn: opts.expiresInSec },
    );
  }
}
