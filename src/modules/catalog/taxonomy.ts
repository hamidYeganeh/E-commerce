import { DomainError } from "../../shared/domain-error";

export type CategoryNode = { id: string; parentId: string | null };

export function normalizeTagName(value: string): string {
  return value.normalize("NFKC").replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replace(/[\s\u200c\u200d]+/g, " ").trim().toLocaleLowerCase("fa");
}

export function assertCategoryParent(nodes: CategoryNode[], categoryId: string, parentId: string | null) {
  if (parentId === null) return;
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const visited = new Set<string>([categoryId]);
  let current: string | null = parentId;
  while (current !== null) {
    if (visited.has(current)) throw new DomainError("CATEGORY_CYCLE", "Category ancestry must be acyclic");
    if (!parents.has(current)) throw new DomainError("CATEGORY_NOT_FOUND", "Parent category does not exist");
    visited.add(current);
    current = parents.get(current) ?? null;
  }
}
