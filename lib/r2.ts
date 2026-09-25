import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function r2Config() {
  return {
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucket: process.env.R2_BUCKET || "",
    publicUrl: (process.env.R2_PUBLIC_URL || "").replace(/\/$/, ""),
  };
}

export function r2Ready() {
  const config = r2Config();
  return Boolean(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucket && config.publicUrl);
}

function client() {
  const config = r2Config();
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  const config = r2Config();
  if (!r2Ready()) throw new Error("Cloudflare R2 is not configured.");
  const objectKey = key.replace(/^\/+/, "");
  await client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${config.publicUrl}/${objectKey}`;
}
