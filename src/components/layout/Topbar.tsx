"use client";

import { Bell, Menu, Moon, ScanLine, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useScan } from "@/components/scan/ScanProvider";
import { GlobalSearch } from "./GlobalSearch";
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
  const { openCamera } = useScan();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-page/80 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-text-secondary hover:bg-surface-2 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Global instant search */}
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5">
        {/* Scan anywhere */}
        <button
          onClick={openCamera}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-2"
          aria-label="Scan barcode"
          title="Scan a barcode"
        >
          <ScanLine className="h-5 w-5" />
        </button>

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
