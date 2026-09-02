import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES } from "@/lib/validation";

/**
 * S3 互換オブジェクトストレージ (開発は MinIO)。
 * DB には storage_url のみ保持する (指示書 15)。
 * アップロードは MIME + マジックバイト + サイズ で検証する。
 */

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: env.storage.region,
      endpoint: env.storage.endpoint,
      forcePathStyle: env.storage.forcePathStyle,
      credentials: {
        accessKeyId: env.storage.accessKeyId,
        secretAccessKey: env.storage.secretAccessKey,
      },
    });
  }
  return _client;
}

export const MAGIC: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    ext: "png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  },
  {
    type: "image/gif",
    ext: "gif",
    test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

/** バイト列の先頭から画像形式を判定する。判定不能なら null。 */
export function detectImageType(buf: Uint8Array): { type: string; ext: string } | null {
  const m = MAGIC.find((x) => x.test(buf));
  return m ? { type: m.type, ext: m.ext } : null;
}

export interface UploadResult {
  storageUrl: string;
  key: string;
  contentType: string;
  bytes: number;
}

/**
 * 画像ファイルを検証してアップロードする。
 * @param prefix オブジェクトキーの接頭辞 (例: `attempts/<attemptId>`)
 */
export async function uploadImage(
  file: { arrayBuffer(): Promise<ArrayBuffer>; type: string; size: number; name?: string },
  prefix: string,
): Promise<UploadResult> {
  if (file.size <= 0) {
    throw new ApiError("bad_request", "空のファイルです");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new ApiError("payload_too_large", "画像は 5MB 以内にしてください");
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new ApiError("unsupported_media_type", "JPEG / PNG / WebP / GIF の画像のみ対応しています");
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > MAX_PHOTO_BYTES) {
    throw new ApiError("payload_too_large", "画像は 5MB 以内にしてください");
  }
  const match = detectImageType(buf);
  if (!match || match.type !== file.type) {
    throw new ApiError("unsupported_media_type", "画像ファイルの内容が正しくありません");
  }

  const key = `${prefix.replace(/^\/+|\/+$/g, "")}/${randomUUID()}.${match.ext}`;
  await client().send(
    new PutObjectCommand({
      Bucket: env.storage.bucket,
      Key: key,
      Body: buf,
      ContentType: match.type,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    storageUrl: `${env.storage.publicBaseUrl.replace(/\/+$/, "")}/${key}`,
    key,
    contentType: match.type,
    bytes: buf.byteLength,
  };
}

/** storage_url からオブジェクトを削除する。失敗しても致命的には扱わない。 */
export async function deleteByUrl(storageUrl: string): Promise<void> {
  const base = env.storage.publicBaseUrl.replace(/\/+$/, "");
  if (!storageUrl.startsWith(base + "/")) return;
  const key = storageUrl.slice(base.length + 1);
  try {
    await client().send(new DeleteObjectCommand({ Bucket: env.storage.bucket, Key: key }));
  } catch (err) {
    console.warn("[storage] delete failed:", err instanceof Error ? err.message : "unknown");
  }
}
