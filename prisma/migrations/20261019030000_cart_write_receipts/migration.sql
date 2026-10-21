CREATE TABLE "CartWriteReceipt" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "activityVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CartWriteReceipt_pkey" PRIMARY KEY ("userId", "key"),
    CONSTRAINT "CartWriteReceipt_activityVersion_check" CHECK ("activityVersion" >= 0),
    CONSTRAINT "CartWriteReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CartWriteReceipt_createdAt_idx" ON "CartWriteReceipt"("createdAt");
