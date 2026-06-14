"use client";

import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Avatar } from "@/components/ui/Avatar";

export function Topbar({
  onMenu,
  userName,
  roleLabel,
  unreadCount = 0,
}: {
  onMenu: () => void;
  userName: string;
  roleLabel: string;
  unreadCount?: number;
}) {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-page/80 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-text-secondary hover:bg-surface-2 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input
          type="search"
          placeholder="Search products, orders, customers…"
          className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Dark toggle */}
        <button
          onClick={toggle}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-2"
          aria-label="Toggle dark mode"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-text-secondary hover:bg-surface-2"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-icon px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* Profile */}
        <div className="ml-1 flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-surface-2">
          <Avatar name={userName} size={34} />
          <div className="hidden text-left leading-tight sm:block">
            <div className="text-sm font-semibold text-text-primary">
              {userName}
            </div>
            <div className="text-[11px] capitalize text-text-tertiary">
              {roleLabel}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
