export const CLONE_CHUNK_BYTES = 3 * 1024 * 1024;
export const CLONE_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;
export const CLONE_MAX_PARTS = Math.ceil(CLONE_UPLOAD_MAX_BYTES / CLONE_CHUNK_BYTES);

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCloneUploadId(value: string) {
  return UPLOAD_ID.test(value);
}

export function clonePartKey(userId: string, uploadId: string, index: number) {
  return `clone-src/${userId}/${uploadId}/${String(index).padStart(2, "0")}`;
}
