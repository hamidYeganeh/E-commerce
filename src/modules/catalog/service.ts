import type { PrismaClient } from "../../generated/prisma/client";
import { saveTaxonomy } from "./management";
import { DomainError } from "../../shared/domain-error";

export async function createCategory(db: PrismaClient, actorId: string, input: unknown) {
  const result = await saveTaxonomy(db, actorId, "categories", null, input);
  return db.category.findUniqueOrThrow({ where: { id: result.id } });
}
export async function moveCategory(db: PrismaClient, actorId: string, id: string, parentId: string | null) {
  const category = await db.category.findUnique({ where: { id }, include: { attributes: true } });
  if (!category) throw new DomainError("NOT_FOUND", "دسته‌بندی پیدا نشد.");
  await saveTaxonomy(db, actorId, "categories", id, { ...category, description: category.description ?? "", seoTitle: category.seoTitle ?? "", seoDescription: category.seoDescription ?? "", parentId });
  return db.category.findUniqueOrThrow({ where: { id } });
}
export async function createTag(db: PrismaClient, actorId: string, input: unknown) {
  const result = await saveTaxonomy(db, actorId, "tags", null, input);
  return db.tag.findUniqueOrThrow({ where: { id: result.id } });
}
