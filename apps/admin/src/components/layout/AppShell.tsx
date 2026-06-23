"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ScanProvider } from "@/components/scan/ScanProvider";
import type { Role } from "./nav";

export function AppShell({
  role,
  userName,
  unreadCount,
  storeName,
  logoUrl,
  children,
}: {
  role: Role;
  userName: string;
  unreadCount?: number;
  storeName?: string;
  logoUrl?: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ScanProvider>
      <div className="min-h-screen bg-page">
        <Sidebar
          role={role}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          storeName={storeName}
          logoUrl={logoUrl}
        />
        <div className="lg:pl-64">
          <Topbar
            onMenu={() => setMobileOpen(true)}
            userName={userName}
            roleLabel={role}
            unreadCount={unreadCount}
          />
          <main className="mx-auto min-w-0 max-w-[1400px] px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ScanProvider>
  );
}
