"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { Role } from "./nav";

export function AppShell({
  role,
  userName,
  unreadCount,
  children,
}: {
  role: Role;
  userName: string;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-page">
      <Sidebar
        role={role}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          userName={userName}
          roleLabel={role}
          unreadCount={unreadCount}
        />
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
