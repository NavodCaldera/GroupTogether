import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Role, User } from "@/generated/prisma/client";
import { db } from "../db";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_DAYS = 30;

/** Sri Lankan mobile: 07XXXXXXXX or +947XXXXXXXX, stored as 07XXXXXXXX. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+94/, "0"))
  .pipe(z.string().regex(/^07\d{8}$/, "Enter a mobile number such as 0771234567"));

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: phoneSchema,
  address: z.string().trim().min(5, "Enter your delivery address").max(300),
  city: z.string().trim().min(2, "Enter your city").max(60),
  password: z.string().min(8, "Use at least 8 characters"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export class AuthError extends Error {}

/** Public sign-up creates customers only; admins come from the seed. */
export async function registerUser(input: SignUpInput): Promise<User> {
  const clash = await db.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
  });
  if (clash?.email === input.email)
    throw new AuthError("An account with this email already exists");
  if (clash) throw new AuthError("An account with this mobile number already exists");
  return db.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      city: input.city,
      passwordHash: await hashPassword(input.password),
    },
  });
}

export async function authenticate(email: string, password: string): Promise<User> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Verify against a dummy hash when the user is missing so timing doesn't reveal accounts.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AuthError("Email or password is incorrect");
  if (user.locked) throw new AuthError("This account is locked. Contact support.");
  return user;
}

const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session row and returns the raw token for the cookie. */
export async function startSession(userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function endSession(token: string) {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export type SessionUser = Pick<
  User,
  "id" | "role" | "name" | "email" | "phone" | "address" | "city"
>;

export async function userForToken(token: string, now = new Date()): Promise<SessionUser | null> {
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          role: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          locked: true,
        },
      },
    },
  });
  if (!session || session.expiresAt <= now || session.user.locked) return null;
  const { locked: _locked, ...user } = session.user;
  return user;
}

export function homeFor(role: Role): string {
  return role === "ADMIN" ? "/admin" : "/";
}
