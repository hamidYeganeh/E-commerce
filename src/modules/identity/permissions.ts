export const PERMISSIONS = [
  "catalog.read", "catalog.write", "inventory.read", "inventory.write",
  "orders.read", "orders.process", "orders.cancel", "orders.notes",
  "shipments.write", "payments.read", "payments.refund",
  "customers.read", "customers.write", "wallet.write", "promotions.write", "reports.read", "staff.manage", "settings.write",
] as const;

export type PermissionKey = typeof PERMISSIONS[number];

export const ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  owner: PERMISSIONS,
  orders: ["orders.read", "orders.process", "orders.cancel", "orders.notes", "customers.read", "shipments.write"],
  warehouse: ["catalog.read", "inventory.read", "inventory.write", "orders.read", "shipments.write"],
  finance: ["wallet.write", "orders.read", "payments.read", "payments.refund", "reports.read"],
  content: ["catalog.read", "catalog.write"],
  support: ["orders.read", "orders.notes", "customers.read"],
};
