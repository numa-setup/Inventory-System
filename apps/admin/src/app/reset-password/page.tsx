"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Store, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@hamza/shared/ui/Button";
import { Input, Label, FieldError } from "@hamza/shared/ui/Input";
import { resetPassword } from "@/features/auth/actions";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const validLink = !!email && !!token;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don’t match.");
    setLoading(true);
    const res = await resetPassword(email, token, password);
    setLoading(false);
    if ("error" in res) return setError(res.error);
    setDone(true);
    setTimeout(() => router.push("/login"), 1800);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-card"><Store className="h-7 w-7" /></div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Set a new password</h1>
          <p className="mt-1 text-sm text-text-tertiary">Hamza General Store</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          {done ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <ShieldCheck className="h-8 w-8 text-green-icon" />
              <p className="text-sm text-text-secondary">Password updated. Redirecting to sign in…</p>
            </div>
          ) : !validLink ? (
            <div className="text-center text-sm text-text-secondary">
              <p>This reset link is invalid or has expired.</p>
              <Button className="mt-4 w-full" onClick={() => router.push("/login")}>Back to sign in</Button>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="mb-4">
                <Label htmlFor="pw">New password</Label>
                <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <div className="mb-2">
                <Label htmlFor="cpw">Confirm password</Label>
                <Input id="cpw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required />
              </div>
              {error && <FieldError message={error} />}
              <Button type="submit" className="mt-5 w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />} {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
