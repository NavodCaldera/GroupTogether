import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/session";
import { BuyerReturns } from "../../buyer-returns";

export const metadata: Metadata = { title: "Buyer returns" };

export default async function AgentsBuyerReturnsPage() {
  const admin = await requireAdmin("AGENTS");
  return <BuyerReturns adminId={admin.id} decide />;
}
