CREATE TABLE "FactoryActivation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "FactoryActivation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FactoryActivation_userId_idx" ON "FactoryActivation"("userId");
ALTER TABLE "FactoryActivation" ADD CONSTRAINT "FactoryActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryActivation" ADD CONSTRAINT "FactoryActivation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve only invalidated activation history for owners demonstrably created by approval.
-- Authenticated legacy applicants existed BEFORE their application and are excluded.
-- This lets admins reissue a secure link for historical new applicants without enabling old links.
INSERT INTO "FactoryActivation" ("id", "userId", "createdById", "createdAt", "expiresAt", "usedAt")
SELECT DISTINCT ON (s."id") s."id", s."userId", a."reviewerId", s."createdAt", s."expiresAt", CURRENT_TIMESTAMP
FROM "Session" s
JOIN "Notification" n ON n."userId" = s."userId"
  AND starts_with(n."href", '/factories/sign-in/partner_')
  AND s."id" = encode(sha256(convert_to(substr(n."href", length('/factories/sign-in/') + 1), 'UTF8')), 'hex')
JOIN "User" u ON u."id" = s."userId"
JOIN "FactoryApplication" a ON a."factoryUserId" = u."id"
WHERE a."status" = 'APPROVED' AND a."reviewerId" IS NOT NULL
  AND u."role" = 'SELLER' AND u."isBrand" = false AND u."factoryId" IS NULL
  AND u."createdAt" > a."createdAt"
ORDER BY s."id", a."createdAt";

-- An exact SHA-256 match to a token-bearing approval notice identifies an unredeemed
-- approval session, including legacy-owner links. Ordinary session tokens never appear here.
DELETE FROM "Session" s USING "Notification" n
WHERE n."userId" = s."userId" AND starts_with(n."href", '/factories/sign-in/')
  AND s."id" = encode(sha256(convert_to(substr(n."href", length('/factories/sign-in/') + 1), 'UTF8')), 'hex');

UPDATE "Notification" SET "href" = '/sign-in'
WHERE starts_with("href", '/factories/sign-in/');
