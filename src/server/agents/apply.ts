import "server-only";
import { locationSchema } from "@/lib/location";
import { db } from "../db";
import { checkUpload, IMAGE_TYPES, saveUpload, UploadError } from "../storage";
import { withOrderTransaction } from "../orders/locks";
import { AgentError } from "./common";

const MAX_STORAGE_PHOTOS = 6;

function fileField(fd: FormData, name: string, label: string): File {
  const value = fd.get(name);
  try {
    return checkUpload(value instanceof File ? value : null, IMAGE_TYPES, label);
  } catch (e) {
    if (e instanceof UploadError) throw new AgentError(e.message);
    throw e;
  }
}

/** Reads and checks the whole form before anything is saved. */
function readForm(fd: FormData) {
  const pin = locationSchema.safeParse({
    address: fd.get("address") ?? "",
    city: fd.get("city") ?? "",
    lat: fd.get("lat") ?? "",
    lng: fd.get("lng") ?? "",
  });
  if (!pin.success)
    throw new AgentError(pin.error.issues[0]?.message ?? "Check the address and pin");
  const nic = fileField(fd, "nic", "NIC photo");
  const photo = fileField(fd, "photo", "photo of yourself");
  const storage = fd
    .getAll("storagePhotos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (storage.length === 0) throw new AgentError("Add photos of the storage space");
  if (storage.length > MAX_STORAGE_PHOTOS)
    throw new AgentError(`Add at most ${MAX_STORAGE_PHOTOS} storage photos`);
  for (const f of storage) {
    try {
      checkUpload(f, IMAGE_TYPES, "storage photo");
    } catch (e) {
      if (e instanceof UploadError) throw new AgentError(e.message);
      throw e;
    }
  }
  return { pin: pin.data, nic, photo, storage };
}

/** A buyer applies to become an area agent. One application per user; a rejected one may apply
 * again, which reopens the same record as APPLIED.
 */
export async function applyAsAgent(userId: string, fd: FormData): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, locked: true, factoryId: true, agent: { select: { status: true } } },
  });
  if (!user || user.role !== "CUSTOMER" || user.locked || user.factoryId)
    throw new AgentError("This account cannot apply");
  if (user.agent && user.agent.status !== "REJECTED")
    throw new AgentError("You have already applied");
  const form = readForm(fd);

  const nicKey = (await saveUpload(form.nic, "agents", IMAGE_TYPES)).storageKey;
  const photoKey = (await saveUpload(form.photo, "agents", IMAGE_TYPES)).storageKey;
  const storagePhotoKeys: string[] = [];
  for (const f of form.storage)
    storagePhotoKeys.push((await saveUpload(f, "agents", IMAGE_TYPES)).storageKey);

  const fields = {
    lat: form.pin.lat,
    lng: form.pin.lng,
    address: form.pin.address,
    city: form.pin.city,
    nicKey,
    photoKey,
    storagePhotoKeys,
  };
  await withOrderTransaction([userId], [], async (tx) => {
    const existing = await tx.agent.findUnique({ where: { userId }, select: { status: true } });
    if (!existing) {
      await tx.agent.create({ data: { userId, status: "APPLIED", ...fields } });
      return;
    }
    if (existing.status !== "REJECTED") throw new AgentError("You have already applied");
    await tx.agent.update({
      where: { userId },
      data: { ...fields, status: "APPLIED", statusNote: null },
    });
  });
}
