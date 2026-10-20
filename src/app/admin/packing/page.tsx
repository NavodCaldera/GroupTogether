import { redirect } from "next/navigation";

/** Packing and Deliveries became Admin → Orders (product owner, 2026-10-21). */
export default function AdminPackingPage() {
  redirect("/admin/orders?stage=in-store");
}
