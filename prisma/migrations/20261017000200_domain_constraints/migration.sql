-- These invariants cannot be fully represented in Prisma's schema DSL.
CREATE UNIQUE INDEX "ProductCategory_one_primary" ON "ProductCategory" ("productId") WHERE "isPrimary";
CREATE UNIQUE INDEX "Cart_one_per_user" ON "Cart" ("userId") WHERE "userId" IS NOT NULL;

ALTER TABLE "Category" ADD CONSTRAINT "Category_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_valid_quantities" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");
ALTER TABLE "ProductVariant" ADD CONSTRAINT "Variant_valid_price_weight" CHECK (
  "priceRial" >= 0 AND (NOT "isActive" OR "priceRial" > 0)
  AND ("netWeightGrams" IS NULL OR "netWeightGrams" > 0)
  AND ("shippingWeightGrams" IS NULL OR "shippingWeightGrams" > 0)
);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_valid_quantity_cost" CHECK (
  "quantity" <> 0 AND ("unitCostRial" IS NULL OR "unitCostRial" >= 0)
  AND ("type" NOT IN ('SALE', 'DAMAGE') OR "quantity" < 0)
  AND ("type" NOT IN ('RECEIPT', 'RETURN') OR "quantity" > 0)
);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_valid_dates" CHECK ("producedAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" > "producedAt");
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_exactly_one_owner" CHECK (("userId" IS NOT NULL) <> ("guestTokenHash" IS NOT NULL));
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_positive_quantity" CHECK ("quantity" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_valid_amounts" CHECK (
  "currency" = 'IRR' AND "subtotalRial" >= 0 AND "discountRial" >= 0
  AND "discountRial" <= "subtotalRial" AND "shippingRial" >= 0
  AND "totalRial" = "subtotalRial" - "discountRial" + "shippingRial"
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_valid_amounts" CHECK (
  "quantity" > 0 AND "unitPriceRial" >= 0 AND "discountRial" >= 0
  AND "totalRial" = "unitPriceRial" * "quantity" - "discountRial" AND "totalRial" >= 0
);
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_positive_quantity" CHECK ("quantity" > 0);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "Payment_positive_amount" CHECK ("amountRial" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_positive_amount" CHECK ("amountRial" > 0);
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_positive_quantity" CHECK ("quantity" > 0);
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_positive_quantity" CHECK ("quantity" > 0);
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttribute_exactly_one_value" CHECK (
  ("optionId" IS NOT NULL) <> ("value" IS NOT NULL) AND ("value" IS NULL OR length(trim("value")) > 0)
);
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttribute_exactly_one_value" CHECK (
  ("optionId" IS NOT NULL) <> ("value" IS NOT NULL) AND ("value" IS NULL OR length(trim("value")) > 0)
);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_valid_rules" CHECK (
  "expiresAt" > "startsAt" AND "minimumRial" >= 0 AND "perUserLimit" > 0
  AND ("usageLimit" IS NULL OR "usageLimit" > 0)
  AND ("maxDiscountRial" IS NULL OR "maxDiscountRial" > 0)
  AND (
    ("type" = 'PERCENTAGE' AND "percentage" IS NOT NULL AND "percentage" BETWEEN 1 AND 100 AND "amountRial" IS NULL)
    OR ("type" = 'FIXED' AND "amountRial" IS NOT NULL AND "amountRial" > 0 AND "percentage" IS NULL)
  )
);
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "Outbox_valid_attempts" CHECK ("attempts" >= 0);
