import { redirect } from "next/navigation";

/** Old address: the location now lives on the profile page. */
export default async function LocationPage({ searchParams }: PageProps<"/account/location">) {
  const { next } = await searchParams;
  redirect(typeof next === "string" ? `/account?next=${encodeURIComponent(next)}` : "/account");
}
