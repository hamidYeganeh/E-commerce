-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "reorderTarget" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "unitCostRial" BIGINT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftMessage" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitCostRial" BIGINT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "destination" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "returnId" TEXT;

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "cancellation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "payloadHash" TEXT,
ADD COLUMN     "refundLimitRial" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "customerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "templateValues" JSONB;

-- CreateTable
CREATE TABLE "StaffInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'INVITE',
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "unitCostRial" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemLot" (
    "orderItemId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItemLot_pkey" PRIMARY KEY ("orderItemId","lotId")
);

-- CreateTable
CREATE TABLE "RedirectRule" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "permanent" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedirectRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvitation_email_expiresAt_idx" ON "StaffInvitation"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_userId_productId_key" ON "ProductReview"("userId", "productId");

-- CreateIndex
CREATE INDEX "InventoryLot_variantId_batchId_idx" ON "InventoryLot"("variantId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "RedirectRule_source_key" ON "RedirectRule"("source");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_key_key" ON "ReturnRequest"("key");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
