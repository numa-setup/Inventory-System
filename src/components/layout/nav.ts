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
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "manager"] },
  { label: "POS Billing", href: "/pos", icon: ShoppingCart },
  { label: "Products", href: "/products", icon: Package },
  { label: "Categories", href: "/categories", icon: FolderTree, roles: ["owner", "manager"] },
  { label: "Stock", href: "/stock", icon: Boxes, roles: ["owner", "manager"] },
  { label: "Purchasing", href: "/purchasing", icon: Truck, roles: ["owner", "manager"] },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Orders", href: "/orders", icon: ClipboardList, roles: ["owner", "manager"] },
  { label: "Storefront", href: "/storefront", icon: Store, roles: ["owner", "manager"] },
  { label: "Discounts", href: "/discounts", icon: Tag, roles: ["owner", "manager"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["owner", "manager"] },
  { label: "Settings", href: "/settings", icon: Settings, roles: ["owner"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((i) => !i.roles || i.roles.includes(role));
}
