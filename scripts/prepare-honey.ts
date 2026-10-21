// Explicit initial catalog setup. Never assigns unapproved inventory.
import { readFile } from "node:fs/promises";
import { getDatabase, disconnectDatabase } from "../src/infrastructure/database/client";
import { uploadImage } from "../src/infrastructure/media/store";
async function main() {
const db = getDatabase();
try {
  const product = await db.product.findUniqueOrThrow({ where: { slug: "dr-biz-honey-900g" }, include: { media: true } });
  const image = product.media.length ? null : await uploadImage(await readFile("public/images/vitaboost/dr-biz-honey.png"));
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(140017,1)`;
    await tx.productVariant.update({ where: { sku: "DRBIZ-HONEY-900" }, data: { priceRial: 1000000n, isActive: true, version: { increment: 1 } } });
    const stock = await tx.stock.findUniqueOrThrow({ where: { variantId: (await tx.productVariant.findUniqueOrThrow({ where: { sku: "DRBIZ-HONEY-900" } })).id } });
    const previous = await tx.stockMovement.findUnique({ where: { eventKey: "initial-honey-50-approved" } });
    if (!previous) {
      await tx.stock.update({ where: { variantId: stock.variantId }, data: { onHand: 50, version: { increment: 1 } } });
      await tx.stockMovement.create({ data: { variantId: stock.variantId, type: "RECEIPT", quantity: 50 - stock.onHand, eventKey: "initial-honey-50-approved", reason: "موجودی اولیهٔ تأییدشده" } });
    }
    if (image) await tx.productMedia.create({ data: { productId: product.id, objectKey: image.objectKey, alt: "عسل طبیعی دکتر بیز ۹۰۰ گرمی، بسته‌بندی اصلی با درِ زرد" } });
    await tx.product.update({ where: { id: product.id }, data: { status: "ACTIVE", name: "عسل طبیعی دکتر بیز ۹۰۰ گرمی", description: "عسل طبیعی دکتر بیز در بسته‌بندی ۹۰۰ گرمی با درِ زرد. برای همراهی با نان تازه، صبحانه و دستورهای خانگی؛ پیش از مصرف، اطلاعات روی بسته‌بندی را بخوانید.", version: { increment: 1 } } });
    await tx.auditLog.create({ data: { action: "catalog.initial-price-approved", entityType: "Product", entityId: product.id, changes: { priceRial: "1000000", inventoryAssigned: 50 } } });
  });
  console.info("Honey published at the approved price; initial inventory assigned once.");
} finally { await disconnectDatabase(); }

}
main().catch(() => { console.error("Catalog setup failed."); process.exitCode = 1; });
