import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Truck,
  Users,
  Store,
  Tag,
  FolderTree,
  ClipboardList,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type Role = "owner" | "manager" | "cashier";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Omitted = everyone. */
  roles?: Role[];
}

export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, roles: ["owner", "manager"] },
  { label: "POS Billing", href: "/admin/pos", icon: ShoppingCart },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Categories", href: "/admin/categories", icon: FolderTree, roles: ["owner", "manager"] },
  { label: "Stock", href: "/admin/stock", icon: Boxes, roles: ["owner", "manager"] },
  { label: "Purchasing", href: "/admin/purchasing", icon: Truck, roles: ["owner", "manager"] },
  { label: "Customers", href: "/admin/customers", icon: Users },
  { label: "Orders", href: "/admin/orders", icon: ClipboardList, roles: ["owner", "manager"] },
  { label: "Storefront", href: "/admin/storefront", icon: Store, roles: ["owner", "manager"] },
  { label: "Discounts", href: "/admin/discounts", icon: Tag, roles: ["owner", "manager"] },
  { label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ["owner", "manager"] },
  { label: "Settings", href: "/admin/settings", icon: Settings, roles: ["owner"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((i) => !i.roles || i.roles.includes(role));
}
