import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SignInForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <h1 className="mb-4 text-2xl font-semibold">Sign in</h1>
      <Card>
        <SignInForm next={nextPath} />
      </Card>
      <p className="mt-4 text-center text-sm text-subtle">
        New here?{" "}
        <Link
          href={nextPath ? `/sign-up?next=${encodeURIComponent(nextPath)}` : "/sign-up"}
          className="font-medium text-accent underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
