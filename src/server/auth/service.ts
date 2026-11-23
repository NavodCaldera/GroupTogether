import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { User } from "@/generated/prisma/client";
import { pinFields, pinInSriLanka, pinOutsideMessage } from "@/lib/location";
import { db } from "../db";
import { hashPassword, verifyPassword } from "./password";

const SESSION_TTL_DAYS = 30;

/** Sri Lankan mobile: 07XXXXXXXX or +947XXXXXXXX, stored as 07XXXXXXXX. */
const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+94/, "0"))
  .pipe(z.string().regex(/^07\d{8}$/, "Enter a mobile number such as 0771234567"));

const profileFields = {
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: phoneSchema,
  address: z.string().trim().min(5, "Enter your delivery address").max(300),
  city: z.string().trim().min(2, "Enter your city").max(60),
  ...pinFields,
};

export const profileSchema = z.object(profileFields).refine(pinInSriLanka, pinOutsideMessage);

export const signUpSchema = z
  .object({
    ...profileFields,
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
    password: z.string().min(8, "Use at least 8 characters"),
  })
  .refine(pinInSriLanka, pinOutsideMessage);

export class AuthError extends Error {}

export async function registerUser(input: z.infer<typeof signUpSchema>): Promise<User> {
  const clash = await db.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
  });
  if (clash?.email === input.email)
    throw new AuthError("An account with this email already exists");
  if (clash) throw new AuthError("An account with this mobile number already exists");
  const { password, ...data } = input;
  return db.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
}

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  const clash = await db.user.findFirst({
    where: { phone: input.phone, id: { not: userId } },
    select: { id: true },
  });
  if (clash) throw new AuthError("Another account uses this mobile number");
  await db.user.update({ where: { id: userId }, data: input });
}

const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** Five wrong passwords lock the email for 10 minutes; unknown emails count the same way. */
export async function authenticate(
  email: string,
  password: string,
  now = new Date(),
): Promise<User> {
  email = email.trim().toLowerCase();
  const attempt = await db.loginAttempt.findUnique({ where: { email } });
  if (attempt?.lockedUntil && attempt.lockedUntil > now)
    throw new AuthError("Too many sign-in attempts. Try again in 10 minutes.");
  const user = await db.user.findUnique({ where: { email } });
  if (!(await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)) || !user) {
    const lockedUntil = new Date(now.getTime() + 10 * 60_000);
    await db.$executeRaw`
      INSERT INTO "LoginAttempt" ("email", "failures", "lockedUntil", "updatedAt")
      VALUES (${email}, 1, NULL, ${now})
      ON CONFLICT ("email") DO UPDATE SET
        "failures" = CASE
          WHEN "LoginAttempt"."lockedUntil" IS NOT NULL AND "LoginAttempt"."lockedUntil" <= ${now}
            THEN 1 ELSE "LoginAttempt"."failures" + 1 END,
        "lockedUntil" = CASE
          WHEN "LoginAttempt"."lockedUntil" > ${now} THEN "LoginAttempt"."lockedUntil"
          WHEN "LoginAttempt"."lockedUntil" IS NOT NULL AND "LoginAttempt"."lockedUntil" <= ${now}
            THEN NULL
          WHEN "LoginAttempt"."failures" + 1 >= 5 THEN ${lockedUntil}::timestamp
          ELSE NULL END,
        "updatedAt" = ${now}`;
    throw new AuthError("Email or password is incorrect");
  }
  await db.loginAttempt.deleteMany({ where: { email } });
  return user;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

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

const sessionUser = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  lat: true,
  lng: true,
  companyId: true,
} as const;

export type SessionUser = Pick<User, keyof typeof sessionUser>;

export async function userForToken(token: string, now = new Date()): Promise<SessionUser | null> {
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    select: { expiresAt: true, user: { select: sessionUser } },
  });
  return session && session.expiresAt > now ? session.user : null;
}
