"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "@hamza/shared/theme/ThemeProvider";
import { ToastProvider } from "@hamza/shared/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000, // 1 min: revisiting a tab within a minute serves from cache
            gcTime: 30 * 60_000, // keep cached data for the whole working session so back-and-forth nav is instant
            refetchOnWindowFocus: false,
            refetchOnMount: false, // a freshly-mounted screen trusts the session cache; explicit invalidation refreshes after writes
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
