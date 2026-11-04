// ORZARYN — RBAC (Stage 7). Server-side enforcement is the only enforcement.
export const ROLES = ["OWNER", "ADMIN", "TREASURER", "APPROVER", "OPERATOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "org.manage",
  "members.manage",
  "agents.manage",
  "mandates.manage",
  "treasury.fund",
  "treasury.withdraw",
  "purchases.approve",
  "purchases.propose",
  "evidence.review",
  "workorders.view",
  "finance.view",
  "disputes.open",
  "reports.view",
  "admin.platform",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: [
    "org.manage",
    "members.manage",
    "agents.manage",
    "mandates.manage",
    "purchases.approve",
    "evidence.review",
    "workorders.view",
    "finance.view",
    "disputes.open",
    "reports.view",
  ],
  TREASURER: ["treasury.fund", "treasury.withdraw", "workorders.view", "finance.view", "reports.view"],
  APPROVER: ["purchases.approve", "evidence.review", "workorders.view", "finance.view", "disputes.open"],
  OPERATOR: ["purchases.propose", "workorders.view", "reports.view"],
  VIEWER: ["workorders.view", "reports.view"],
};

export function roleHas(role: string, permission: Permission): boolean {
  return (MATRIX[role as Role] ?? []).includes(permission);
}

export function permissionsOf(role: string): Permission[] {
  return MATRIX[role as Role] ?? [];
}
