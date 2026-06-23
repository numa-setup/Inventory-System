"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { ensureCatalog, getSnapshot, subscribe, type CatalogSnapshot } from "@/lib/catalog-cache";

/**
 * Subscribe to the shared local catalogue cache. Returns the current snapshot
 * (or null before the first hydrate). Triggers the load/reconcile on mount.
 */
export function useCatalog(): CatalogSnapshot | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  useEffect(() => {
    void ensureCatalog();
  }, []);
  return snapshot;
}
