import { redirect } from "next/navigation";

/** The own-basket list moved into the Orders tabs (owner, 2026-11-21); old links land there. */
export default function OwnBasketsPage() {
  redirect("/orders?tab=mine");
}
