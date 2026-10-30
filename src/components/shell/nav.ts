import {
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  Library,
  Settings,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/domain/rbac";

export type NavItem = {
  href: string;
  /** key in messages "nav" namespace */
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** Milestone that ships it; shown as "Soon" until then */
  soon?: boolean;
};

/** Sidebar navigation. Items the user lacks permission for are hidden. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/instruments", label: "instruments", icon: Gauge, permission: "instrument.view" },
  { href: "/due", label: "duePlanning", icon: CalendarClock, permission: "calibration.request" },
  { href: "/requests", label: "calibration", icon: ClipboardList, permission: "calibration.request" },
  { href: "/purchase", label: "purchase", icon: ShoppingCart, permission: "po.manage" },
  { href: "/dispatch", label: "dispatch", icon: Truck, permission: "dispatch.manage" },
  { href: "/verification", label: "verification", icon: ClipboardCheck, permission: "certificate.verify" },
  { href: "/vendors", label: "vendors", icon: Building2, permission: "vendor.view" },
  { href: "/reports", label: "reports", icon: BarChart3, permission: "report.view" },
  { href: "/masters", label: "masters", icon: Library, permission: "masters.manage" },
  { href: "/settings", label: "settings", icon: Settings, permission: "audit.view" },
];

export const SETTINGS_ITEMS = [
  { href: "/settings/organization", label: "organization", permission: "org.manage" },
  { href: "/settings/plants", label: "plants", permission: "plant.manage" },
  { href: "/settings/users", label: "users", permission: "user.manage" },
  { href: "/settings/audit-log", label: "auditLog", permission: "audit.view" },
] as const satisfies readonly { href: string; label: string; permission: Permission }[];

export const MASTERS_ITEMS = [
  { href: "/masters/types", label: "types" },
  { href: "/masters/departments", label: "departments" },
  { href: "/masters/locations", label: "locations" },
] as const;

export const PURCHASE_ITEMS = [
  { href: "/purchase/orders", label: "orders" },
  { href: "/purchase/rfqs", label: "rfqs" },
  { href: "/purchase/contracts", label: "contracts" },
] as const;

export const DISPATCH_ITEMS = [
  { href: "/dispatch", label: "toDispatch", exact: true },
  { href: "/dispatch/challans", label: "challans" },
  { href: "/dispatch/receive", label: "receive" },
  { href: "/dispatch/overdue", label: "overdue" },
  { href: "/dispatch/lab-jobs", label: "labJobs" },
] as const;

export const PORTAL_ITEMS = [
  { href: "/vendor", label: "home", exact: true },
  { href: "/vendor/rfqs", label: "rfqs" },
  { href: "/vendor/orders", label: "orders" },
  { href: "/vendor/jobs", label: "jobs" },
  { href: "/vendor/certificates", label: "certificates" },
] as const;

export const VERIFICATION_ITEMS = [
  { href: "/verification", label: "queue", exact: true },
  { href: "/verification/oot", label: "ootCases" },
] as const;

export const REPORTS_ITEMS = [
  { href: "/reports", label: "auditPack", exact: true },
  { href: "/reports/vendors", label: "vendors" },
  { href: "/reports/spend", label: "spend" },
  { href: "/reports/aging", label: "aging" },
  { href: "/reports/lists", label: "lists" },
] as const;
