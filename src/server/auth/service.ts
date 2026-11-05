import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Role, User } from "@/generated/prisma/client";
import { adminHome, canAdminArea, type OperationalAdminArea } from "@/lib/admin-access";
import { linkOnSite } from "@/lib/brand-rules";
import { pinFields, pinInSriLanka, pinOutsideMessage } from "@/lib/location";
import { db } from "../db";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_DAYS = 30;

/** Sri Lankan mobile: 07XXXXXXXX or +947XXXXXXXX, stored as 07XXXXXXXX. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+94/, "0"))
  .pipe(z.string().regex(/^07\d{8}$/, "Enter a mobile number such as 0771234567"));

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name"),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
    phone: phoneSchema,
    address: z.string().trim().min(5, "Enter your delivery address").max(300),
    city: z.string().trim().min(2, "Enter your city").max(60),
    ...pinFields,
    password: z.string().min(8, "Use at least 8 characters"),
  })
  .refine(pinInSriLanka, pinOutsideMessage);

export type SignUpInput = z.infer<typeof signUpSchema>;

/** The buyer's own profile: who they are and where PickMe drops their orders. */
export const profileSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(80),
    phone: phoneSchema,
    address: z.string().trim().min(5, "Enter your delivery address").max(300),
    city: z.string().trim().min(2, "Enter your city").max(60),
    ...pinFields,
  })
  .refine(pinInSriLanka, pinOutsideMessage);

export type ProfileInput = z.infer<typeof profileSchema>;

export class AuthError extends Error {}

const sellerFields = z.object({
  name: z.string().trim().min(2, "Enter the contact person's name"),
  company: z.string().trim().min(2, "Enter the factory or company name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: phoneSchema,
  password: z.string().min(8, "Use at least 8 characters"),
  // A luxury brand (2026-10-24): its products link to its own website.
  isBrand: z
    .preprocess((v) => v === true || v === "on" || v === "true", z.boolean())
    .default(false),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
});

export const sellerSchema = sellerFields.refine(
  (v) => !v.isBrand || (!!v.website && linkOnSite(v.website, null)),
  {
    message: "Enter the brand's website, such as https://www.brand.lk",
    path: ["website"],
  },
);

/** Admins create factory seller accounts; sellers can't sign themselves up. */
export async function createSeller(input: unknown): Promise<User> {
  const s = sellerSchema.parse(input);
  const clash = await db.user.findFirst({
    where: { OR: [{ email: s.email }, { phone: s.phone }] },
  });
  if (clash?.email === s.email) throw new AuthError("An account with this email already exists");
  if (clash) throw new AuthError("An account with this mobile number already exists");
  return db.user.create({
    data: {
      role: "SELLER",
      name: s.name,
      company: s.company,
      email: s.email,
      phone: s.phone,
      passwordHash: await hashPassword(s.password),
      isBrand: s.isBrand,
      website: s.isBrand ? s.website : null,
    },
  });
}

export const packerSchema = sellerFields
  .omit({ company: true, isBrand: true, website: true })
  .extend({
    name: z.string().trim().min(2, "Enter their name").max(80),
  });

/** Admins create packing staff accounts (CLAUDE.md rule 17). */
export async function createPacker(input: unknown): Promise<User> {
  const s = packerSchema.parse(input);
  const clash = await db.user.findFirst({
    where: { OR: [{ email: s.email }, { phone: s.phone }] },
  });
  if (clash?.email === s.email) throw new AuthError("An account with this email already exists");
  if (clash) throw new AuthError("An account with this mobile number already exists");
  return db.user.create({
    data: {
      role: "PACKER",
      name: s.name,
      email: s.email,
      phone: s.phone,
      passwordHash: await hashPassword(s.password),
    },
  });
}

/**
 * Public sign-up creates customers only; admins come from the seed, and sellers and packing
 * staff from an admin.
 */
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
      lat: input.lat,
      lng: input.lng,
      passwordHash: await hashPassword(input.password),
    },
  });
}

export async function updateProfile(userId: string, input: ProfileInput) {
  const clash = await db.user.findFirst({
    where: { phone: input.phone, id: { not: userId } },
    select: { id: true },
  });
  if (clash) throw new AuthError("Another account uses this mobile number");
  await db.user.update({ where: { id: userId }, data: input });
}

const LOGIN_LOCKOUT_MESSAGE = "Too many sign-in attempts. Try again in 10 minutes.";

export async function authenticate(
  email: string,
  password: string,
  now = new Date(),
): Promise<User> {
  email = email.trim().toLowerCase();
  const attempt = await db.loginAttempt.findUnique({ where: { email } });
  if (attempt?.lockedUntil && attempt.lockedUntil > now) {
    throw new AuthError(LOGIN_LOCKOUT_MESSAGE);
  }

  const user = await db.user.findUnique({ where: { email } });
  // No transaction or pooled connection is held during password verification.
  // Attempts past the lock check when the fifth failure lands may finish checking:
  // a burst can make extra guesses, but failure counts stay exact and the lock applies.
  // Unknown emails still pay the hashing cost and accrue the same failures.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
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
  if (user.locked) throw new AuthError("This account is locked. Contact support.");
  await db.loginAttempt.deleteMany({ where: { email } });
  return user;
}
/**
 * Admin control: a locked customer can't sign in, and locking ends all their sessions at once.
 * Their carts are left as they are (an admin can cancel them separately). Admins can't be locked.
 */
export async function setUserLocked(userId: string, locked: boolean) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw new AuthError("User not found");
  if (user.role === "ADMIN") throw new AuthError("Admin accounts can't be locked");
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { locked } }),
    ...(locked ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);
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
  "id" | "role" | "adminArea" | "name" | "email" | "phone" | "address" | "city" | "lat" | "lng"
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
          adminArea: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          lat: true,
          lng: true,
          locked: true,
        },
      },
    },
  });
  if (!session || session.expiresAt <= now || session.user.locked) return null;
  const { locked: _locked, ...user } = session.user;
  return user;
}

export function homeFor(role: Role, adminArea?: string | null): string {
  if (role === "ADMIN") return adminHome(adminArea);
  if (role === "SELLER") return "/seller";
  if (role === "PACKER") return "/packing";
  return "/dashboard";
}

/** Resolve the principal from storage before enforcing an operational boundary. */
export async function assertAdminArea(id: string, area: OperationalAdminArea) {
  const user = await db.user.findUnique({
    where: { id },
    select: { role: true, adminArea: true, locked: true },
  });
  if (!canAdminArea(user, area))
    throw new AuthError("This admin workspace is unavailable to your account");
}

export async function createOperationalAdmin(input: unknown): Promise<User> {
  const data = packerSchema
    .extend({ adminArea: z.enum(["PREMIUM", "FACTORY", "WAREHOUSE", "CORE"]) })
    .parse(input);
  if (await db.user.count({ where: { OR: [{ email: data.email }, { phone: data.phone }] } }))
    throw new AuthError("An account with this email or mobile number already exists");
  const { password, ...fields } = data;
  return db.user.create({
    data: { ...fields, role: "ADMIN", passwordHash: await hashPassword(password) },
  });
}
