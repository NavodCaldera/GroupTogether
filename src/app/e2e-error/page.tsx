import { notFound } from "next/navigation";
import { connection } from "next/server";

// Browser-test fixture for the error boundary. Exists only in e2e builds.
export default async function E2eErrorPage() {
  await connection();
  if (process.env.GROUPBASKET_E2E !== "1") notFound();
  throw new Error("e2e boundary check");
}
