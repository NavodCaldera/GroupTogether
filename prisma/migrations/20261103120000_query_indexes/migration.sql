-- CreateIndex
CREATE INDEX "CartLine_variantId_idx" ON "CartLine"("variantId");

-- CreateIndex
CREATE INDEX "CartLine_userId_idx" ON "CartLine"("userId");

-- CreateIndex
CREATE INDEX "CartInvite_invitedUserId_idx" ON "CartInvite"("invitedUserId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
