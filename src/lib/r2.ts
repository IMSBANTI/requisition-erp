import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

let cachedClient: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  );
}

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are not configured in environment variables.");
  }

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedClient;
}

export function getR2BucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME is not configured in environment variables.");
  }
  return bucket;
}

/**
 * Uploads a file buffer directly to Cloudflare R2 bucket.
 */
export async function uploadToR2(params: {
  key: string;
  data: Buffer;
  mimeType: string;
}): Promise<string> {
  const s3 = getR2Client();
  const bucket = getR2BucketName();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.data,
      ContentType: params.mimeType,
    })
  );

  return params.key;
}

/**
 * Retrieves a file from Cloudflare R2 bucket as a Buffer.
 */
export async function getFromR2(key: string): Promise<{
  data: Buffer;
  mimeType?: string;
  contentLength?: number;
}> {
  const s3 = getR2Client();
  const bucket = getR2BucketName();

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`Object ${key} has no body returned from R2.`);
  }

  // Convert Node.js readable stream to Buffer
  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  return {
    data: buffer,
    mimeType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/**
 * Deletes a file from Cloudflare R2 bucket.
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!isR2Configured()) return;
  const s3 = getR2Client();
  const bucket = getR2BucketName();

  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
