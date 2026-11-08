import { redirect } from "next/navigation";

/** The buyer home moved to `/`; old links and sign-in landings go there. */
export default function DashboardPage() {
  redirect("/");
}
