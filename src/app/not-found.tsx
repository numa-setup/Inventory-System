import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-tile text-blue-icon">
          <Compass className="h-6 w-6" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Page not found</h2>
        <p className="mt-1 text-sm text-text-secondary">The page you’re looking for doesn’t exist.</p>
        <Link href="/admin/dashboard" className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
