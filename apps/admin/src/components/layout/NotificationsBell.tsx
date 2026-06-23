"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2, ShoppingBag, CheckCheck, X, ExternalLink, Clock, Tag } from "lucide-react";
import { Button } from "@hamza/shared/ui/Button";
import { getAdminNotifications, markNotificationsRead, type AdminNotification } from "@/features/notifications/actions";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Human label for a notification event/type (e.g. "order.placed" → "Order placed"). */
function typeLabel(event: string): string {
  return event.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The in-app destination for a notification, if any. */
function relatedLink(n: AdminNotification): { href: string; label: string } | null {
  if (n.order_no || n.event.startsWith("order")) return { href: "/admin/orders", label: "Open order" };
  if (n.event.startsWith("stock") || n.event.includes("low_stock")) return { href: "/admin/stock", label: "Open stock" };
  if (n.event.startsWith("product")) return { href: "/admin/products", label: "Open product" };
  return null;
}

export function NotificationsBell({ unread: initialUnread }: { unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AdminNotification | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setUnread(initialUnread), [initialUnread]);
  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      setItems(await getAdminNotifications());
      setLoading(false);
    }
  }

  async function markAll() {
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    await markNotificationsRead();
    router.refresh();
  }

  async function openItem(n: AdminNotification) {
    // Open the detail panel and mark this one read (optimistically), keeping the
    // unread badge correct. The dropdown closes; the panel shows the full content.
    setOpen(false);
    const readAt = n.read_at ?? new Date().toISOString();
    setDetail({ ...n, read_at: readAt });
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: readAt } : x)));
      await markNotificationsRead([n.id]);
      router.refresh();
    }
  }

  function goToRelated(n: AdminNotification) {
    const link = relatedLink(n);
    setDetail(null);
    if (link) { router.push(link.href); router.refresh(); }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative rounded-lg p-2 text-text-secondary hover:bg-surface-2" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-icon px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-drawer">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold text-text-primary">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-text-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-text-tertiary">You’re all caught up.</div>
            ) : items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-surface-2 ${n.read_at ? "" : "bg-brand-50/40"}`}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-tile text-purple-text">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">{n.title}</span>
                    {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                  </div>
                  {n.body && <p className="line-clamp-2 text-xs text-text-tertiary">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-text-tertiary">{timeAgo(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setDetail(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="notif-title" className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-drawer animate-pop">
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-tile text-purple-text">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="notif-title" className="font-heading text-base font-semibold text-text-primary">{detail.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
                  <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" /> {typeLabel(detail.event)}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fullTime(detail.created_at)}</span>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                {detail.body || "No additional details."}
              </p>
              {detail.order_no && (
                <p className="mt-3 text-xs text-text-tertiary">Order <span className="font-medium text-text-primary">{detail.order_no}</span></p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
              {relatedLink(detail) && (
                <Button onClick={() => goToRelated(detail)}>
                  <ExternalLink className="h-4 w-4" /> {relatedLink(detail)!.label}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
