ALTER TABLE "ReturnRequest" ADD COLUMN "factoryNote" TEXT;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_factoryNote_check"
  CHECK ("factoryNote" IS NULL OR char_length(btrim("factoryNote")) BETWEEN 1 AND 1000);

CREATE TABLE "ReturnMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "returnId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnMessage_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 1000),
  CONSTRAINT "ReturnMessage_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReturnMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReturnMessage_returnId_createdAt_idx" ON "ReturnMessage"("returnId", "createdAt");
CREATE INDEX "ReturnMessage_authorId_createdAt_idx" ON "ReturnMessage"("authorId", "createdAt");

-- Old factory refusals were appealable, not final admin decisions. Hand them to admins.
WITH migrated AS (
  UPDATE "ReturnRequest" SET status='WITH_ADMIN', "escalatedAt"=COALESCE("escalatedAt", timezone('UTC',now()))
  WHERE status='REJECTED' AND "adminDecision" IS NULL
  RETURNING id, "buyerId", "cartLineId"
)
INSERT INTO "ReturnNotice" (id,"returnId","userId",title,href)
SELECT m.id || ':automatic-review-migration:' || u.id, m.id, u.id,
  'Return needs review', '/admin/factory/returns/' || m.id
FROM migrated m CROSS JOIN "User" u
WHERE u.role='ADMIN' AND u."adminArea" IN ('FACTORY','CORE') AND NOT u.locked
UNION ALL
SELECT m.id || ':automatic-review-migration:' || m."buyerId", m.id, m."buyerId",
  'Return sent to admin', '/c/' || c.code
FROM migrated m JOIN "CartLine" l ON l.id=m."cartLineId" JOIN "GroupCart" c ON c.id=l."cartId";
