import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SignUpForm } from "../auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <h1 className="mb-1 text-2xl font-semibold">Create your account</h1>
      <p className="mb-4 text-sm text-subtle">Free. Join a cart or start your own.</p>
      <Card>
        <SignUpForm next={nextPath} />
      </Card>
      <p className="mt-4 text-center text-sm text-subtle">
        Already have an account?{" "}
        <Link
          href={nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in"}
          className="font-medium text-accent underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
