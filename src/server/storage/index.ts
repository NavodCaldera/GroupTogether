import "server-only";
import { randomUUID } from "node:crypto";
import { LocalDiskStorage, type Storage, storageDir } from "./local";

let instance: Storage | undefined;

export function storage(): Storage {
  instance ??= new LocalDiskStorage(storageDir());
  return instance;
}

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class UploadError extends Error {}

export function checkUpload(file: File | null, types: Record<string, string>, label: string) {
  if (!file || file.size === 0) throw new UploadError(`Choose the ${label}`);
  if (!types[file.type])
    throw new UploadError(`The ${label} must be ${Object.values(types).join(", ").toUpperCase()}`);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`The ${label} must be 5 MB or smaller`);
  return file;
}

export async function saveUpload(file: File, folder: string, types: Record<string, string>) {
  const storageKey = `${folder}/${randomUUID()}.${types[file.type]}`;
  await storage().put(storageKey, new Uint8Array(await file.arrayBuffer()));
  return { storageKey, contentType: file.type };
}
