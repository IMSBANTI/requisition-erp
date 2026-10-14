/** All permission keys. Roles are lists of these; Admin can edit them in /admin/roles. */
export const PERMISSIONS = {
  REQ_CREATE: "req.create",
  REQ_VIEW_ALL: "req.view.all",
  REQ_VIEW_COMPANY: "req.view.company", // companies in user's company scope
  REQ_VIEW_PROJECT: "req.view.project", // projects in user's project scope
  REQ_VIEW_DEPARTMENT: "req.view.department",
  REQ_APPROVE: "req.approve", // can sign as head / checker
  REQ_APPROVE_IT: "req.approve.it", // AI / IT requisition checker
  REQ_ACCOUNTS_CHECK: "req.accounts.check", // "Checked by Accounts"
  REQ_DIRECTOR: "req.director",
  REQ_MD: "req.md",
  REQ_FORWARD: "req.forward", // Accounts Manager forwards to executive
  REQ_EXECUTE: "req.execute",
  REQ_MANUAL_ENTRY: "req.manual",
  PROJECT_MANAGE: "project.manage",
  REPORT_VIEW: "report.view",
  REPORT_DOWNLOAD: "report.download",
  ADMIN_USERS: "admin.users", // full admin (add/edit/delete users, roles, masters, passwords)
  ADMIN_READONLY: "admin.readonly", // HR — view everything in admin, change nothing
  GRANT_VIEW: "grant.view", // Director/MD can grant read-all to Accounts Executives
  AUDIT_VIEW: "audit.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "req.create": "Create requisition",
  "req.view.all": "View all requisitions",
  "req.view.company": "View requisitions of own companies",
  "req.view.project": "View requisitions of own projects",
  "req.view.department": "View requisitions of own department",
  "req.approve": "Sign as Head / Checker",
  "req.approve.it": "Approve AI / IT requisitions",
  "req.accounts.check": "Checked by Accounts",
  "req.director": "Director approval",
  "req.md": "Managing Director approval",
  "req.forward": "Forward to Accounts Executive",
  "req.execute": "Execute / disburse",
  "req.manual": "Enter manual (paper) requisitions",
  "project.manage": "Create / edit projects",
  "report.view": "View reports & analysis",
  "report.download": "Download reports",
  "admin.users": "Full admin (users, roles, masters)",
  "admin.readonly": "Admin read-only",
  "grant.view": "Grant view access to Accounts",
  "audit.view": "View audit log",
};

export const CATEGORIES = [
  { key: "IMS_OUTSOURCING_STUDIO", label: "IMS / Outsourcing / Studio" },
  { key: "BUSINESS_DEVELOPMENT", label: "Business Development" },
  { key: "OPERATIONS_EVENT", label: "Operations & Events" },
  { key: "AI_IT", label: "AI / IT" },
  { key: "GENERAL", label: "General" },
] as const;

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_HEAD: "Pending – Checked by (Head)",
  PENDING_CHECKER: "Pending – Checked by",
  PENDING_ACCOUNTS: "Pending – Accounts",
  PENDING_DIRECTOR: "Pending – Director",
  PENDING_MD: "Pending – Managing Director",
  APPROVED: "Approved – awaiting Accounts",
  FORWARDED: "Forwarded to Accounts Executive",
  EXECUTED: "Executed",
  RETURNED: "Returned for correction",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_HEAD: "bg-amber-100 text-amber-800",
  PENDING_CHECKER: "bg-amber-100 text-amber-800",
  PENDING_ACCOUNTS: "bg-amber-100 text-amber-800",
  PENDING_DIRECTOR: "bg-amber-100 text-amber-800",
  PENDING_MD: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  FORWARDED: "bg-blue-100 text-blue-800",
  EXECUTED: "bg-green-100 text-green-800",
  RETURNED: "bg-orange-100 text-orange-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-200 text-gray-600",
};
