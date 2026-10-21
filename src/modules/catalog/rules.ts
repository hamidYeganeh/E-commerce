import { DomainError } from "../../shared/domain-error";
import type { AttributeDefinition, AttributeValueInput, CategoryRule, ProductInput } from "./contracts";

export function canonicalNumber(value: string) {
  value = value.replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632))).replace(/٫/g, ".");
  if (!/^-?\d{1,12}(\.\d{1,6})?$/.test(value)) return value;
  const negative = value.startsWith("-");
  const [integer, decimal = ""] = value.replace(/^-/, "").split(".");
  const whole = integer.replace(/^0+(?=\d)/, "");
  const fraction = decimal.replace(/0+$/, "");
  return `${negative && (whole !== "0" || fraction) ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
export function normalizeValues(values: AttributeValueInput[], definitions: AttributeDefinition[]) {
  return values.map((entry) => ({ ...entry, value: definitions.find((d) => d.id === entry.attributeId)?.type === "NUMBER" ? canonicalNumber(entry.value) : entry.value }));
}

export function categoryAncestors(ids: string[], nodes: { id: string; parentId: string | null }[]) {
  const map = new Map(nodes.map((n) => [n.id, n.parentId]));
  const all = new Set<string>();
  for (const id of ids) {
    let current: string | null = id;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) throw new DomainError("CATEGORY_CYCLE", "دسته‌بندی دور دارد.");
      if (!map.has(current)) throw new DomainError("INVALID_REFERENCE", "دسته‌بندی پیدا نشد.");
      all.add(current); seen.add(current); current = map.get(current) ?? null;
    }
  }
  return [...all];
}
export function effectiveRules(ids: string[], nodes: { id: string; parentId: string | null }[], rules: CategoryRule[]) {
  const ancestors = new Set(categoryAncestors(ids, nodes));
  const merged = new Map<string, CategoryRule>();
  for (const rule of rules.filter((r) => ancestors.has(r.categoryId))) {
    const prev = merged.get(rule.attributeId);
    if (prev && prev.isVariant !== rule.isVariant) throw new DomainError("ATTRIBUTE_SCOPE_CONFLICT", "یک ویژگی نمی‌تواند هم مشخصهٔ محصول و هم مشخصهٔ تنوع باشد.");
    merged.set(rule.attributeId, { ...rule, isRequired: rule.isRequired || !!prev?.isRequired, isFilterable: rule.isFilterable || !!prev?.isFilterable });
  }
  return [...merged.values()];
}
export function validateValues(values: AttributeValueInput[], definitions: AttributeDefinition[], rules: CategoryRule[], variant: boolean, required: boolean) {
  if (new Set(values.map((v) => v.attributeId)).size !== values.length) throw new DomainError("DUPLICATE_ATTRIBUTE", "ویژگی تکراری است.");
  const allowed = rules.filter((r) => r.isVariant === variant);
  for (const entry of values) {
    const def = definitions.find((a) => a.id === entry.attributeId);
    if (!def || !allowed.some((r) => r.attributeId === def.id)) throw new DomainError("INVALID_ATTRIBUTE", "ویژگی با دسته‌بندی یا سطح محصول مطابقت ندارد.");
    if (def.type === "SELECT" && !def.options.some((o) => o.id === entry.value)) throw new DomainError("INVALID_ATTRIBUTE", `گزینهٔ ${def.name} معتبر نیست.`);
    if (def.type === "NUMBER" && (!/^-?\d{1,12}(\.\d{1,6})?$/.test(entry.value) || !Number.isFinite(Number(entry.value)))) throw new DomainError("INVALID_ATTRIBUTE", `${def.name} باید عدد باشد.`);
    if (def.type === "BOOLEAN" && !["true", "false"].includes(entry.value)) throw new DomainError("INVALID_ATTRIBUTE", `${def.name} باید بله یا خیر باشد.`);
  }
  if (required) for (const rule of allowed.filter((r) => r.isRequired)) {
    if (!values.some((v) => v.attributeId === rule.attributeId)) throw new DomainError("REQUIRED_ATTRIBUTE", "ویژگی‌های اجباری دسته‌بندی را تکمیل کنید.");
  }
}
export function validateProduct(input: ProductInput, categories: { id: string; parentId: string | null; isActive: boolean }[], definitions: AttributeDefinition[], assignments: CategoryRule[]) {
  if (new Set(input.categoryIds).size !== input.categoryIds.length || new Set(input.tagIds).size !== input.tagIds.length) throw new DomainError("DUPLICATE_REFERENCE", "دسته‌بندی یا تگ تکراری است.");
  if (input.primaryCategoryId && !input.categoryIds.includes(input.primaryCategoryId)) throw new DomainError("PRIMARY_CATEGORY", "دسته‌بندی اصلی باید جزو دسته‌بندی‌های محصول باشد.");
  const rules = effectiveRules(input.categoryIds, categories, assignments);
  const published = input.status === "ACTIVE";
  if (input.variants.some((v) => v.isActive && BigInt(v.priceRial) <= 0n)) throw new DomainError("INVALID_PRICE", "قیمت تنوع فعال باید بیشتر از صفر باشد.");
  validateValues(input.attributes, definitions, rules, false, published);
  for (const variant of input.variants) {
    validateValues(variant.attributes, definitions, rules, true, published && variant.isActive);
    const weightId = definitions.find((d) => d.key === "net-weight")?.id;
    const weight = variant.attributes.find((v) => v.attributeId === weightId);
    if (weight && (!Number.isInteger(Number(weight.value)) || Number(weight.value) <= 0 || Number(weight.value) !== variant.netWeightGrams)) throw new DomainError("MISMATCHED_WEIGHT", "ویژگی وزن خالص باید با وزن تنوع به گرم برابر باشد.");
  }
  if (new Set(input.variants.map((v) => v.sku)).size !== input.variants.length) throw new DomainError("DUPLICATE_SKU", "کدهای تنوع محصول باید یکتا باشند.");
  const ids = input.variants.flatMap((v) => v.id ? [v.id] : []);
  if (new Set(ids).size !== ids.length) throw new DomainError("INVALID_VARIANT", "تنوع تکراری است.");
  if (new Set(input.media.map((m) => m.objectKey)).size !== input.media.length) throw new DomainError("DUPLICATE_MEDIA", "تصویر تکراری است.");
  if (!published) return;
  if (!input.primaryCategoryId || !input.description || !input.media.length || !input.variants.some((v) => v.isActive)) throw new DomainError("PUBLICATION_INCOMPLETE", "برای انتشار، توضیحات، دسته‌بندی اصلی، تصویر و حداقل یک تنوع فعال لازم است.");
  const ancestors = categoryAncestors(input.categoryIds, categories);
  if (categories.some((c) => ancestors.includes(c.id) && !c.isActive)) throw new DomainError("INACTIVE_CATEGORY", "دسته‌بندی محصول و والدهای آن باید فعال باشند.");
  if (rules.some((r) => r.isVariant)) {
    const keys = input.variants.filter((v) => v.isActive).map((v) => normalizeValues(v.attributes, definitions).sort((a, b) => a.attributeId.localeCompare(b.attributeId)).map((a) => `${a.attributeId}:${a.value}`).join("|"));
    if (new Set(keys).size !== keys.length) throw new DomainError("DUPLICATE_VARIANT", "ترکیب ویژگی‌های تنوع‌های فعال باید متفاوت باشد.");
  }
}
