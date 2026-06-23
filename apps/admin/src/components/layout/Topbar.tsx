"use client";

import { useState } from "react";
import { Menu, Moon, ScanLine, Sun, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "@hamza/shared/theme/ThemeProvider";
import { ConfirmDialog } from "@hamza/shared/ui/ConfirmDialog";
import { useScan } from "@/components/scan/ScanProvider";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsBell } from "./NotificationsBell";
import { Avatar } from "@hamza/shared/ui/Avatar";
import { signOutAdmin } from "@/features/auth/actions";

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
  const router = useRouter();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    await signOutAdmin();
    router.push("/login");
    router.refresh();
  }

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
        <NotificationsBell unread={unreadCount} />

        {/* Profile + sign out — one cohesive cluster */}
        <div className="ml-1.5 flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 py-1 pl-1 pr-1 sm:pl-1.5">
          <Avatar name={userName} size={32} />
          <div className="hidden text-left leading-tight sm:block">
            <div className="text-sm font-semibold text-text-primary">
              {userName}
            </div>
            <div className="text-[11px] capitalize text-text-tertiary">
              {roleLabel}
            </div>
          </div>

          {/* Sign out (asks for confirmation first) */}
          <button
            onClick={() => setConfirmOut(true)}
            className="group flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-coral-tile hover:text-coral-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-icon/40 sm:ml-0.5"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-[17px] w-[17px] transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOut}
        onCancel={() => setConfirmOut(false)}
        onConfirm={onSignOut}
        tone="danger"
        icon={<LogOut className="h-5 w-5" />}
        title="Log out?"
        message="You’ll need to sign in again with your email, password and the emailed code to get back into the admin portal."
        confirmLabel="Log out"
        cancelLabel="Cancel"
        loading={signingOut}
      />
    </header>
  );
}
